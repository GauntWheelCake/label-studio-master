"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import shutil
import io
import hashlib
import ujson as json
import logging
import os
import random
import urllib.parse
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

logger = logging.getLogger(__name__)


# Formats where the converter is expected to place source images next to
# annotations (e.g. YOLO/COCO/VOC). If the converter silently fails to copy
# an image, we fall back to copying it ourselves from the task data.
_IMAGE_INCLUDING_FORMATS = {'YOLO', 'COCO', 'VOC'}


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
        """URL-decode and normalize local file paths in task data.

        Uploaded file URLs may be stored as absolute URLs like
        ``http://host:7000/data/upload/...``. Strip the configured hostname so
        the converter reads them from the local upload directory instead of
        making an authenticated HTTP request back to itself.
        """
        hostname = getattr(settings, 'HOSTNAME', '') or ''
        for task in tasks:
            task_data = task.get('data')
            if isinstance(task_data, dict):
                for key, value in task_data.items():
                    if not isinstance(value, str):
                        continue
                    if value.startswith('/data/'):
                        task_data[key] = unquote(value)
                    elif hostname and value.startswith(hostname + '/data/'):
                        task_data[key] = unquote(value[len(hostname):])
            elif isinstance(task_data, str) and task_data.startswith('/data/'):
                task['data'] = unquote(task_data)
            elif isinstance(task_data, str) and hostname and task_data.startswith(hostname + '/data/'):
                task['data'] = unquote(task_data[len(hostname):])
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
    def _get_image_data_keys(project):
        """Return task data keys that correspond to Image input tags."""
        try:
            config = project.get_parsed_config()
        except Exception:
            return []

        keys = set()
        for control_info in config.values():
            for input_info in control_info.get('inputs', []):
                if input_info.get('type') == 'Image':
                    value = input_info.get('value', '')
                    if value.startswith('$'):
                        value = value[1:]
                    if value:
                        keys.add(value)
        return list(keys)

    @staticmethod
    def _resolve_image_source_path(url, upload_dir):
        """Resolve a task image URL to a readable local file path.

        Supports uploaded files (`/data/upload/...` or the same host prefixed
        with `http(s)://<host>/data/upload/...`) and local file storage
        (`/data/local-files/?d=...`). Remote URLs are left to the converter.
        """
        if not isinstance(url, str):
            return None

        # Normalize full URLs pointing to this Label Studio instance back to
        # the relative /data/upload/... path so we can read them locally.
        if url.startswith(('http://', 'https://')):
            try:
                parsed = urllib.parse.urlparse(url)
                path = parsed.path
            except Exception:
                return None
        else:
            path = url

        path = path.split('?')[0] if path.startswith('/data/upload/') else path

        if path.startswith('/data/upload/'):
            filename = path.replace('/data/upload/', '')
            resolved = os.path.join(upload_dir, filename)
            return resolved if os.path.exists(resolved) else None

        if path.startswith('/data/') and '?d=' in url:
            try:
                # LS local-files URLs encode the full file path in ?d=.
                # The text before ?d= is irrelevant (commonly "local-files").
                _, dir_path = url.split('/data/', 1)[-1].split('?d=')
                dir_path = urllib.parse.unquote(dir_path)
                if os.path.isfile(dir_path):
                    return dir_path
                # Fallback: treat the last segment as filename inside the dir.
                filename = os.path.basename(url.split('?d=')[0])
                resolved = os.path.join(dir_path, filename)
                return resolved if os.path.exists(resolved) else None
            except Exception:
                logger.exception('Failed to resolve local file URL: %s', url)
                return None

        if os.path.isabs(path) and os.path.exists(path):
            return path

        return None

    @staticmethod
    def _copy_task_images_to_output(tasks, project, output_dir):
        """Copy source images referenced by tasks into output_dir/images.

        label-studio-converter 0.0.29 silently skips images it cannot resolve.
        This fallback ensures YOLO/COCO/VOC exports contain the original image
        files whenever they are available locally.
        """
        image_keys = DataExport._get_image_data_keys(project)
        if not image_keys:
            return

        upload_dir = os.path.join(settings.MEDIA_ROOT, settings.UPLOAD_DIR)
        images_dir = os.path.join(output_dir, 'images')
        os.makedirs(images_dir, exist_ok=True)

        copied = 0
        missing = []
        for task in tasks:
            task_data = task.get('data', {})
            for key in image_keys:
                url = task_data.get(key)
                src = DataExport._resolve_image_source_path(url, upload_dir)
                if not src:
                    if isinstance(url, str) and url:
                        missing.append(url)
                    continue
                basename = os.path.basename(src)
                if not basename:
                    continue
                dst = os.path.join(images_dir, basename)
                if os.path.exists(dst):
                    continue
                try:
                    shutil.copy2(src, dst)
                    copied += 1
                except Exception:
                    logger.exception('Failed to copy image %s to export output', src)

        if missing:
            logger.warning(
                'Could not resolve %d image source(s) for export; remote or unmapped URLs will be skipped: %s',
                len(missing), missing[:5]
            )
        if copied:
            logger.info('Copied %d source images into export output %s', copied, images_dir)

    @staticmethod
    def generate_export_file(project, tasks, output_format, get_args, split_enabled=False, split_ratios=None, return_files=False, output_dir=None):
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

        # When the caller needs to read the generated files after this method
        # returns (return_files=True), it can supply a persistent output_dir.
        # Otherwise we use a self-cleaning temporary directory for streaming.
        if output_dir:
            tmp_dir = output_dir
            os.makedirs(tmp_dir, exist_ok=True)
            temp_dir_cm = None
        else:
            temp_dir_cm = get_temp_dir()
            tmp_dir = temp_dir_cm.__enter__()

        try:
            needs_images = str(output_format).upper() in _IMAGE_INCLUDING_FORMATS
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
                    if needs_images:
                        DataExport._copy_task_images_to_output(split_tasks, project, split_dir)
                    # Remove the intermediate input.json so only the converted result remains.
                    if os.path.exists(split_input_json):
                        os.remove(split_input_json)
            else:
                converter.convert(input_json, tmp_dir, output_format, is_dir=False)
                if needs_images:
                    DataExport._copy_task_images_to_output(tasks, project, tmp_dir)

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
        finally:
            if temp_dir_cm is not None:
                temp_dir_cm.__exit__(None, None, None)
