"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license."""

import io
import json
import zipfile

import pytest

from label_studio.data_export.api import (
    APPROVED_EXPORT_NOTICE,
    NO_APPROVED_TASKS_MESSAGE,
)
from tasks.models import Annotation, Task

from .utils import make_project


def _annotation_result(label="approved"):
    return [{
        "id": "result-id",
        "from_name": "label",
        "to_name": "text",
        "type": "choices",
        "value": {"choices": [label]},
    }]


def _load_exported_tasks(response):
    """Return parsed JSON from export response regardless of file type."""
    content = response.content
    filename = response["filename"]
    if filename.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            # expect single file in archive
            member_name = archive.namelist()[0]
            data = archive.read(member_name)
    else:
        data = content
    return json.loads(data.decode("utf-8"))


@pytest.mark.parametrize("download_all", (False, True))
@pytest.mark.django_db
def test_export_includes_only_approved_tasks(business_client, download_all):
    project_config = {
        "title": "Export review filter",
        "label_config": """
        <View>
          <Text name=\"text\" value=\"$text\"/>
          <Choices name=\"label\" toName=\"text\">
            <Choice value=\"approved\"/>
            <Choice value=\"other\"/>
          </Choices>
        </View>
        """,
    }
    project = make_project(project_config, business_client.user)

    approved_with_annotation = Task.objects.create(
        project=project,
        data={"text": "approved with annotation"},
        review_status=Task.ReviewStatus.APPROVED,
    )
    Annotation.objects.create(
        task=approved_with_annotation,
        result=_annotation_result(),
        completed_by=business_client.user,
    )

    for status in (Task.ReviewStatus.PENDING, Task.ReviewStatus.REJECTED):
        task = Task.objects.create(
            project=project,
            data={"text": f"{status} task"},
            review_status=status,
        )
        Annotation.objects.create(
            task=task,
            result=_annotation_result(label="other"),
            completed_by=business_client.user,
        )

    approved_without_annotation = Task.objects.create(
        project=project,
        data={"text": "approved without annotation"},
        review_status=Task.ReviewStatus.APPROVED,
    )

    Task.objects.create(
        project=project,
        data={"text": "pending without annotation"},
        review_status=Task.ReviewStatus.PENDING,
    )

    params = {"exportType": "JSON"}
    if download_all:
        params["download_all_tasks"] = "true"
    response = business_client.get(
        f"/api/projects/{project.id}/export",
        data=params,
    )

    assert response.status_code == 200
    assert response["X-Review-Export-Notice"] == APPROVED_EXPORT_NOTICE
    tasks = _load_exported_tasks(response)

    assert all(task["review_status"] == Task.ReviewStatus.APPROVED for task in tasks)

    exported_ids = {task["id"] for task in tasks}
    expected_ids = {approved_with_annotation.id}
    if download_all:
        expected_ids.add(approved_without_annotation.id)
    assert exported_ids == expected_ids


@pytest.mark.parametrize("download_all", (False, True))
@pytest.mark.django_db
def test_export_requires_approved_tasks(business_client, download_all):
    project_config = {
        "title": "Export review filter",
        "label_config": """
        <View>
          <Text name=\"text\" value=\"$text\"/>
          <Choices name=\"label\" toName=\"text\">
            <Choice value=\"approved\"/>
            <Choice value=\"other\"/>
          </Choices>
        </View>
        """,
    }
    project = make_project(project_config, business_client.user)

    Task.objects.create(
        project=project,
        data={"text": "pending task"},
        review_status=Task.ReviewStatus.PENDING,
    )
    Task.objects.create(
        project=project,
        data={"text": "rejected task"},
        review_status=Task.ReviewStatus.REJECTED,
    )

    params = {"exportType": "JSON"}
    if download_all:
        params["download_all_tasks"] = "true"

    response = business_client.get(
        f"/api/projects/{project.id}/export",
        data=params,
    )

    assert response.status_code == 400
    payload = json.loads(response.content.decode("utf-8"))
    assert payload["detail"] == NO_APPROVED_TASKS_MESSAGE


@pytest.mark.django_db
def test_task_review_status_resets_when_new_annotation_created(business_client):
    project_config = {
        "title": "Review status reset",
        "label_config": """
        <View>
          <Text name=\"text\" value=\"$text\"/>
          <Choices name=\"label\" toName=\"text\">
            <Choice value=\"approved\"/>
            <Choice value=\"other\"/>
          </Choices>
        </View>
        """,
    }
    project = make_project(project_config, business_client.user)

    task = Task.objects.create(
        project=project,
        data={"text": "task to review"},
    )

    Annotation.objects.create(
        task=task,
        result=_annotation_result(),
        completed_by=business_client.user,
    )

    task.review_status = Task.ReviewStatus.APPROVED
    task.review_comment = "Looks good"
    task.save(update_fields=["review_status", "review_comment"])

    Annotation.objects.create(
        task=task,
        result=_annotation_result(label="other"),
        completed_by=business_client.user,
    )

    task.refresh_from_db()
    assert task.review_status == Task.ReviewStatus.PENDING
    assert task.review_comment == ""
