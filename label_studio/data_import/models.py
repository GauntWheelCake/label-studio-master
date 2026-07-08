"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import os
import io
import logging
import pandas as pd
import htmlmin
from collections import Counter
try:
    import ujson as json
except:
    import json

from django.db import models
from django.conf import settings
from rest_framework.exceptions import ValidationError

logger = logging.getLogger(__name__)

TEXT_ENCODING = 'utf-8-sig'


def _read_utf8_text(filepath):
    try:
        with io.open(filepath, encoding=TEXT_ENCODING) as f:
            return f.read()
    except UnicodeError as exc:
        raise ValidationError(
            '文件内容无法按 UTF-8 编码读取。系统当前仅支持 UTF-8 文本/表格文件；'
            '如果文件来自 Excel、旧版 Windows 软件或其他系统，可能保存为了 GBK、GB18030、Big5 或 UTF-16。'
            '请先在本地将文件另存为 UTF-8 编码后再重新导入。'
        ) from exc


def _read_utf8_csv(filepath, sep=','):
    try:
        return pd.read_csv(filepath, sep=sep, encoding=TEXT_ENCODING).fillna('').to_dict('records')
    except UnicodeError as exc:
        raise ValidationError(
            '表格文件无法按 UTF-8 编码读取。系统当前仅支持 UTF-8 CSV/TSV 文件；'
            '如果文件来自 Excel、旧版 Windows 软件或其他系统，可能保存为了 GBK、GB18030、Big5 或 UTF-16。'
            '请先在本地将 CSV/TSV 另存为 UTF-8 编码后再重新导入。'
        ) from exc


class FileUpload(models.Model):
    user = models.ForeignKey('users.User', related_name='file_uploads', on_delete=models.CASCADE)
    project = models.ForeignKey('projects.Project', related_name='file_uploads', on_delete=models.CASCADE)
    file = models.FileField(upload_to=settings.UPLOAD_DIR)

    def delete(self, *args, **kwargs):
        """Delete the physical file from storage before removing the DB row."""
        try:
            self.file.delete(save=False)
        except Exception as exc:
            logger.warning('Failed to delete uploaded file %s: %s', self.file.name, exc)
        super().delete(*args, **kwargs)

    @property
    def filepath(self):
        return self.file.path

    @property
    def url(self):
        if settings.HOSTNAME:
            return settings.HOSTNAME + self.file.url
        else:
            return self.file.url

    @property
    def format(self):
        filepath = self.file.path
        try:
            file_format = os.path.splitext(filepath)[-1]
        except:
            file_format = None
        finally:
            logger.debug('Get file format ' + file_format)
        return file_format

    @property
    def content(self):
        return _read_utf8_text(self.filepath)

    def read_tasks_list_from_csv(self, sep=','):
        logger.debug('Read tasks list from CSV file {}'.format(self.filepath))
        tasks = _read_utf8_csv(self.filepath, sep=sep)
        tasks = [{'data': task} for task in tasks]
        return tasks

    def read_tasks_list_from_tsv(self):
        return self.read_tasks_list_from_csv('\t')

    def read_tasks_list_from_txt(self):
        logger.debug('Read tasks list from text file {}'.format(self.filepath))
        lines = self.content.splitlines()
        tasks = [{'data': {settings.DATA_UNDEFINED_NAME: line}} for line in lines]
        return tasks

    def read_tasks_list_from_json(self):
        logger.debug('Read tasks list from JSON file {}'.format(self.filepath))
        fileprefix = os.path.basename(self.filepath)
        raw_data = self.content
        # Python 3.5 compatibility fix https://docs.python.org/3/whatsnew/3.6.html#json
        try:
            tasks = json.loads(raw_data)
        except TypeError:
            tasks = json.loads(raw_data.decode('utf8'))
        if isinstance(tasks, dict):
            tasks = [tasks]
        tasks_formatted = []
        for i, task in enumerate(tasks):
            if not task.get('data'):
                task = {'data': task}
            if not isinstance(task['data'], dict):
                raise ValidationError('Task item should be dict')
            tasks_formatted.append(task)
        return tasks_formatted

    def read_task_from_hypertext_body(self):
        logger.debug('Read 1 task from hypertext file {}'.format(self.filepath))
        data = self.content
        body = htmlmin.minify(data, remove_all_empty_space=True)
        tasks = [{'data': {settings.DATA_UNDEFINED_NAME: body}}]
        return tasks

    def read_task_from_uploaded_file(self):
        logger.debug('Read 1 task from uploaded file {}'.format(self.filepath))
        tasks = [{'data': {settings.DATA_UNDEFINED_NAME: self.url}}]
        return tasks

    @property
    def format_could_be_tasks_list(self):
        return self.format in ('.csv', '.tsv', '.txt')

    def read_tasks(self, file_as_tasks_list=True):
        file_format = self.format
        try:
            # file as tasks list
            if file_format == '.csv' and file_as_tasks_list:
                tasks = self.read_tasks_list_from_csv()
            elif file_format == '.tsv' and file_as_tasks_list:
                tasks = self.read_tasks_list_from_tsv()
            elif file_format == '.txt' and file_as_tasks_list:
                tasks = self.read_tasks_list_from_txt()
            elif file_format == '.json':
                tasks = self.read_tasks_list_from_json()

            # otherwise - only one object tag should be presented in label config
            elif not self.project.one_object_in_label_config:
                raise ValidationError(
                    'Your label config has more than one data key and direct file upload supports only '
                    'one data key. To import data with multiple data keys, use a JSON or CSV file.')

            # file as a single asset
            elif file_format in ('.html', '.htm', '.xml'):
                tasks = self.read_task_from_hypertext_body()
            else:
                tasks = self.read_task_from_uploaded_file()

        except ValidationError:
            raise
        except Exception as exc:
            raise ValidationError('导入文件解析失败：' + os.path.basename(self.filepath) + '。原因：' + str(exc))
        return tasks

    @classmethod
    def load_tasks_from_uploaded_files(cls, project, file_upload_ids=None, formats=None, files_as_tasks_list=True, trim_size=None):
        tasks = []
        fileformats = []
        common_data_fields = set()

        # scan all files
        file_uploads = FileUpload.objects.filter(project=project)
        if file_upload_ids:
            file_uploads = file_uploads.filter(id__in=file_upload_ids)
        for file_upload in file_uploads:
            file_format = file_upload.format
            if formats and file_format not in formats:
                continue
            new_tasks = file_upload.read_tasks(files_as_tasks_list)
            for task in new_tasks:
                task['file_upload_id'] = file_upload.id

            new_data_fields = set(iter(new_tasks[0]['data'].keys())) if len(new_tasks) > 0 else set()
            if not common_data_fields:
                common_data_fields = new_data_fields
            elif not common_data_fields.intersection(new_data_fields):
                raise ValidationError(
                    _old_vs_new_data_keys_inconsistency_message(
                        new_data_fields, common_data_fields, file_upload.filepath))
            else:
                common_data_fields &= new_data_fields

            tasks += new_tasks
            fileformats.append(file_format)

            if trim_size is not None:
                if len(tasks) > trim_size:
                    break

        return tasks, dict(Counter(fileformats)), common_data_fields


def _old_vs_new_data_keys_inconsistency_message(new_data_keys, old_data_keys, current_file):
    new_data_keys_list = ','.join(new_data_keys)
    old_data_keys_list = ','.join(old_data_keys)
    common_prefix = "导入的数据字段不一致：\n"
    if new_data_keys_list == old_data_keys_list:
        return ''
    elif new_data_keys_list == settings.DATA_UNDEFINED_NAME:
        return common_prefix + "当前单文件 {0} 与其他文件中的数据字段冲突：\n\"{1}\"".format(
                                current_file, old_data_keys_list)
    elif old_data_keys_list == settings.DATA_UNDEFINED_NAME:
        return common_prefix + "当前表格文件 {0} 的字段 {1} 与已上传的图片、音频等单文件任务冲突。".format(
                                current_file, new_data_keys_list)
    else:
        return common_prefix + "当前表格文件 \"{0}\" 的字段 \"{1}\" 与其他文件中的字段冲突：\n\"{2}\"".format(
                                current_file, new_data_keys_list, old_data_keys_list)
