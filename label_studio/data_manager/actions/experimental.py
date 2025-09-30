"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging

from copy import copy, deepcopy
from data_manager.functions import DataManagerException
from core.utils.common import timestamp_now

logger = logging.getLogger(__name__)


def propagate_annotations(project, queryset, **kwargs):
    items = queryset.value_list('id', flat=True)

    if len(items) < 2:
        raise DataManagerException('请至少选择两个任务，系统将使用第一个任务的标注作为来源。')

    # check first annotation
    completed_task = items[0]
    task = project.target_storage.get(completed_task)
    if task is None or len(task.get('annotations', [])) == 0:
        raise DataManagerException(
            '首个选中的任务（ID = ' + str(completed_task) + '）需要至少包含一个标注才能进行传播。'
        )

    # get first annotation
    source_annotation = task['annotations'][0]

    # copy first annotation to new annotations for each task
    for i in items[1:]:
        task = project.target_storage.get(i)
        if task is None:
            task = project.source_storage.get(i)
        annotation = deepcopy(source_annotation)

        # start annotation id from task_id * 9000
        annotations = task.get('annotations', None) or [{'id': i * 9000}]
        annotation['id'] = max([c['id'] for c in annotations]) + 1
        annotation['created_at'] = timestamp_now()

        if 'annotations' not in task:
            task['annotations'] = []
        task['annotations'].append(annotation)

        project.target_storage.set(i, task)

    return {'response_code': 200}


def predictions_to_annotations(project, items, **kwargs):
    for i in items:
        task = project.source_storage.get(i)
        predictions = task.get('predictions', [])
        if len(predictions) == 0:
            continue

        prediction = predictions[-1]

        # load task with annotation from target storage
        task_with_annotations = project.target_storage.get(i)
        task = copy(task if task_with_annotations is None else task_with_annotations)

        annotations = task.get('annotations', None) or [{'id': i * 9000}]
        annotation = {
            'id': max([c['id'] for c in annotations]) + 1,
            'created_at': timestamp_now(),
            'lead_time': 0,
            'result': prediction.get('result', [])
        }

        if 'annotations' not in task:
            task['annotations'] = []
        task['annotations'].append(annotation)

        project.target_storage.set(i, task)

    return {'response_code': 200}


actions = [
    {
        'entry_point': propagate_annotations,
        'title': '传播标注',
        'order': 1,
        'experimental': True,
        'dialog': {
            'text': '该操作会选取首个选中任务的第一条标注，'
                    '为所有选中任务创建新的标注，'
                    '并将该标注传播到其他任务。' +
                    '.' * 80 +
                    '1. 为任务 A 创建第一条标注。'
                    '2. 使用复选框将任务 A 设为首个选中项。'
                    '3. 选择希望复制任务 A 首条标注的其他任务。'
                    '4. 点击“传播标注”。' +
                    '.' * 80 +
                    '！警告：这是实验性功能！它在 Choices 等选择型标注上表现较好，'
                    '但在 RectangleLabels、Text Labels 等其他标注类型上可能会出现诸多问题。',
            'type': 'confirm'
        }
    },

    {
        'entry_point': predictions_to_annotations,
        'title': '预测结果 => 标注',
        'order': 1,
        'experimental': True,
        'dialog': {
            'text': '该操作会基于每个选中任务的最新预测创建新的标注。',
            'type': 'confirm'
        }
    }
]
