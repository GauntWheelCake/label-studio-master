"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
from django.db.models import signals

from tasks.models import Annotation, Prediction, Task, update_is_labeled_after_removing_annotation
from core.utils.common import temporary_disconnect_signal, temporary_disconnect_all_signals

from data_manager.functions import evaluate_predictions


def retrieve_tasks_predictions(project, queryset, **kwargs):
    """ Retrieve predictions by tasks ids

    :param project: project instance
    :param queryset: filtered tasks db queryset
    """
    evaluate_predictions(queryset)
    return {
        'processed_items': queryset.count(),
        'detail': '已拉取 ' + str(queryset.count()) + ' 条预测结果'
    }


def delete_tasks(project, queryset, **kwargs):
    """ Delete tasks by ids

    :param project: project instance
    :param queryset: filtered tasks db queryset
    """
    count = queryset.count()

    # delete all project tasks
    if count == project.tasks.count():
        with temporary_disconnect_all_signals():
            queryset.delete()

        project.summary.reset()
        project.update_tasks_states(
            maximum_annotations_changed=False,
            overlap_cohort_percentage_changed=False,
            tasks_number_changed=True
        )

    # delete only specific tasks
    else:
        # this signal re-save the task back
        with temporary_disconnect_signal(signals.post_delete, update_is_labeled_after_removing_annotation, Annotation):
            queryset.delete()

    # remove all tabs if there are no tasks in project
    reload = False
    if not project.tasks.exists():
        project.views.all().delete()
        reload = True

    return {
        'processed_items': count,
        'reload': reload,
        'detail': '已删除 ' + str(count) + ' 个任务'
    }


def delete_tasks_annotations(project, queryset, **kwargs):
    """ Delete all annotations by tasks ids

    :param project: project instance
    :param queryset: filtered tasks db queryset
    """
    task_ids = list(queryset.values_list('id', flat=True))
    annotations = Annotation.objects.filter(task__id__in=task_ids)
    count = annotations.count()
    annotations.delete()
    if task_ids:
        Task.objects.filter(id__in=task_ids).update(
            review_status=Task.ReviewStatus.PENDING,
            review_comment='',
        )
    return {
        'processed_items': count,
        'detail': '已删除 ' + str(count) + ' 条标注'
    }


def delete_tasks_predictions(project, queryset, **kwargs):
    """ Delete all predictions by tasks ids

    :param project: project instance
    :param queryset: filtered tasks db queryset
    """
    task_ids = queryset.values_list('id', flat=True)
    predictions = Prediction.objects.filter(task__id__in=task_ids)
    count = predictions.count()
    predictions.delete()
    return {
        'processed_items': count,
        'detail': '已删除 ' + str(count) + ' 条预测结果'
    }


actions = [
    {
        'entry_point': retrieve_tasks_predictions,
        'title': '拉取预测结果',
        'order': 90,
        'permissions': 'can_manage_annotations',
        'dialog': {
            'text': '将所选任务发送至项目已连接的全部机器学习后端。'
                    '此操作可能因超时而被中断。'
                    '查看文档了解更多。'
                    '请确认您的操作。',
            'type': 'confirm'
        }
    },
    {
        'entry_point': delete_tasks,
        'title': '删除任务', 'order': 100,
        'permissions': 'can_delete_tasks',
        'reload': True,
        'dialog': {
            'text': '将删除所选任务，请确认您的操作。',
            'type': 'confirm'
        }
    },
    {
        'entry_point': delete_tasks_annotations,
        'title': '删除标注',
        'order': 101,
        'permissions': 'can_manage_annotations',
        'dialog': {
            'text': '将删除所选任务的全部标注，请确认您的操作。',
            'type': 'confirm'
        }
    },
    {
        'entry_point': delete_tasks_predictions,
        'title': '删除预测结果',
        'order': 102,
        'permissions': 'can_manage_annotations',
        'dialog': {
            'text': '将删除所选任务的全部预测结果，请确认您的操作。',
            'type': 'confirm'
        }
    }
]
