# ML Backend 镜像交付说明（非 compose）

本文档目标：产出一个可直接传给别人使用的镜像文件（`.tar`）。

## 1) 本地构建镜像

在仓库根目录执行：

```bash
docker build -f ml_integration/Dockerfile -t huibiao/ml-backend:faster-rcnn-v1 .
```

## 2) 导出镜像文件（用于传输）

```bash
docker save -o huibiao-ml-backend-faster-rcnn-v1.tar huibiao/ml-backend:faster-rcnn-v1
```

把 `huibiao-ml-backend-faster-rcnn-v1.tar` 发给对方即可。

## 3) 对方导入并运行镜像

### 3.1 导入镜像

```bash
docker load -i huibiao-ml-backend-faster-rcnn-v1.tar
```

### 3.2 准备环境变量文件（示例）

新建一个 `ml-backend.env`：

```env
LABEL_STUDIO_URL=http://<label-studio-host>:8080
LABEL_STUDIO_API_TOKEN=<replace-with-token>
ML_BACKEND_PORT=9090
MODEL_VERSION=faster-rcnn-resnet50-v1.0
CONFIDENCE_THRESHOLD=0.7
```

### 3.3 启动容器

```bash
docker run -d \
	--name ml-backend \
	--env-file ml-backend.env \
	-p 9090:9090 \
	-v $(pwd)/weights:/app/weights:ro \
	huibiao/ml-backend:faster-rcnn-v1
```

说明：
- `weights` 目录可选；若不挂载本地权重，服务会尝试在线下载预训练权重。
- 如果 Label Studio 与该容器在同一 Docker 网络，`LABEL_STUDIO_URL` 可写容器名，例如 `http://app:8080`。

## 4) 健康检查

```bash
curl http://localhost:9090/health
```

## 5) 在 Label Studio 中接入

项目设置 -> Machine Learning -> Add Model：
- URL：`http://<ML容器可达地址>:9090`

## 6) 可选：推送到私有镜像仓库

如果不想传 tar，也可以推送到仓库：

```bash
docker tag huibiao/ml-backend:faster-rcnn-v1 <registry>/huibiao/ml-backend:faster-rcnn-v1
docker push <registry>/huibiao/ml-backend:faster-rcnn-v1
```

## 7) 生产建议

- 不要在镜像内写死 Token，统一走 `--env-file` 或密钥管理。
- 镜像版本建议使用不可变 tag（例如 `faster-rcnn-v1-20260317`）。
- GPU 推理可改为 CUDA 基础镜像并使用 `--gpus all` 启动。
