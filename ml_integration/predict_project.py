"""
通用预测脚本 - 为指定项目的所有任务生成并保存预测
用法: python predict_project.py --project-id 37
"""

import argparse
import requests
import json
import sys

# 配置
LABEL_STUDIO_URL = "http://localhost:8080"
ML_BACKEND_URL = "http://localhost:9090"
API_TOKEN = "6e3c52b71360a92c864bacad751fabe0a8d19c90"

def get_tasks(project_id):
    """获取项目中的所有任务"""
    headers = {"Authorization": f"Token {API_TOKEN}"}
    # 正确的 API: /api/projects/{id}/tasks 只返回该项目的任务
    # 错误的 API: /api/tasks?project={id} 会返回所有项目的任务
    url = f"{LABEL_STUDIO_URL}/api/projects/{project_id}/tasks"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def get_tasks_with_predictions(project_id):
    """获取项目中已有预测的任务ID集合"""
    headers = {"Authorization": f"Token {API_TOKEN}"}
    # 获取项目的任务ID列表
    tasks = get_tasks(project_id)
    task_ids = {t["id"] for t in tasks}
    
    # 获取这些任务的预测
    tasks_with_preds = set()
    for task_id in task_ids:
        url = f"{LABEL_STUDIO_URL}/api/predictions?task={task_id}"
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            preds = response.json()
            if preds:
                tasks_with_preds.add(task_id)
    
    return tasks_with_preds

def get_predictions(tasks):
    """从 ML Backend 获取预测"""
    response = requests.post(
        f"{ML_BACKEND_URL}/predict",
        json={"tasks": tasks},
        headers={"Content-Type": "application/json"}
    )
    response.raise_for_status()
    return response.json().get("results", [])

def save_prediction(task_id, prediction, project_id):
    """保存单个预测到 Label Studio"""
    headers = {
        "Authorization": f"Token {API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    data = {
        "task": task_id,
        "result": prediction.get("result", []),
        "score": prediction.get("score", 0),
        "model_version": "faster-rcnn-resnet50-v1.0"
    }
    
    response = requests.post(
        f"{LABEL_STUDIO_URL}/api/predictions",
        headers=headers,
        json=data
    )
    
    return response.status_code == 201

def main():
    parser = argparse.ArgumentParser(description="为项目生成预测")
    parser.add_argument("--project-id", "-p", type=int, required=True, help="项目ID")
    parser.add_argument("--batch-size", "-b", type=int, default=5, help="每批处理的任务数")
    parser.add_argument("--skip-existing", "-s", action="store_true", help="跳过已有预测的任务")
    args = parser.parse_args()
    
    project_id = args.project_id
    batch_size = args.batch_size
    
    print(f"📋 获取项目 {project_id} 的任务...")
    tasks = get_tasks(project_id)
    print(f"   找到 {len(tasks)} 个任务")
    
    if not tasks:
        print("❌ 没有找到任务")
        return
    
    # 跳过已有预测的任务
    if args.skip_existing:
        print("   🔍 检查已有预测...")
        tasks_with_preds = get_tasks_with_predictions(project_id)
        original_count = len(tasks)
        tasks = [t for t in tasks if t["id"] not in tasks_with_preds]
        skipped = original_count - len(tasks)
        if skipped > 0:
            print(f"   ⏭️  跳过 {skipped} 个已有预测的任务")
        if not tasks:
            print("✅ 所有任务都已有预测，无需处理")
            return
    
    success_count = 0
    error_count = 0
    
    # 分批处理
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(tasks) + batch_size - 1) // batch_size
        
        print(f"\n🔄 处理批次 {batch_num}/{total_batches} ({len(batch)} 个任务)...")
        
        try:
            predictions = get_predictions(batch)
            
            for task, prediction in zip(batch, predictions):
                task_id = task["id"]
                result_count = len(prediction.get("result", []))
                
                if save_prediction(task_id, prediction, project_id):
                    success_count += 1
                    print(f"   ✅ 任务 {task_id}: 保存了 {result_count} 个检测结果")
                else:
                    error_count += 1
                    print(f"   ❌ 任务 {task_id}: 保存失败")
                    
        except Exception as e:
            print(f"   ❌ 批次处理失败: {e}")
            error_count += len(batch)
    
    print(f"\n{'='*50}")
    print(f"📊 完成! 成功: {success_count}, 失败: {error_count}")
    print(f"🔗 查看项目: {LABEL_STUDIO_URL}/projects/{project_id}/data")

if __name__ == "__main__":
    main()
