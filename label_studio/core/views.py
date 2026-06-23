"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import os
import io
import sys
import json
import logging

import pandas as pd

from django.conf import settings
from django.contrib.auth import logout
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseServerError, HttpResponseForbidden
from django.views.decorators.http import require_http_methods
from django.shortcuts import redirect, reverse, render
from django.template import loader
from django.views.static import serve
from django.http import JsonResponse
from wsgiref.util import FileWrapper

from core import utils
from core.utils.params import get_env
from core.label_config import generate_time_series_json
from core.utils.common import collect_versions
from projects.models import Project
from ml.models import MLBackend
from tasks.models import Task
from tasks.serializers import TaskSimpleSerializer, PredictionSerializer

logger = logging.getLogger(__name__)


def main(request):
    if settings.ENABLE_SHARED_ADMIN_MODE:
        return redirect(reverse('projects:project-index'))

    user = request.user

    if user.is_authenticated:

        if user.active_organization is None and 'organization_pk' not in request.session:
            logout(request)
            return redirect(reverse('user-login'))

        # business mode access
        redirect_url = reverse('projects:project-index')
        token = request.GET.get('token')
        if token:
            redirect_url = f'{redirect_url}?token={token}'
        return redirect(redirect_url)

    # not authenticated
    return redirect(reverse('user-login'))


def version_page(request):
    """ Get platform version
    """
    # update latest version from pypi response
    # from label_studio.core.utils.common import check_for_the_latest_version
    # check_for_the_latest_version(print_message=False)

    http_page = request.path == '/version/'
    result = collect_versions(force=http_page)

    # html / json response
    if request.path == '/version/':
        # other settings from backend
        if request.user.is_superuser:
            result['settings'] = {key: str(getattr(settings, key)) for key in dir(settings)
                                  if not key.startswith('_') and not hasattr(getattr(settings, key), '__call__')}

        result = json.dumps(result, indent=2)
        result = result.replace('},', '},\n').replace('\\n', ' ').replace('\\r', '')
        return HttpResponse('<pre>' + result + '</pre>')
    else:
        return JsonResponse(result)


def health(request):
    """ System health info """
    logger.debug('Got /health request.')
    return HttpResponse(json.dumps({
        "status": "UP"
    }))


def metrics(request):
    """ Empty page for metrics evaluation """
    return HttpResponse('')


def editor_files(request):
    """ Get last editor files
    """
    response = utils.common.find_editor_files()
    return HttpResponse(json.dumps(response), status=200)


def custom_500(request):
    """ Custom 500 page """
    t = loader.get_template('500.html')
    type_, value, tb = sys.exc_info()
    return HttpResponseServerError(t.render({'exception': value}))


def samples_time_series(request):
    """ Generate time series example for preview
    """
    time_column = request.GET.get('time', '')
    value_columns = request.GET.get('values', '').split(',')
    time_format = request.GET.get('tf')

    # separator processing
    separator = request.GET.get('sep', ',')
    separator = separator.replace('\\t', '\t')
    aliases = {'dot': '.', 'comma': ',', 'tab': '\t', 'space': ' '}
    if separator in aliases:
        separator = aliases[separator]

    # check headless or not
    header = True
    if all(n.isdigit() for n in [time_column] + value_columns):
        header = False

    # generate all columns for headless csv
    if not header:
        max_column_n = max([int(v) for v in value_columns] + [0])
        value_columns = range(1, max_column_n+1)

    ts = generate_time_series_json(time_column, value_columns, time_format)
    csv_data = pd.DataFrame.from_dict(ts).to_csv(index=False, header=header, sep=separator).encode('utf-8')

    # generate response data as file
    filename = 'time-series.csv'
    response = HttpResponse(csv_data, content_type='application/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    response['filename'] = filename
    return response


def localfiles_data(request):
    """Serving files for LocalFilesImportStorage"""
    path = request.GET.get('d')
    if settings.LOCAL_FILES_SERVING_ENABLED is False:
        return HttpResponseForbidden("Serving local files can be dangerous, so it's disabled by default. "
                                     'You can enable it with LOCAL_FILES_SERVING_ENABLED environment variable')

    local_serving_document_root = get_env('LOCAL_FILES_DOCUMENT_ROOT', default='/')
    if path and request.user.is_authenticated:
        return serve(request, path, document_root=local_serving_document_root)

    return HttpResponseForbidden()


def static_file_with_host_resolver(path_on_disk, content_type):
    """ Load any file, replace {{HOSTNAME}} => settings.HOSTNAME, send it as http response
    """
    path_on_disk = os.path.join(os.path.dirname(__file__), path_on_disk)

    def serve_file(request):
        with open(path_on_disk, 'r') as f:
            body = f.read()
            body = body.replace('{{HOSTNAME}}', settings.HOSTNAME)

            out = io.StringIO()
            out.write(body)
            out.seek(0)

            wrapper = FileWrapper(out)
            response = HttpResponse(wrapper, content_type=content_type)
            response['Content-Length'] = len(body)
            return response

    return serve_file


@login_required
def smart_annotation_panel(request):
    return render(request, 'ml/smart_annotation.html')


def _to_float(value, default):
    try:
        if value is None or value == '':
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default):
    try:
        if value is None or value == '':
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


@login_required
@require_http_methods(['GET'])
def smart_annotation_models(request):
    project_id = request.GET.get('project_id')
    if not project_id:
        return JsonResponse({'error': 'project_id is required'}, status=400)

    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return JsonResponse({'error': f'Project {project_id} not found'}, status=404)

    if not project.has_permission(request.user):
        return JsonResponse({'error': 'Permission denied'}, status=403)

    models = []
    for backend in project.ml_backends.all().order_by('id'):
        models.append({
            'id': backend.id,
            'title': backend.title or f'ml-backend-{backend.id}',
            'url': backend.url,
            'model_version': backend.model_version or ''
        })

    return JsonResponse({'project_id': project.id, 'models': models})


@login_required
@require_http_methods(['POST'])
def smart_annotation_batch_predict(request):
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        return JsonResponse({'error': 'Invalid JSON payload'}, status=400)

    project_id = payload.get('project_id')
    ml_backend_id = payload.get('ml_backend_id')
    model_version_override = (payload.get('model_version') or '').strip()
    min_confidence = _to_float(payload.get('min_confidence'), 0.7)
    max_confidence = _to_float(payload.get('max_confidence'), 1.0)
    batch_size = _to_int(payload.get('batch_size'), 10)
    overwrite_existing = bool(payload.get('overwrite_existing', False))

    if not project_id:
        return JsonResponse({'error': 'project_id is required'}, status=400)
    if min_confidence < 0 or max_confidence > 1 or min_confidence > max_confidence:
        return JsonResponse({'error': 'confidence range must satisfy 0 <= min <= max <= 1'}, status=400)
    if batch_size <= 0:
        return JsonResponse({'error': 'batch_size must be > 0'}, status=400)

    try:
        project = Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return JsonResponse({'error': f'Project {project_id} not found'}, status=404)

    if not project.has_permission(request.user):
        return JsonResponse({'error': 'Permission denied'}, status=403)

    if ml_backend_id:
        try:
            ml_backend = MLBackend.objects.get(pk=ml_backend_id, project_id=project.id)
        except MLBackend.DoesNotExist:
            return JsonResponse({'error': f'ML backend {ml_backend_id} not found in project {project.id}'}, status=404)
    else:
        ml_backend = project.ml_backends.order_by('id').first()
        if ml_backend is None:
            return JsonResponse({'error': 'No ML backend found for this project'}, status=404)

    queryset = Task.objects.filter(project_id=project.id)
    if not overwrite_existing:
        queryset = queryset.filter(predictions__isnull=True)
    task_ids = list(queryset.values_list('id', flat=True).distinct())

    if not task_ids:
        return JsonResponse({
            'project_id': project.id,
            'ml_backend_id': ml_backend.id,
            'processed_tasks': 0,
            'created_predictions': 0,
            'message': 'No tasks to process'
        })

    model_version = model_version_override or ml_backend.model_version or 'manual-batch'
    total_created = 0
    total_processed = 0

    for i in range(0, len(task_ids), batch_size):
        batch_ids = task_ids[i:i + batch_size]
        tasks_batch = Task.objects.filter(id__in=batch_ids)
        tasks_ser = TaskSimpleSerializer(tasks_batch, many=True).data

        ml_result = ml_backend.api.make_predictions(
            tasks_ser,
            model_version,
            project,
            extra_params={'confidence_threshold': min_confidence}
        )

        if ml_result.is_error:
            return JsonResponse({'error': ml_result.error_message or 'ML backend prediction failed'}, status=502)

        responses = ml_result.response.get('results', [])
        if not responses:
            total_processed += len(tasks_ser)
            continue

        prepared = []
        for task_data, response in zip(tasks_ser, responses):
            result_items = response.get('result', []) or []
            filtered = []
            for item in result_items:
                score = _to_float(item.get('score'), response.get('score', 0))
                if min_confidence <= score <= max_confidence:
                    filtered.append(item)
            prepared.append({
                'task': task_data['id'],
                'result': filtered,
                'score': min(1.0, max(0.0, _to_float(response.get('score'), 0))),
                'model_version': model_version,
            })

        if prepared:
            serializer = PredictionSerializer(data=prepared, many=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            total_created += len(prepared)

        total_processed += len(tasks_ser)

    return JsonResponse({
        'project_id': project.id,
        'ml_backend_id': ml_backend.id,
        'model_version': model_version,
        'min_confidence': min_confidence,
        'max_confidence': max_confidence,
        'processed_tasks': total_processed,
        'created_predictions': total_created,
        'total_tasks_selected': len(task_ids)
    })
