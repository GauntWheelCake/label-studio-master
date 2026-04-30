"""Basic actions for tasks and annotations provided by data manager."""
from django.db.models import signals

from core.utils.common import temporary_disconnect_all_signals, temporary_disconnect_signal
from data_manager.functions import evaluate_predictions
from ml.models import MLBackendState
from tasks.models import Annotation, Prediction, Task, update_is_labeled_after_removing_annotation


def retrieve_tasks_predictions(project, queryset, **kwargs):
    """Retrieve predictions by task ids and present them as AI drafts."""
    ml_backends = list(project.ml_backends.all())
    if not ml_backends:
        return {
            'response_code': 400,
            'detail': '还没有连接智能标注模型，请先在“项目设置 > 智能标注”中连接模型服务。',
        }

    connected_backends = []
    for ml_backend in ml_backends:
        ml_backend.update_state()
        if ml_backend.state == MLBackendState.CONNECTED:
            connected_backends.append(ml_backend)

    if not connected_backends:
        return {
            'response_code': 400,
            'detail': '当前智能标注模型均未连接，请先在“项目设置 > 智能标注”中重新连接可用的模型服务。',
        }

    task_ids = list(queryset.values_list('id', flat=True))
    before_count = Prediction.objects.filter(task__id__in=task_ids).count()

    evaluate_predictions(queryset, connected_backends)

    after_count = Prediction.objects.filter(task__id__in=task_ids).count()
    created_count = max(after_count - before_count, 0)

    return {
        'processed_items': queryset.count(),
        'detail': 'AI 初稿生成完成：已处理 ' + str(queryset.count()) + ' 条任务，新增 ' + str(created_count) + ' 条 AI 初稿。'
    }


def delete_tasks(project, queryset, **kwargs):
    """Delete tasks by ids."""
    count = queryset.count()

    if count == project.tasks.count():
        with temporary_disconnect_all_signals():
            queryset.delete()

        project.summary.reset()
        project.update_tasks_states(
            maximum_annotations_changed=False,
            overlap_cohort_percentage_changed=False,
            tasks_number_changed=True
        )
    else:
        with temporary_disconnect_signal(signals.post_delete, update_is_labeled_after_removing_annotation, Annotation):
            queryset.delete()

    reload = False
    if not project.tasks.exists():
        project.views.all().delete()
        reload = True

    return {
        'processed_items': count,
        'reload': reload,
        'detail': '已删除 ' + str(count) + ' 条任务。'
    }


def delete_tasks_annotations(project, queryset, **kwargs):
    """Delete all annotations by task ids."""
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
        'detail': '已删除 ' + str(count) + ' 条标注。'
    }


def delete_tasks_predictions(project, queryset, **kwargs):
    """Delete all predictions by task ids."""
    if project.evaluate_predictions_automatically:
        project.evaluate_predictions_automatically = False
        project.save(update_fields=['evaluate_predictions_automatically'])

    task_ids = queryset.values_list('id', flat=True)
    predictions = Prediction.objects.filter(task__id__in=task_ids)
    count = predictions.count()
    predictions.delete()

    return {
        'processed_items': count,
        'detail': '已删除 ' + str(count) + ' 条 AI 初稿。'
    }


actions = [
    {
        'entry_point': retrieve_tasks_predictions,
        'title': '生成 AI 初稿',
        'order': 90,
        'permissions': 'can_manage_annotations',
        'dialog': {
            'text': '将为当前选中的任务生成 AI 初稿。生成后需要人工确认或修改，才会成为正式标注。',
            'type': 'confirm'
        }
    },
    {
        'entry_point': delete_tasks,
        'title': '删除任务',
        'order': 100,
        'permissions': 'can_delete_tasks',
        'reload': True,
        'dialog': {
            'text': '确定要删除选中的任务吗？此操作无法撤销。',
            'type': 'confirm'
        }
    },
    {
        'entry_point': delete_tasks_annotations,
        'title': '删除标注',
        'order': 101,
        'permissions': 'can_manage_annotations',
        'dialog': {
            'text': '确定要删除选中任务中的全部标注吗？此操作无法撤销。',
            'type': 'confirm'
        }
    },
    {
        'entry_point': delete_tasks_predictions,
        'title': '删除 AI 初稿',
        'order': 102,
        'permissions': 'can_manage_annotations',
        'dialog': {
            'text': '确定要删除选中任务中的全部 AI 初稿吗？此操作无法撤销。',
            'type': 'confirm'
        }
    }
]
