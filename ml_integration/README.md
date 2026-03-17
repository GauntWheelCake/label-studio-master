# Label Studio ML 集成模块

本模块实现了 Faster RCNN 目标检测模型与 Label Studio 的集成，支持自动预标注功能。

## 📁 文件结构

```
ml_integration/
├── faster_rcnn_backend.py   # ML Backend 服务器（实时预测）
├── predict_project.py       # 批量预测脚本（保存到数据库）
├── README.md                # 本文档
└── weights/                 # 模型权重目录（离线环境）
    └── fasterrcnn_resnet50_fpn_coco.pth
```

---

## 🚀 快速开始

### 0. 容器化部署（推荐）

如果你要把模型服务交付给他人，建议直接打包成镜像文件（tar）进行分发。

详细步骤见：`ml_integration/DEPLOYMENT.md`（包含 `docker build`、`docker save`、`docker load`、`docker run`）。

### 1. 安装依赖

```bash
# 创建并激活环境
conda create -n ml-backend python=3.10
conda activate ml-backend

# 安装 PyTorch (GPU 版本)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 安装其他依赖
pip install flask pillow requests numpy
```

### 2. 启动 ML Backend

```bash
cd ml_integration
python faster_rcnn_backend.py
```

### 3. 在 Label Studio 中添加 ML Backend

- 打开项目设置 → Machine Learning
- 添加模型，URL 填写：
  - **Label Studio 在 Docker 中**: `http://host.docker.internal:9090`
  - **Label Studio 在本机**: `http://localhost:9090`

### 4. 批量生成预测（可选）

```bash
python predict_project.py -p <项目ID>
```

---

## 🔧 环境要求

### Python 版本
- **Python 3.10+** (推荐 3.10 或 3.11)

### 核心依赖包

```bash
# 必需的包
pip install torch torchvision   # PyTorch 深度学习框架 (需要 CUDA 版本以支持 GPU)
pip install flask               # Web 服务器框架
pip install pillow              # 图像处理
pip install requests            # HTTP 请求
pip install numpy               # 数值计算
```

### 完整安装命令

```bash
# 创建 conda 环境 (推荐)
conda create -n ml-backend python=3.10
conda activate ml-backend

# 安装 PyTorch (GPU 版本，根据 CUDA 版本选择)
# CUDA 11.8
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# 安装其他依赖
pip install flask pillow requests numpy
```

### 依赖版本参考

| 包          | 最低版本 | 推荐版本 | 说明         |
| ----------- | -------- | -------- | ------------ |
| torch       | 2.0+     | 2.1+     | 深度学习框架 |
| torchvision | 0.15+    | 0.16+    | 视觉模型库   |
| flask       | 2.0+     | 3.0+     | Web 框架     |
| pillow      | 9.0+     | 10.0+    | 图像处理     |
| requests    | 2.28+    | 2.31+    | HTTP 客户端  |
| numpy       | 1.23+    | 1.26+    | 数值计算     |

### GPU 要求 (可选但推荐)

- **NVIDIA GPU**: 显存 >= 4GB
- **CUDA**: 11.8 或 12.1+
- **cuDNN**: 8.6+

---

## 📦 离线环境部署

### 1. 下载模型权重

在有网络的机器上下载权重文件：

```bash
# 方法1: 直接下载到 weights 目录
# Windows PowerShell
Invoke-WebRequest -Uri "https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth" -OutFile "weights/fasterrcnn_resnet50_fpn_coco.pth"

# Linux/Mac
wget https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth -O weights/fasterrcnn_resnet50_fpn_coco.pth
```

```python
# 方法2: 使用 Python 下载
import torch
from torchvision.models.detection import fasterrcnn_resnet50_fpn, FasterRCNN_ResNet50_FPN_Weights

# 下载并保存到 weights 目录
model = fasterrcnn_resnet50_fpn(weights=FasterRCNN_ResNet50_FPN_Weights.COCO_V1)
torch.save(model.state_dict(), "weights/fasterrcnn_resnet50_fpn_coco.pth")
```

### 2. 文件结构

将权重文件放在 `ml_integration/weights/` 目录下：

```
ml_integration/
├── faster_rcnn_backend.py
├── predict_project.py
├── README.md
└── weights/
    └── fasterrcnn_resnet50_fpn_coco.pth   # 放这里即可，自动加载
```

**程序会自动检测**：如果 `weights/fasterrcnn_resnet50_fpn_coco.pth` 存在则使用本地文件，否则从网络下载。

### 3. 离线安装 Python 包

```bash
# 在有网络的机器上下载包
pip download torch torchvision flask pillow requests numpy -d ./packages

# 在离线机器上安装
pip install --no-index --find-links=./packages torch torchvision flask pillow requests numpy
```

### 模型权重信息

| 模型                     | 文件大小 | 下载地址                                                                                     |
| ------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| Faster RCNN ResNet50 FPN | ~160MB   | [PyTorch Hub](https://download.pytorch.org/models/fasterrcnn_resnet50_fpn_coco-258fb6c6.pth) |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              系统架构图                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐         ┌─────────────────┐         ┌─────────────────┐  │
│   │   用户浏览器  │ ◄─────► │  Label Studio   │ ◄─────► │   ML Backend    │  │
│   │             │         │  (Docker:8080)  │         │  (本机:9090)     │  │
│   └─────────────┘         └─────────────────┘         └─────────────────┘  │
│                                   │                           │             │
│                                   │                           │             │
│                                   ▼                           ▼             │
│                           ┌─────────────┐             ┌─────────────────┐  │
│                           │  PostgreSQL │             │  Faster RCNN    │  │
│                           │   数据库     │             │  (GPU 推理)     │  │
│                           └─────────────┘             └─────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 工作原理

### 方式1：实时预测（临时显示）

```
用户打开任务 ──► Label Studio ──► 调用 ML Backend ──► 返回预测
                     │                                    │
                     └────────── 显示预测框 ◄─────────────┘
                            (仅临时显示，不保存)
```

**流程说明：**
1. 用户在 Label Studio 中打开一个标注任务
2. Label Studio 检测到 `evaluate_predictions_automatically=True`
3. 自动向 ML Backend 发送 POST 请求 (`/predict`)
4. ML Backend 加载图片，运行 Faster RCNN 推理
5. 返回检测结果（边界框 + 类别 + 置信度）
6. Label Studio 将预测框显示在图片上
7. **注意：这些预测不会保存到数据库**

### 方式2：批量预测（永久保存）

```
运行脚本 ──► 获取任务列表 ──► 调用 ML Backend ──► 获取预测
                                                    │
                                                    ▼
              保存成功 ◄── POST /api/predictions ◄──┘
                               (保存到数据库)
```

**流程说明：**
1. 脚本通过 API 获取项目中的所有任务
2. 分批发送任务到 ML Backend 进行预测
3. 将每个预测结果通过 `/api/predictions` API 保存到数据库
4. **预测永久保存，可在任务列表页看到预测数量**

---

## 📄 文件详解

### 1. faster_rcnn_backend.py

**用途：** Flask Web 服务器，接收 Label Studio 的预测请求

**核心组件：**

```python
# 模型加载
model = fasterrcnn_resnet50_fpn(weights=FasterRCNN_ResNet50_FPN_Weights.COCO_V1)
model.to(device)  # GPU 加速
model.eval()      # 推理模式
```

**API 端点：**

| 端点       | 方法 | 说明             |
| ---------- | ---- | ---------------- |
| `/health`  | GET  | 健康检查         |
| `/predict` | POST | 执行目标检测     |
| `/setup`   | POST | 初始化设置       |
| `/train`   | POST | 训练接口（示例） |

**预测返回格式：**

```json
{
  "results": [
    {
      "result": [
        {
          "type": "rectanglelabels",
          "from_name": "label",
          "to_name": "image",
          "value": {
            "x": 21.4,           // 左上角 X (百分比)
            "y": 41.1,           // 左上角 Y (百分比)
            "width": 69.4,       // 宽度 (百分比)
            "height": 28.9,      // 高度 (百分比)
            "rotation": 0,
            "rectanglelabels": ["airplane"]  // 类别标签
          },
          "score": 0.997,        // 置信度
          "original_width": 1280,
          "original_height": 853
        }
      ],
      "score": 0.85  // 平均置信度
    }
  ]
}
```

**支持的图片格式：**
- Base64 Data URL (`data:image/...`)
- Label Studio 内部路径 (`/data/upload/...`)
- HTTP/HTTPS URL
- 本地文件路径

---

### 2. predict_project.py

**用途：** 命令行脚本，批量生成预测并保存到数据库

**工作流程：**

```python
# 1. 获取项目任务（使用正确的 API）
tasks = GET /api/projects/{id}/tasks

# 2. 发送到 ML Backend
predictions = POST http://localhost:9090/predict

# 3. 保存每个预测到数据库
POST /api/predictions
{
    "task": task_id,
    "result": [...],
    "score": 0.85,
    "model_version": "faster-rcnn-resnet50-v1.0"
}
```

**命令行参数：**

| 参数              | 简写 | 说明           | 示例    |
| ----------------- | ---- | -------------- | ------- |
| `--project-id`    | `-p` | 项目ID（必需） | `-p 37` |
| `--batch-size`    | `-b` | 每批任务数     | `-b 10` |
| `--skip-existing` | `-s` | 跳过已有预测   | `-s`    |

---

## ⚙️ 配置说明

### ML Backend 配置

在 `faster_rcnn_backend.py` 中可以修改以下配置：

```python
# ===== Label Studio 连接配置 =====
LABEL_STUDIO_URL = "http://localhost:8080"           # Label Studio 服务地址
LABEL_STUDIO_API_TOKEN = "your-api-token-here"       # API Token（在 Label Studio 用户设置中获取）

# ===== 模型权重配置 =====
WEIGHTS_FILENAME = "fasterrcnn_resnet50_fpn_coco.pth"  # 权重文件名
# 程序会自动在 weights/ 目录下查找，找不到则从网络下载

# ===== 检测参数 =====
confidence_threshold = 0.7   # 置信度阈值 (0.3~0.9)
                             # 0.3 = 检测更多目标，但可能有误检
                             # 0.7 = 检测更少目标，但更准确
                             # 0.9 = 只保留高置信度目标
```

### 网络连接配置

| Label Studio 部署方式 | ML Backend URL                     |
| --------------------- | ---------------------------------- |
| Docker 容器           | `http://host.docker.internal:9090` |
| 本机直接运行          | `http://localhost:9090`            |
| 远程服务器            | `http://<服务器IP>:9090`           |
| Kubernetes            | `http://ml-backend-service:9090`   |

### Label Studio 项目设置

| 设置项                                | 值     | 说明               |
| ------------------------------------- | ------ | ------------------ |
| `evaluate_predictions_automatically`  | `True` | 开启实时预测       |
| `show_collab_predictions`             | `True` | 显示已保存的预测   |
| `start_training_on_annotation_update` | `True` | 提交标注后触发训练 |

---

## 🚀 使用指南

### 环境准备

```bash
# 1. 激活 conda 环境
conda activate ml-torch

# 2. 确保依赖已安装
pip install torch torchvision flask pillow requests
```

### 启动 ML Backend

```bash
cd S:\LabelStudio\label-studio-master\ml_integration
python faster_rcnn_backend.py
```

输出示例：
```
INFO:__main__:Loading Faster RCNN model...
INFO:__main__:Using device: cuda
INFO:__main__:Model loaded successfully!
INFO:__main__:Server running on http://0.0.0.0:9090
INFO:__main__:
INFO:__main__:============================================================
INFO:__main__:如果 Label Studio 运行在 Docker 容器中，请使用以下地址连接：
INFO:__main__:  ML Backend URL: http://host.docker.internal:9090
INFO:__main__:如果 Label Studio 运行在本机，请使用：
INFO:__main__:  ML Backend URL: http://localhost:9090
INFO:__main__:============================================================
```

### 批量生成预测

```bash
# 为项目 37 生成预测
python predict_project.py -p 37

# 跳过已有预测的任务
python predict_project.py -p 37 --skip-existing

# 自定义批次大小
python predict_project.py -p 37 -b 10
```

---

## 🔧 故障排除

### 问题1：ML Backend 无法连接

**症状：** Label Studio 显示 ML Backend 状态为 "Error"

**解决：**
```bash
# 检查服务是否运行
curl http://localhost:9090/health

# 确保 Docker 可以访问主机
# Label Studio 中使用 http://host.docker.internal:9090
```

### 问题2：预测不显示

**症状：** 打开任务但看不到预测框

**检查：**
1. 项目设置中 `evaluate_predictions_automatically` 是否为 `True`
2. ML Backend 是否正在运行
3. 查看 ML Backend 终端是否有错误日志

### 问题3：预测数量为 0

**症状：** 实时预测正常，但数据库中无预测

**原因：** 实时预测只是临时显示，不保存到数据库

**解决：** 运行 `predict_project.py` 批量保存预测

---

## 🧠 技术细节

### Faster RCNN 模型

- **骨干网络：** ResNet-50 + FPN (Feature Pyramid Network)
- **预训练数据：** COCO 2017 (80 类)
- **推理设备：** 自动检测 GPU/CPU
- **输入格式：** RGB 图像，任意尺寸

### 智能标签过滤

ML Backend 会**自动读取项目的标签配置**，只返回项目中存在的标签：

```
项目配置的标签: airplane, car, person
         ↓
Faster RCNN 检测到: airplane ✓, car ✓, dog ✗, cat ✗
         ↓
返回结果: 只包含 airplane, car（跳过 dog, cat）
```

**优点：**
- 不会返回项目中未定义的标签
- 避免标注界面出现无法识别的标签
- 自动适配不同项目的标签配置

### 支持的目标类别 (COCO 80类)

```
person, bicycle, car, motorcycle, airplane, bus, train, truck, boat,
traffic light, fire hydrant, stop sign, parking meter, bench, cat, dog,
horse, sheep, cow, elephant, bear, zebra, giraffe, backpack, umbrella,
handbag, tie, suitcase, frisbee, skis, snowboard, sports ball, kite,
baseball bat, baseball glove, skateboard, surfboard, tennis racket,
bottle, wine glass, cup, fork, knife, spoon, bowl, banana, apple,
sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake, chair,
couch, potted plant, bed, dining table, toilet, tv, laptop, mouse,
remote, keyboard, microphone, oven, toaster, sink, refrigerator, book,
clock, vase, scissors, teddy bear, hair drier, toothbrush
```

### Label Studio 坐标系统

Label Studio 使用**百分比坐标**，范围 0-100：

```
(0,0) ─────────────────────► X (100)
  │
  │    ┌─────────────┐
  │    │  检测框      │
  │    │  x, y       │
  │    │  width      │
  │    │  height     │
  │    └─────────────┘
  │
  ▼
Y (100)
```

转换公式：
```python
x_percent = (x_pixel / image_width) * 100
y_percent = (y_pixel / image_height) * 100
width_percent = (box_width / image_width) * 100
height_percent = (box_height / image_height) * 100
```

---

## 📊 性能参考

| 硬件           | 单图推理时间 | 批量处理速度 |
| -------------- | ------------ | ------------ |
| RTX 5070 (GPU) | ~50ms        | ~20 张/秒    |
| RTX 3090 (GPU) | ~60ms        | ~16 张/秒    |
| CPU (i7)       | ~500ms       | ~2 张/秒     |

---

## 🌐 集群部署方案

### Docker Compose 部署

```yaml
version: '3.8'
services:
  label-studio:
    image: heartexlabs/label-studio:latest
    ports:
      - "8080:8080"
    environment:
      - ML_BACKEND_URL=http://ml-backend:9090
    depends_on:
      - ml-backend

  ml-backend:
    build: ./ml_integration
    ports:
      - "9090:9090"
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    volumes:
      - ./ml_integration/weights:/app/weights
```

### Kubernetes 部署

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ml-backend-service
spec:
  selector:
    app: ml-backend
  ports:
    - port: 9090
      targetPort: 9090
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ml-backend
  template:
    spec:
      containers:
      - name: ml-backend
        image: your-registry/ml-backend:latest
        ports:
        - containerPort: 9090
        resources:
          limits:
            nvidia.com/gpu: 1
        livenessProbe:
          httpGet:
            path: /health
            port: 9090
          initialDelaySeconds: 60  # 模型加载时间
```

---

## 📝 更新日志

- **2026-02-01**: v1.0.0 初始版本
  - ✅ 实现 Faster RCNN 目标检测后端
  - ✅ 支持实时预测和批量保存两种模式
  - ✅ 智能标签过滤（只返回项目中存在的标签）
  - ✅ 支持离线环境部署（本地权重加载）
  - ✅ 自动检测 GPU/CPU
  - ✅ 修复 API 端点问题 (`/api/projects/{id}/tasks`)
  - ✅ 添加 `--skip-existing` 参数避免重复预测
  - ✅ 启动时显示 Docker 连接提示

---

## 📚 参考资料

- [Label Studio ML Backend 文档](https://labelstud.io/guide/ml.html)
- [Label Studio API 文档](https://labelstud.io/api)
- [PyTorch Faster RCNN](https://pytorch.org/vision/stable/models/faster_rcnn.html)
- [COCO 数据集类别](https://cocodataset.org/#detection-2017)

---

## ❓ 常见问题

### Q: 为什么需要运行 predict_project.py？
**A:** Label Studio 的 `evaluate_predictions_automatically` 功能只是**临时显示**预测，不会保存到数据库。如果需要永久保存预测结果，需要运行批量预测脚本。

### Q: 如何更换为自己训练的模型？
**A:** 修改 `faster_rcnn_backend.py` 中的模型加载部分，替换为你的模型权重文件，并更新 `COCO_CLASSES` 为你的类别列表。

### Q: 支持其他检测模型吗？
**A:** 可以。只需修改 `FasterRCNNBackend` 类，替换模型加载和推理逻辑，保持返回格式不变即可。

### Q: 如何调整检测灵敏度？
**A:** 修改 `confidence_threshold` 参数：
- 设为 0.3-0.5：检测更多目标，但可能有误检
- 设为 0.7-0.9：只保留高置信度目标
