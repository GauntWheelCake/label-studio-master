#!/usr/bin/env python
"""
快速测试脚本：为单个任务获取 ML 预测
"""
import requests
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 配置
LABEL_STUDIO_URL = "http://localhost:8080"
API_TOKEN = "6e3c52b71360a92c864bacad751fabe0a8d19c90"
ML_BACKEND_URL = "http://localhost:9090"
PROJECT_ID = 36
TASK_ID = 66  # 项目 36 的第一个任务

def get_task(task_id):
    """从 Label Studio 获取任务"""
    headers = {"Authorization": f"Token {API_TOKEN}"}
    url = f"{LABEL_STUDIO_URL}/api/tasks/{task_id}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def get_project(project_id):
    """从 Label Studio 获取项目信息"""
    headers = {"Authorization": f"Token {API_TOKEN}"}
    url = f"{LABEL_STUDIO_URL}/api/projects/{project_id}"
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def predict(tasks):
    """调用 ML Backend 预测"""
    data = {"tasks": tasks}
    response = requests.post(f"{ML_BACKEND_URL}/predict", json=data)
    response.raise_for_status()
    return response.json()

def create_prediction(task_id, prediction_result, model_version=""):
    """将预测结果保存回 Label Studio"""
    headers = {
        "Authorization": f"Token {API_TOKEN}",
        "Content-Type": "application/json"
    }
    
    # 计算平均分数
    scores = [obj.get('score', 0.5) for obj in prediction_result]
    avg_score = sum(scores) / len(scores) if scores else 0.5
    
    payload = {
        "result": prediction_result,
        "task": task_id,
        "score": avg_score,
        "model_version": model_version
    }
    
    logger.info(f"  预测数据:")
    logger.info(f"    - Task ID: {task_id}")
    logger.info(f"    - Result objects: {len(prediction_result)}")
    logger.info(f"    - Average score: {avg_score:.2%}")
    
    url = f"{LABEL_STUDIO_URL}/api/predictions"
    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code != 201:
        logger.error(f"  Response status: {response.status_code}")
        logger.error(f"  Response body: {response.text}")
    
    response.raise_for_status()
    return response.json()

def main():
    logger.info(f"=== 测试 ML Backend 预测 ===")
    logger.info(f"项目 ID: {PROJECT_ID}")
    logger.info(f"任务 ID: {TASK_ID}")
    logger.info(f"ML Backend: {ML_BACKEND_URL}")
    logger.info("")
    
    try:
        # 步骤 1: 获取项目信息（包含 label_config）
        logger.info("步骤 1: 获取项目信息...")
        project = get_project(PROJECT_ID)
        logger.info(f"  ✓ 项目标题: {project['title']}")
        logger.info(f"  ✓ Label Config: {project['label_config'][:100]}...")
        
        # 步骤 2: 获取任务数据
        logger.info("\n步骤 2: 获取任务数据...")
        task = get_task(TASK_ID)
        logger.info(f"  ✓ 任务 ID: {task['id']}")
        logger.info(f"  ✓ 任务数据: {json.dumps(task['data'], ensure_ascii=False)}")
        
        # 步骤 3: 调用 ML Backend 预测
        logger.info("\n步骤 3: 调用 ML Backend 预测...")
        tasks_for_predict = [task]
        tasks_for_predict[0]['label_config'] = project['label_config']  # 添加 label_config
        
        predictions = predict(tasks_for_predict)
        logger.info(f"  ✓ 预测结果数量: {len(predictions.get('results', []))}")
        
        if predictions.get('results'):
            for i, pred in enumerate(predictions['results']):
                logger.info(f"\n  预测 #{i+1}:")
                logger.info(f"    任务 ID: {pred.get('task', 'N/A')}")
                logger.info(f"    检测对象数: {len(pred.get('result', []))}")
                for j, obj in enumerate(pred.get('result', [])[:3]):  # 只显示前 3 个
                    logger.info(f"      对象 #{j+1}: {json.dumps(obj, ensure_ascii=False, indent=8)}")
        
        # 步骤 4: 保存预测结果到 Label Studio
        logger.info("\n步骤 4: 保存预测结果到 Label Studio...")
        if predictions.get('results') and len(predictions['results']) > 0:
            result = predictions['results'][0].get('result', [])
            pred_response = create_prediction(TASK_ID, result, model_version="faster_rcnn_v1")
            logger.info(f"  ✓ 预测已保存, ID: {pred_response.get('id')}")
        
        logger.info("\n✅ 测试完成!")
        
    except Exception as e:
        logger.error(f"❌ 错误: {e}", exc_info=True)
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
