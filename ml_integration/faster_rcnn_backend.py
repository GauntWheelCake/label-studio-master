"""
Faster RCNN ML Backend for Label Studio
用于目标检测的机器学习后端示例
"""

import io
import base64
import logging
import xml.etree.ElementTree as ET
from abc import ABC
from PIL import Image
import numpy as np
import torch
import torchvision.transforms as transforms
from torchvision.models.detection import fasterrcnn_resnet50_fpn, FasterRCNN_ResNet50_FPN_Weights
from flask import Flask, request, jsonify
import requests

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# COCO类别
# Label Studio API配置
LABEL_STUDIO_URL = "http://localhost:8080"  # Label Studio服务地址
LABEL_STUDIO_API_TOKEN = "6e3c52b71360a92c864bacad751fabe0a8d19c90"  # 你的API Token

COCO_CLASSES = [
    'background', 'person', 'bicycle', 'car', 'motorcycle', 'airplane',
    'bus', 'train', 'truck', 'boat', 'traffic light', 'fire hydrant',
    'stop sign', 'parking meter', 'bench', 'cat', 'dog', 'horse',
    'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack',
    'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis',
    'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass',
    'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich',
    'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake',
    'chair', 'couch', 'potted plant', 'bed', 'dining table', 'toilet',
    'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'microwave', 'oven',
    'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors',
    'teddy bear', 'hair drier', 'toothbrush'
]

class FasterRCNNBackend(ABC):
    """Faster RCNN 目标检测后端"""
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # 初始化模型
        logger.info("Loading Faster RCNN model...")
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        logger.info(f"Using device: {self.device}")
        
        # 加载预训练模型 (使用新的weights参数，避免deprecation warning)
        self.model = fasterrcnn_resnet50_fpn(weights=FasterRCNN_ResNet50_FPN_Weights.COCO_V1)
        self.model.to(self.device)
        self.model.eval()
        
        # 图像预处理
        self.transform = transforms.Compose([
            transforms.ToTensor(),
        ])
        
        logger.info("Model loaded successfully!")
        self.model_version = 'faster-rcnn-resnet50-v1.0'
    
    def predict(self, tasks, **kwargs):
        """
        预测任务中的目标
        
        Args:
            tasks: 任务列表，每个任务包含图像数据
            
        Returns:
            预测结果，格式为Label Studio识别的结构
        """
        # 动态解析label_config中的Image字段名
        image_field_name = 'image'  # 默认字段名
        if 'label_config' in kwargs:
            try:
                label_config = kwargs['label_config']
                root = ET.fromstring(label_config)
                for img_tag in root.iter('Image'):
                    image_field_name = img_tag.get('name', 'image')
                    break
            except Exception as e:
                logger.warning(f"Failed to parse label_config: {str(e)}, using default field name 'image'")
        
        # 修复 $undefined$ 字段 - 将其映射到正确的字段名
        for task in tasks:
            if '$undefined$' in task.get('data', {}):
                task['data'][image_field_name] = task['data']['$undefined$']
                del task['data']['$undefined$']
        
        results = []
        logger.info(f"Starting prediction for {len(tasks)} tasks")

        for task_idx, task in enumerate(tasks):
            try:
                logger.info(f"Processing task {task_idx + 1}/{len(tasks)}")
                
                # 获取图像数据
                image_data = None
                task_data = task.get('data', {})
                
                # 查找图像字段（尝试多个常见字段名）
                for field_name in [image_field_name, 'image', 'img', 'photo', 'picture', 'file']:
                    if field_name in task_data:
                        image_data = task_data[field_name]
                        logger.info(f"Found image in field: {field_name}")
                        break
                
                if not image_data:
                    logger.warning(f"No image data found in task {task.get('id')}")
                    results.append({
                        'result': [],
                        'score': 0
                    })
                    continue
                
                # 解析图像
                logger.info(f"Parsing image for task {task.get('id')}")
                image = self._parse_image(image_data)
                
                if image is None:
                    logger.error(f"Failed to parse image in task {task.get('id')}")
                    results.append({
                        'result': [],
                        'score': 0
                    })
                    continue
                
                # 获取图像尺寸
                img_width = image.width
                img_height = image.height
                logger.info(f"Image size: {img_width}x{img_height}")
                
                # 推理
                logger.info(f"Running inference for task {task.get('id')}")
                with torch.no_grad():
                    # 转换为tensor（不需要添加batch维度）
                    img_tensor = self.transform(image).to(self.device)
                    # 注意：img_tensor 的形状应该是 [C, H, W]
                    logger.info(f"Tensor shape before model: {img_tensor.shape}")
                    
                    # 预测（模型期望的是一个列表，列表中的每个元素是 [C, H, W] 的张量）
                    predictions = self.model([img_tensor])[0]
                
                logger.info(f"Inference completed, detected {len(predictions['boxes'])} objects")
                
                # 处理预测结果
                result = self._process_predictions(
                    predictions,
                    img_width,
                    img_height
                )
                
                # 计算平均置信度
                scores = predictions['scores'].cpu().numpy()
                avg_score = float(np.mean(scores)) if len(scores) > 0 else 0
                
                logger.info(f"Task {task.get('id')} result: {len(result)} objects, avg score: {avg_score:.2%}")
                
                results.append({
                    'result': result,
                    'score': min(avg_score, 1.0)
                })
                
            except Exception as e:
                logger.error(f"Error processing task {task.get('id')}: {str(e)}")
                import traceback
                logger.error(traceback.format_exc())
                results.append({
                    'result': [],
                    'score': 0
                })
        
        logger.info(f"Prediction completed for {len(tasks)} tasks, returned {len(results)} results")
        return {'results': results}
    
    def _parse_image(self, image_data):
        """解析图像数据，支持多种格式：Base64、Label Studio路径、HTTP URL、本地文件"""
        try:
            logger.info(f"Parsing image data, type: {type(image_data).__name__}")
            
            # Base64 数据URL
            if isinstance(image_data, str) and image_data.startswith('data:image'):
                header, data = image_data.split(',', 1)
                image_bytes = base64.b64decode(data)
                image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                return image
            
            # Label Studio 内部路径
            elif isinstance(image_data, str) and image_data.startswith('/data/'):
                image_url = f"{LABEL_STUDIO_URL}{image_data}"
                headers = {"Authorization": f"Token {LABEL_STUDIO_API_TOKEN}"}
                response = requests.get(image_url, headers=headers, timeout=10)
                if response.status_code != 200:
                    raise Exception(f"HTTP {response.status_code}")
                image = Image.open(io.BytesIO(response.content)).convert('RGB')
                return image
            
            # HTTP/HTTPS URL
            elif isinstance(image_data, str) and image_data.startswith(('http://', 'https://')):
                response = requests.get(image_data, timeout=10)
                image = Image.open(io.BytesIO(response.content)).convert('RGB')
                return image
            
            # 本地文件路径或Base64字符串
            elif isinstance(image_data, str):
                # 尝试作为文件路径
                if image_data.startswith('/') or image_data.startswith('\\') or ':' in image_data:
                    image = Image.open(image_data).convert('RGB')
                    return image
                
                # 尝试Base64解码
                try:
                    image_bytes = base64.b64decode(image_data)
                    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
                    return image
                except:
                    raise
            
            # 字节数据
            elif isinstance(image_data, bytes):
                image = Image.open(io.BytesIO(image_data)).convert('RGB')
                return image
            
            else:
                raise ValueError(f"Unsupported image data type: {type(image_data).__name__}")
        
        except Exception as e:
            logger.error(f"Error parsing image: {str(e)}")
            return None
    
    def _process_predictions(self, predictions, img_width, img_height):
        """将模型预测结果转换为Label Studio格式"""
        result = []
        
        boxes = predictions['boxes'].cpu().numpy()
        labels = predictions['labels'].cpu().numpy()
        scores = predictions['scores'].cpu().numpy()
        
        confidence_threshold = 0.7  # 调整此值：0.3(多) ~ 0.7(少但准确)
        
        for box, label, score in zip(boxes, labels, scores):
            if score < confidence_threshold:
                continue
            
            x1, y1, x2, y2 = box
            x = (float(x1) / img_width) * 100
            y = (float(y1) / img_height) * 100
            width = ((float(x2) - float(x1)) / img_width) * 100
            height = ((float(y2) - float(y1)) / img_height) * 100
            
            label_idx = int(label)
            if label_idx < 0 or label_idx >= len(COCO_CLASSES):
                logger.warning(f"Unknown class index {label_idx}, skipping")
                continue
            class_name = COCO_CLASSES[label_idx]
            
            result.append({
                'value': {
                    'x': x,
                    'y': y,
                    'width': width,
                    'height': height,
                    'rotation': 0,
                    'rectanglelabels': [class_name]
                },
                'from_name': 'label',
                'to_name': 'image',
                'type': 'rectanglelabels',
                'original_width': img_width,
                'original_height': img_height,
                'score': float(score)
            })
        
        return result
    
    def train(self, annotations, **kwargs):
        """训练函数（示例实现，使用预训练权重，不进行微调）"""
        logger.info(f"Received {len(annotations)} annotations for training")
        
        return {
            'status': 'ok',
            'model_version': self.model_version,
            'message': f'Received {len(annotations)} annotations'
        }


# Flask应用
app = Flask(__name__)

# 初始化模型
ml_backend = FasterRCNNBackend()


@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'model': 'Faster RCNN (ResNet50)',
        'device': str(ml_backend.device)
    })


@app.route('/predict', methods=['POST'])
def predict():
    """预测端点"""
    try:
        data = request.json
        tasks = data.get('tasks', [])
        
        logger.info(f"Predicting for {len(tasks)} tasks")
        
        # 获取预测
        predictions = ml_backend.predict(tasks)
        
        return jsonify(predictions)
    
    except Exception as e:
        logger.error(f"Error in predict: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({
            'error': str(e)
        }), 500


@app.route('/train', methods=['POST'])
def train():
    """训练端点"""
    try:
        data = request.json
        annotations = data.get('annotations', [])
        
        logger.info(f"Training with {len(annotations)} annotations")
        
        # 训练模型
        result = ml_backend.train(annotations)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error in train: {str(e)}")
        return jsonify({
            'error': str(e)
        }), 500


@app.route('/setup', methods=['POST'])
def setup():
    """设置端点"""
    return jsonify({
        'status': 'ok',
        'model': 'Faster RCNN (ResNet50)',
        'version': ml_backend.model_version
    })


@app.route('/validate', methods=['POST'])
def validate():
    """验证端点"""
    data = request.json
    return jsonify({
        'status': 'ok',
        'message': 'Label config is valid'
    })


if __name__ == '__main__':
    logger.info("Starting Faster RCNN ML Backend...")
    logger.info(f"GPU Available: {torch.cuda.is_available()}")
    logger.info("Server running on http://0.0.0.0:9090")
    
    app.run(
        host='0.0.0.0',
        port=9090,
        debug=False,
        threaded=True
    )
