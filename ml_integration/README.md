# Label Studio ML 集成模块

本模块实现了 Faster RCNN 目标检测模型与 Label Studio 的集成，支持自动预标注功能。

## 📁 文件结构

```
ml_integration/
├── faster_rcnn_backend.py   # ML Backend 服务器（实时预测）
├── predict_project.py       # 批量预测脚本（保存到数据库）
└── README.md                # 本文档
```

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

在 `faster_rcnn_backend.py` 中：

```python
# Label Studio 连接配置
LABEL_STUDIO_URL = "http://localhost:8080"
LABEL_STUDIO_API_TOKEN = "your-token-here"

# 检测置信度阈值（0.3~0.9）
confidence_threshold = 0.7  # 越高越严格
```

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

### 支持的目标类别 (COCO)

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
| CPU (i7)       | ~500ms       | ~2 张/秒     |

---

## 📝 更新日志

- **2026-02-01**: 初始版本
  - 实现 Faster RCNN 目标检测后端
  - 支持实时预测和批量保存
  - 修复 API 端点问题 (`/api/projects/{id}/tasks`)
  - 添加 `--skip-existing` 参数

---

## 📚 参考资料

- [Label Studio ML Backend 文档](https://labelstud.io/guide/ml.html)
- [PyTorch Faster RCNN](https://pytorch.org/vision/stable/models/faster_rcnn.html)
- [Label Studio API 文档](https://labelstud.io/api)
