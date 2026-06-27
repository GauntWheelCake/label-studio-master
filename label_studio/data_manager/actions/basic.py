"""Basic actions for tasks and annotations provided by data manager."""
from django.db.models import signals

from core.utils.common import temporary_disconnect_all_signals, temporary_disconnect_signal
from data_manager.functions import evaluate_predictions
from ml.models import MLBackendState
from tasks.models import Annotation, Prediction, Task, update_is_labeled_after_removing_annotation


def _get_requested_ml_backend_id(request):
    if request is None:
        return None
    data = getattr(request, 'data', {}) or {}
    backend_id = data.get('ml_backend_id')
    if backend_id in (None, ''):
        return None
    try:
        return int(backend_id)
    except (TypeError, ValueError):
        return None


def _select_prediction_backend(project, connected_backends, request):
    requested_backend_id = _get_requested_ml_backend_id(request)

    if requested_backend_id is None:
        if len(connected_backends) == 1:
            return connected_backends[0], None
        return None, {
            'response_code': 400,
            'detail': '当前项目连接了多个智能标注模型，请先选择一个模型后再进行智能预标注。',
        }

    project_backend_ids = {backend.id for backend in project.ml_backends.all()}
    if requested_backend_id not in project_backend_ids:
        return None, {
            'response_code': 400,
            'detail': '选择的智能标注模型不属于当前项目，请刷新页面后重新选择。',
        }

    for backend in connected_backends:
        if backend.id == requested_backend_id:
            return backend, None

    return None, {
        'response_code': 400,
        'detail': '选择的智能标注模型当前未连接，请先在“项目设置 > 智能标注”中检查模型服务。',
    }


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

    request = kwargs.get('request')
    user = request.user if request is not None else None
    selected_backend, selection_error = _select_prediction_backend(project, connected_backends, request)
    if selection_error:
        return selection_error

    prediction_summary = evaluate_predictions(queryset, [selected_backend], user=user)

    after_count = Prediction.objects.filter(task__id__in=task_ids).count()
    created_count = max(after_count - before_count, 0)
    failures = prediction_summary.get('failures', [])
    failed_count = prediction_summary.get('failed_predictions', len(failures))

    detail = 'AI 初稿生成完成：已处理 ' + str(queryset.count()) + ' 条任务，新增 ' + str(created_count) + ' 条 AI 初稿。'
    if failed_count:
        preview = failures[:5]
        failure_lines = []
        for failure in preview:
            task_id = failure.get('task_id', '-')
            message = failure.get('message') or failure.get('code') or '未知错误'
            failure_lines.append('Task ' + str(task_id) + '：' + str(message))
        detail += '\n失败 ' + str(failed_count) + ' 条。'
        if failure_lines:
            detail += '\n' + '\n'.join(failure_lines)
        if failed_count > len(preview):
            detail += '\n其余 ' + str(failed_count - len(preview)) + ' 条失败已写入服务日志。'

    return {
        'processed_items': queryset.count(),
        'created_predictions': created_count,
        'failed_predictions': failed_count,
        'failures': failures,
        'ml_backend_id': selected_backend.id,
        'ml_backend_title': selected_backend.title,
        'ml_backend_url': selected_backend.url,
        'detail': detail
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
