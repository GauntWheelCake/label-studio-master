"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import shutil
import io
import hashlib
import ujson as json
import os
import random
from datetime import datetime
from copy import deepcopy
from urllib.parse import unquote

from django.conf import settings
from django.db import models
from label_studio_converter import Converter
from core.utils.io import get_temp_dir, read_bytes_stream, get_all_files_from_dir
from core.label_config import parse_config
from core import version
from tasks.models import Annotation
# Create your models here.


class DataExport(object):

    @staticmethod
    def save_export_files(project, now, get_args, data, md5, name):
        """ Generate two files: meta info and result file and store them locally for logging
        """
        filename_results = os.path.join(settings.EXPORT_DIR, name + '.json')
        filename_info = os.path.join(settings.EXPORT_DIR, name + '-info.json')
        annotation_number = Annotation.objects.filter(task__project=project).count()
        info = {
            'project': {
                'title': project.title,
                'id': project.id,
                'created_at': project.created_at.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'created_by': project.created_by.email,
                'task_number': project.tasks.count(),
                'annotation_number': annotation_number
            },
            'platform': {
                'version': version.get_git_version()
            },
            'download': {
                'GET': dict(get_args),
                'time': now.strftime('%Y-%m-%dT%H:%M:%SZ'),
                'result_filename': filename_results,
                'md5': md5
            }
        }

        with open(filename_results, 'w', encoding='utf-8') as f:
            f.write(data)
        with open(filename_info, 'w', encoding='utf-8') as f:
            json.dump(info, f, ensure_ascii=False)
        return filename_results

    @staticmethod
    def get_export_formats(project):
        converter = Converter(config=project.get_parsed_config(), project_dir=None)
        formats = []
        supported_formats = set(converter.supported_formats)
        for format, format_info in converter.all_formats().items():
            format_info = deepcopy(format_info)
            format_info['name'] = format.name
            if format.name not in supported_formats:
                format_info['disabled'] = True
            formats.append(format_info)
        return sorted(formats, key=lambda f: f.get('disabled', False))

    @staticmethod
    def _decode_task_urls(tasks):
        """URL-decode local file paths in task data so external converters can read them from disk."""
        for task in tasks:
            task_data = task.get('data')
            if isinstance(task_data, dict):
                for key, value in task_data.items():
                    if isinstance(value, str) and value.startswith('/data/'):
                        task_data[key] = unquote(value)
            elif isinstance(task_data, str) and task_data.startswith('/data/'):
                task['data'] = unquote(task_data)
        return tasks

    @staticmethod
    def _split_task_ids(task_ids, ratios, seed):
        """Shuffle task ids and split them into train/val/test folders.

        The ratios are normalized automatically, so they do not have to sum to
        exactly 100. Splits with a ratio of 0 receive no tasks, and rounding
        drift is resolved by giving/stealing from the largest split(s).

        Args:
            task_ids: Iterable of task ids.
            ratios: Dict like {'train': 80, 'val': 10, 'test': 10}.
            seed: Seed for reproducible shuffling.

        Returns:
            Dict mapping split name to list of task ids.
        """
        ids = list(task_ids)
        rng = random.Random(seed)
        rng.shuffle(ids)

        names = ['train', 'val', 'test']
        raw_ratios = {name: max(0, float(ratios.get(name, 0) or 0)) for name in names}
        total = sum(raw_ratios.values())
        if total <= 0 or not ids:
            return {name: [] for name in names}

        n = len(ids)
        # First pass: assign counts by rounding the normalized share.
        counts = {
            name: int(round(n * raw_ratios[name] / total))
            for name in names
        }

        # Second pass: fix rounding drift without forcing every split to 1.
        drift = n - sum(counts.values())
        if drift != 0:
            for name in sorted(names, key=lambda k: raw_ratios[k], reverse=True):
                if drift == 0:
                    break
                if drift > 0:
                    counts[name] += 1
                    drift -= 1
                elif counts[name] > 0:
                    counts[name] -= 1
                    drift += 1

        splits = {}
        idx = 0
        for name in names:
            count = max(0, min(counts[name], n - idx))
            splits[name] = ids[idx:idx + count]
            idx += count

        return splits

    @staticmethod
    def generate_export_file(project, tasks, output_format, get_args, split_enabled=False, split_ratios=None, return_files=False):
        # prepare for saving
        now = datetime.now()
        tasks = DataExport._decode_task_urls(tasks)
        data = json.dumps(tasks, ensure_ascii=False)
        md5 = hashlib.md5(json.dumps(data).encode('utf-8')).hexdigest()
        name = 'project-' + str(project.id) + '-at-' + now.strftime('%Y-%m-%d-%H-%M') + f'-{md5[0:8]}'

        input_json = DataExport.save_export_files(project, now, get_args, data, md5, name)
        converter = Converter(
            config=project.get_parsed_config(),
            project_dir=None,
            upload_dir=os.path.join(settings.MEDIA_ROOT, settings.UPLOAD_DIR))
        with get_temp_dir() as tmp_dir:
            if split_enabled and split_ratios:
                task_ids = [t['id'] for t in tasks]
                splits = DataExport._split_task_ids(task_ids, split_ratios, seed=project.id)
                task_by_id = {t['id']: t for t in tasks}
                for split_name, split_ids in splits.items():
                    split_dir = os.path.join(tmp_dir, split_name)
                    os.makedirs(split_dir, exist_ok=True)
                    split_tasks = [task_by_id[task_id] for task_id in split_ids]
                    split_input_json = os.path.join(split_dir, 'input.json')
                    with open(split_input_json, 'w', encoding='utf-8') as f:
                        f.write(json.dumps(split_tasks, ensure_ascii=False))
                    converter.convert(split_input_json, split_dir, output_format, is_dir=False)
                    # Remove the intermediate input.json so only the converted result remains.
                    if os.path.exists(split_input_json):
                        os.remove(split_input_json)
            else:
                converter.convert(input_json, tmp_dir, output_format, is_dir=False)

            if return_files:
                result_files = []
                for root, _, filenames in os.walk(tmp_dir):
                    for filename in filenames:
                        abs_path = os.path.join(root, filename)
                        rel_path = os.path.relpath(abs_path, tmp_dir).replace('\\', '/')
                        result_files.append((abs_path, rel_path))
                return result_files, None, None

            files = get_all_files_from_dir(tmp_dir)
            # if only one file is exported - no need to create archive
            if len(os.listdir(tmp_dir)) == 1:
                output_file = files[0]
                ext = os.path.splitext(output_file)[-1]
                content_type = f'application/{ext}'
                out = read_bytes_stream(output_file)
                filename = name + os.path.splitext(output_file)[-1]
                return out, content_type, filename

            # otherwise pack output directory into archive
            shutil.make_archive(tmp_dir, 'zip', tmp_dir)
            out = read_bytes_stream(os.path.abspath(tmp_dir + '.zip'))
            content_type = 'application/zip'
            filename = name + '.zip'
            return out, content_type, filename
