"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import base64
import json
import logging
import os
import tempfile

from django.conf import settings
from django.http import HttpResponse
from django.core.files import File
from drf_yasg import openapi as openapi
from drf_yasg.utils import swagger_auto_schema
from django.utils.decorators import method_decorator
from rest_framework import status, generics
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import all_permissions
from core.utils.common import get_object_with_check_and_log, bool_from_request, batch
from projects.models import Project
from tasks.models import Task
from .models import DataExport
from .serializers import ExportDataSerializer

logger = logging.getLogger(__name__)

APPROVED_EXPORT_NOTICE = '导出结果只包含已标注的任务。'
NO_EXPORTABLE_TASKS_MESSAGE = '没有可供导出的任务。'


def _get_exportable_tasks(project):
    """Query and serialize annotated tasks for export.

    Returns the serialized task list, or ``None`` when no exportable tasks
    exist.
    """
    logger.debug('Get exportable tasks')
    query = Task.objects.filter(
        project=project,
        annotations__isnull=False,
    ).select_related('project').prefetch_related('annotations', 'predictions')

    if not query.exists():
        return None

    task_ids = query.values_list('id', flat=True)
    tasks = []
    logger.debug('Serialize tasks for export')
    for _task_ids in batch(task_ids, 1000):
        tasks += ExportDataSerializer(query.filter(id__in=_task_ids), many=True).data
    return tasks


def _persist_split_settings(project, request_data, persist_enabled=False):
    """Parse and persist split settings from request data.

    Returns the effective ``(split_enabled, split_ratios)`` tuple.
    """
    split_ratios = project.export_split_ratios or {'train': 80, 'val': 10, 'test': 10}
    if request_data.get('split_ratios'):
        try:
            split_ratios = json.loads(request_data['split_ratios'])
        except Exception:
            pass

    split_enabled = project.export_split_enabled
    if persist_enabled and request_data.get('split_enabled') is not None:
        split_enabled = bool_from_request(request_data, 'split_enabled', split_enabled)

    fields = []
    if project.export_split_ratios != split_ratios:
        project.export_split_ratios = split_ratios
        fields.append('export_split_ratios')
    if persist_enabled and project.export_split_enabled != split_enabled:
        project.export_split_enabled = split_enabled
        fields.append('export_split_enabled')

    if fields:
        project.save(update_fields=fields)

    return split_enabled, split_ratios



@method_decorator(name='get', decorator=swagger_auto_schema(
    tags=['Export'],
    operation_summary='Get export formats',
    operation_description='Retrieve the available export formats for the current project.',
    responses={200: openapi.Response(
                description='Export formats',
                schema=openapi.Schema(
                    title='Format list',
                    description='List of available formats',
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Schema(
                        title="Export format",
                        type=openapi.TYPE_STRING)
                             )
            )}
))
class ExportFormatsListAPI(generics.RetrieveAPIView):
    permission_required = all_permissions.projects_view

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def get(self, request, *args, **kwargs):
        project = self.get_object()
        formats = DataExport.get_export_formats(project)
        return Response(formats)


@method_decorator(name='get', decorator=swagger_auto_schema(
    manual_parameters=[
        openapi.Parameter(name='exportType',
                          type=openapi.TYPE_STRING,
                          in_=openapi.IN_QUERY,
                          description='Selected export format')
        ],
    tags=['Export'],
    operation_summary='Export tasks and annotations',
    operation_description="""
        Export annotated tasks as a file in a specific format.
        For example, to export JSON annotations for a project to a file called `annotations.json`,
        run the following from the command line:
        ```bash
        curl -X GET {}/api/projects/{{id}}/export?exportType=JSON -H \'Authorization: Token abc123\' --output annotations.json'
        ```
        """.format(settings.HOSTNAME or 'https://localhost:8080'),
    responses={200: openapi.Response(
        description='Exported data',
        schema=openapi.Schema(
            title='Export file',
            description='Export file with results',
            type=openapi.TYPE_FILE
            )
        )}
    ))
class ExportAPI(generics.RetrieveAPIView):
    permission_required = all_permissions.projects_change

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def get(self, request, *args, **kwargs):
        project = self.get_object()
        export_type = request.GET.get('exportType')

        tasks = _get_exportable_tasks(project)
        if tasks is None:
            return Response({'detail': NO_EXPORTABLE_TASKS_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)

        split_enabled, split_ratios = _persist_split_settings(
            project, request.GET, persist_enabled=True,
        )

        logger.debug('Prepare export files')
        export_stream, content_type, filename = DataExport.generate_export_file(
            project, tasks, export_type, request.GET,
            split_enabled=split_enabled, split_ratios=split_ratios,
        )

        response = HttpResponse(File(export_stream), content_type=content_type)
        response['Content-Disposition'] = 'attachment; filename="%s"' % filename
        response['filename'] = filename
        return response


class ExportToDatasetAPI(generics.RetrieveAPIView):
    """Export annotated tasks and return the resulting files to the frontend.

    The frontend is responsible for calling the external dataset management
    APIs directly (creating the dataset, fetching presigned URLs, and uploading
    files). This endpoint only generates and serializes the export files.
    """
    permission_required = all_permissions.projects_change

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def post(self, request, *args, **kwargs):
        project = self.get_object()
        export_type = request.data.get('exportType') or request.GET.get('exportType')

        _, split_ratios = _persist_split_settings(project, request.data)

        tasks = _get_exportable_tasks(project)
        if tasks is None:
            return Response({'detail': NO_EXPORTABLE_TASKS_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)

        logger.debug('Prepare export files for dataset upload')
        try:
            with tempfile.TemporaryDirectory() as tmp_dir:
                files, _, _ = DataExport.generate_export_file(
                    project, tasks, export_type, request.GET,
                    split_enabled=True, split_ratios=split_ratios, return_files=True, output_dir=tmp_dir,
                )

                if not files:
                    return Response({'detail': '没有可上传的导出文件'}, status=status.HTTP_400_BAD_REQUEST)

                serialized_files = []
                for abs_path, rel_path in files:
                    with open(abs_path, 'rb') as f:
                        content = f.read()
                    ext = os.path.splitext(rel_path)[-1].lower()
                    content_type = {
                        '.json': 'application/json',
                        '.csv': 'text/csv',
                        '.txt': 'text/plain',
                        '.xml': 'application/xml',
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                    }.get(ext, 'application/octet-stream')
                    serialized_files.append({
                        'path': rel_path.replace('\\', '/'),
                        'content_type': content_type,
                        'content_base64': base64.b64encode(content).decode('utf-8'),
                    })
        except Exception as exc:
            logger.exception('Failed to generate export files for dataset upload')
            return Response(
                {'detail': f'生成导出文件失败: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        logger.info('Project %s prepared %d export files for dataset upload', project.id, len(serialized_files))
        return Response({
            'status': 'ok',
            'uploadPrefix': project.fe_dataset_upload_prefix,
            'files': serialized_files,
        })


@method_decorator(name='get', decorator=swagger_auto_schema(
        tags=['Export'],
        operation_summary='Export files',
        operation_description="""
        List of files exported from the Label Studio UI using the Export button on the Data Manager page.
        """,
        ))
class ProjectExportFiles(generics.RetrieveAPIView):
    permission_required = all_permissions.projects_change

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def get(self, request, *args, **kwargs):
        project = self.get_object()
        project = get_object_with_check_and_log(request, Project, pk=self.kwargs['pk'])
        self.check_object_permissions(self.request, project)

        paths = []
        for name in os.listdir(settings.EXPORT_DIR):
            if name.endswith('.json') and not name.endswith('-info.json'):
                project_id = name.split('-')[0]
                if str(kwargs['pk']) == project_id:
                    paths.append(settings.EXPORT_URL_ROOT + name)

        items = [{'name': p.split('/')[2].split('.')[0], 'url': p} for p in sorted(paths)[::-1]]
        return Response({'export_files': items}, status=status.HTTP_200_OK)


class ProjectExportFilesAuthCheck(APIView):
    """ Check auth for nginx auth_request (/api/auth/export/)
    """
    swagger_schema = None
    http_method_names = ['get']
    permission_required = all_permissions.projects_change

    def get(self, request, *args, **kwargs):
        """ Get export files list
        """
        original_url = request.META['HTTP_X_ORIGINAL_URI']
        filename = original_url.replace('/export/', '')
        project_id = filename.split('-')[0]
        try:
            pk = int(project_id)
        except ValueError:
            return Response({'detail': 'Incorrect filename in export'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        generics.get_object_or_404(Project.objects.filter(organization=self.request.user.active_organization), pk=pk)
        return Response({'detail': 'auth ok'}, status=status.HTTP_200_OK)
