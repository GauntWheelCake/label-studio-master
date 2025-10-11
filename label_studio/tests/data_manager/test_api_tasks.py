"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import pytest
import json

from ..utils import make_task, make_annotation, make_prediction, project_id
from projects.models import Project
from tasks.models import Task


@pytest.mark.django_db
def test_views_tasks_api(business_client, project_id):
    # create
    payload = dict(project=project_id, data={"test": 1})
    response = business_client.post(
        "/api/dm/views/",
        data=json.dumps(payload),
        content_type="application/json",
    )

    assert response.status_code == 201, response.content
    view_id = response.json()["id"]

    # no tasks
    response = business_client.get(f"/api/dm/views/{view_id}/tasks/")

    assert response.status_code == 200, response.content
    assert response.json()["total"] == 0
    assert len(response.json()["tasks"]) == 0

    project = Project.objects.get(pk=project_id)
    task_data = {"text": "bbb"}
    task_id = make_task({"data": task_data}, project).id

    annotation_result = {"from_name": "my_class", "to_name": "text", "type": "choices", "value": {"choices": ["pos"]}}
    make_annotation({"result": [annotation_result]}, task_id)
    make_annotation(
        {
            "result": [annotation_result],
            "was_cancelled": True,
        },
        task_id,
    )
    prediction_result = {"from_name": "my_class", "to_name": "text", "type": "choices", "value": {"choices": ["pos"]}}
    make_prediction(
        {
            "result": [prediction_result],
        },
        task_id,
    )

    response = business_client.get(f"/api/dm/views/{view_id}/tasks/")

    assert response.status_code == 200, response.content
    response_data = response.json()
    assert response_data["total"] == 1
    assert len(response_data["tasks"]) == 1
    assert response_data["tasks"][0]["id"] == task_id
    assert response_data["tasks"][0]["data"] == task_data
    assert response_data["tasks"][0]["total_annotations"] == 1
    assert json.loads(response_data["tasks"][0]["annotations_results"]) == [[annotation_result], [annotation_result]]
    assert response_data["tasks"][0]["cancelled_annotations"] == 1
    assert response_data["tasks"][0]["total_predictions"] == 1
    assert json.loads(response_data["tasks"][0]["predictions_results"]) == [[prediction_result]]


@pytest.mark.parametrize(
    "tasks_count, annotations_count, predictions_count",
    [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 1],
        [2, 2, 2],
    ],
)
@pytest.mark.django_db
def test_views_total_counters(tasks_count, annotations_count, predictions_count, business_client, project_id):
    # create
    payload = dict(project=project_id, data={"test": 1})
    response = business_client.post(
        "/api/dm/views/",
        data=json.dumps(payload),
        content_type="application/json",
    )

    assert response.status_code == 201, response.content
    view_id = response.json()["id"]

    project = Project.objects.get(pk=project_id)
    for _ in range(0, tasks_count):
        task_id = make_task({"data": {}}, project).id
        print('TASK_ID: %s' % task_id)
        for _ in range(0, annotations_count):
            print('COMPLETION')
            make_annotation({"result": []}, task_id)

        for _ in range(0, predictions_count):
            make_prediction({"result": []}, task_id)

    response = business_client.get(f"/api/dm/views/{view_id}/tasks/")

    response_data = response.json()

    assert response_data["total"] == tasks_count, response_data
    assert response_data["total_annotations"] == tasks_count * annotations_count, response_data
    assert response_data["total_predictions"] == tasks_count * predictions_count, response_data


@pytest.mark.django_db
def test_review_status_localization_and_annotation_count(business_client, project_id):
    payload = dict(project=project_id, data={"test": 1})
    response = business_client.post(
        "/api/dm/views/",
        data=json.dumps(payload),
        content_type="application/json",
    )

    assert response.status_code == 201, response.content
    view_id = response.json()["id"]

    project = Project.objects.get(pk=project_id)
    task = make_task({"data": {"text": "审核文本"}}, project)

    for _ in range(2):
        make_annotation({"result": []}, task.id)

    task.review_status = Task.ReviewStatus.APPROVED
    task.save(update_fields=["review_status"])

    response = business_client.get(f"/api/dm/views/{view_id}/tasks/")
    assert response.status_code == 200, response.content

    payload = response.json()
    assert payload["total"] == 1

    item = payload["tasks"][0]

    # 中文展示值来自序列化器的转换；review_status 本身回落为英文枚举
    assert item["review_status"] == Task.ReviewStatus.APPROVED
    assert item["review_status_display"] == "已通过"
    # 原始英文编码仍然保留在 review_status_code 中，供筛选使用
    assert item["review_status_code"] == Task.ReviewStatus.APPROVED

    # total_annotations 需要准确反映 2 条有效注释
    assert item["total_annotations"] == 2
