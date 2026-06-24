# ML 后端集成计划

> **给后续执行者的约束：** 这个文件现在是“讨论与决策计划”，不是立即开工的代码施工单。后续真正实施前，需要先把本文中的待确认问题补齐；实施时再使用 `superpowers:writing-plans` 把已确认决策拆成逐步任务，然后用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 执行。

**目标：** 恢复并标准化当前标注平台与 ML 后端的连接方式，并新增可在 Docker 网络中运行的文本智能标注推理服务。

**总体架构：** 保持 Label Studio 平台作为调度方，每个 ML 服务都实现现有的 Label Studio ML Backend HTTP 协议。图像推理和文本推理先拆成两个独立容器服务，加入同一个 Docker Compose 网络，让 Django `app` 容器通过 Docker 服务名访问 ML 服务，而不是依赖宿主机端口或浏览器能访问的地址。

**技术栈：** Django/DRF 后端、React 设置页、Docker Compose、已有 Flask 图像 ML 后端 `D:\Copy\ml_integration_v2_ImageAnnotation`、后续新增 Python 文本推理后端。

---

## 当前理解

当前项目仍然保留 Label Studio 原生 ML Backend 协议。

相关文件：

- `label_studio/ml/api_connector.py`
  - 平台侧调用 ML 后端的 HTTP 客户端。
  - 会调用 `GET /health`、`POST /setup`、`POST /predict`、`POST /train`。
- `label_studio/ml/models.py`
  - 保存 ML 后端 URL、连接状态、错误信息、模型版本。
  - 根据 `/predict` 返回结果创建 `Prediction`。
- `label_studio/ml/serializers.py`
  - 保存 ML 后端连接时做校验。
  - 要求 `/health` 和 `/setup` 成功。
- `label_studio/frontend/src/pages/Settings/MachineLearningSettings/MachineLearningSettings.js`
  - 智能标注设置页。
  - 当前有默认 ML 后端候选 URL 逻辑。
  - 会读取 `window.APP_SETTINGS.mlHost`。
- `label_studio/core/settings/base.py`
  - 已支持 `ML_HOST` 环境变量。
- `label_studio/core/context_processors.py`
  - 会把 `mlHost` 注入前端。
- `docker-compose.yml`
  - 当前有 `nginx`、`app`、`db`。
  - 还没有把 ML 后端容器纳入 compose。
- `D:\Copy\ml_integration_v2_ImageAnnotation\app.py`
  - 旧的图像 ML 后端。
  - 已经提供 `/health`、`/setup`、`/validate`、`/train`、`/predict`。
  - 额外有一个控制台，可以主动从 Label Studio 拉任务并通过 `/api/predictions` 写回预测结果。

## 关键原则

不要让浏览器承担 ML 连通性。

浏览器只是把 ML 后端 URL 保存到 Label Studio。真正做连接测试和推理调用的是 Django `app` 容器。因此，在 Docker Compose 场景下，保存到平台里的 ML 后端 URL 应该是 `app` 容器能访问的地址，不一定是用户浏览器能打开的地址。

推荐内部地址：

- 图像 ML 后端：`http://ml-backend-image:9091`
- 文本 ML 后端：`http://ml-backend-text:9092`
- ML 容器访问 Label Studio：`http://app:8080`

宿主机或浏览器可访问的端口只能作为调试便利，不应该成为核心集成路径。

## 目标架构

先使用两个独立 ML 后端容器：

1. `ml-backend-image`
   - 复用 `D:\Copy\ml_integration_v2_ImageAnnotation`。
   - 使用源码构建镜像，不使用预构建镜像作为第一选择。
   - 模型权重稍后由使用者补充到图像后端源码目录中。
   - 运行 Faster R-CNN 图像目标检测。
   - 容器内监听 `9091`。
   - Label Studio 使用 `http://ml-backend-image:9091` 连接。

2. `ml-backend-text`
   - 新增文本智能标注后端。
   - 第一版只支持一个明确的文本任务类型：文本分类、NER 实体抽取，或大模型结构化标注三选一。
   - 容器内监听 `9092`。
   - Label Studio 使用 `http://ml-backend-text:9092` 连接。

3. `app`
   - 现有 Label Studio Django 容器。
   - 通过 Docker DNS 调用 ML 后端。
   - 通过 `ML_HOST` 提供默认智能标注连接地址。

4. `nginx`
   - 继续作为用户访问平台的入口。
   - 图像后端控制台需要浏览器可访问。第一阶段可以直接暴露 `ml-backend-image` 宿主机端口；后续如果需要统一入口，再考虑由 nginx 代理。

## 协议约定

每个 ML 后端至少要支持以下接口。

### `GET /health`

用途：快速检查服务是否可用。

期望返回：

```json
{
  "status": "ok",
  "model_version": "some-version"
}
```

### `POST /setup`

用途：确认 ML 后端能处理当前项目的标注配置。

Label Studio 会发送：

```json
{
  "project": "1.1719200000",
  "schema": "<View>...</View>",
  "hostname": "http://...",
  "access_token": "..."
}
```

期望返回：

```json
{
  "status": "ok",
  "model_version": "some-version"
}
```

### `POST /predict`

用途：生成 AI 初稿预测。

Label Studio 会发送：

```json
{
  "tasks": [
    {
      "id": 123,
      "data": {
        "text": "example text",
        "image": "/data/upload/..."
      }
    }
  ],
  "model_version": "some-version",
  "project": "1.1719200000",
  "label_config": "<View>...</View>",
  "params": {
    "login": null,
    "password": null
  }
}
```

期望返回：

```json
{
  "results": [
    {
      "result": [],
      "score": 0.0
    }
  ]
}
```

注意：`results` 的数量和顺序应该与传入的 `tasks` 一致。

### `POST /train`

第一版可以不实现真实训练。

期望返回：

```json
{
  "status": "ok",
  "message": "Training is not implemented.",
  "model_version": "some-version"
}
```

## 第 0 阶段：实施前必须讨论清楚的问题

这些问题没有确认前，不要开始改业务代码。

当前阶段优先级：

```text
第一优先级：先讨论并跑通图像 ML 后端连接。
文本推理类型暂不展开讨论，只保留已经确认的容器与模型运行方向。
```

### 问题 1：文本推理第一版到底做什么

必须先选一个，不要一开始全都做。

当前结论：

```text
暂不讨论。
当前先集中把图像 ML 后端跑通，文本任务类型后续再定。
```

可选方向：

1. 文本分类
   - 示例配置：`Text` + `Choices`。
   - 第一版最容易跑通。
   - 输出整段文本的一个或多个类别。

2. NER / 实体抽取
   - 示例配置：`Text` + `Labels`。
   - 更接近信息抽取类业务。
   - 需要返回精确的 `start`、`end`、`text` 偏移。
   - 必须确认中文字符偏移、标点、空格如何处理。

3. 大模型结构化标注
   - 模型根据项目配置读取文本并生成标签或实体。
   - 最灵活。
   - 风险最高，需要明确 prompt、schema 校验、超时、重试和错误处理。

建议：

- 如果目标是先快速看到“智能标注能跑”，第一版选文本分类。
- 如果真实业务目标是信息抽取，第一版直接选 NER，但要接受复杂度更高。

待确认：

```text
选择的文本推理类型：暂不讨论
选择理由：当前优先跑通图像 ML 后端
第一版要支持的 label config 示例：后续确认
```

### 问题 2：文本模型运行方式

需要确认文本后端实际怎么推理。

当前结论：

```text
文本后端容器内运行本地 Transformers 模型。
容器镜像中应该包含已经训练好的模型权重。
文本后端和图像后端一样，应作为独立可部署、可连接的 ML backend 服务运行。
```

可选方向：

1. 规则版 MVP
   - 最快验证平台集成。
   - 不是真正 ML 模型。
   - 适合先证明预测格式、前端展示、批量生成流程没问题。

2. 文本后端容器内运行本地 Transformers 模型
   - 自包含。
   - 可以先 CPU，后续再 GPU。
   - 镜像体积和启动时间会增加。

3. 外部 OpenAI-compatible API、Ollama、vLLM 或其他模型服务
   - 文本后端作为适配器。
   - 模型替换更灵活。
   - 需要确认网络、凭证、超时、失败策略。

建议：

- 文本后端内部先抽象出清晰的 `predict_text()` 边界。
- 第一版可以用规则版或小模型验证完整流程。
- 后续保留接 Ollama/vLLM/OpenAI-compatible 服务的空间。

待确认：

```text
选择的运行方式：文本后端容器内运行本地 Transformers 模型
模型名称或服务提供方：后续确认
CPU/GPU 要求：后续确认
单条任务期望平均耗时：后续确认
```

### 问题 3：一个后端还是多个后端

可选方向：

当前结论：

```text
图像和文本拆成独立后端。
第一阶段只跑通图像后端；文本后端后续单独实现。
```

1. 图像和文本拆成独立后端
   - `ml-backend-image`
   - `ml-backend-text`
   - 调试简单，部署简单。
   - 图像依赖和文本依赖不会互相污染。

2. 做一个合并后端
   - 只有一个 URL。
   - 后端内部解析 label config 再路由到图像或文本逻辑。
   - UI 上方便一些，但后端更容易变复杂。

建议：

- 先拆成两个独立后端。
- 等图像和文本都稳定后，再考虑是否需要一个路由网关。

待确认：

```text
后端拓扑选择：图像和文本拆成独立后端
未来是否需要路由网关：暂不需要，等两个后端稳定后再评估
```

### 问题 4：默认连接按钮怎么处理

当前智能标注设置页只有一个“连接默认智能标注模型”按钮。

当前结论：

```text
显示多个默认按钮：
1. 连接默认图像模型
2. 连接默认文本模型

第一阶段可以先实现并验证图像按钮；文本按钮可以先保留为后续阶段能力，或在文本后端未接入前禁用/提示未配置。
```

可选方向：

1. 保持一个默认后端
   - 配置 `ML_HOST=http://ml-backend-image:9091`。
   - 文本后端先手动自定义连接。

2. 根据项目 label config 自动推荐
   - 配置里有 `<Image>`，推荐图像后端。
   - 配置里有 `<Text>`，推荐文本后端。
   - 需要改前端逻辑。

3. 显示多个默认按钮
   - “连接图像模型”
   - “连接文本模型”
   - 用户清楚，但 UI 需要更多改动。

建议：

- 第一阶段先用 `ML_HOST` 保持一个默认后端。
- 文本后端跑通后，再做配置识别或多按钮。

待确认：

```text
第一阶段默认按钮行为：显示“连接默认图像模型”和“连接默认文本模型”，优先跑通图像按钮
长期期望行为：图像和文本都有明确默认连接入口
```

### 问题 5：旧图像后端控制台是否保留

旧图像后端有控制台和管理 API，可以主动调用 Label Studio：

当前结论：

```text
旧图像后端控制台需要保留。
控制台需要从浏览器访问。
但平台集成主路径仍以 Label Studio 调 ML backend 的 `/predict` 为准。
控制台作为诊断、配置检查、连接失败时的恢复入口，以及管理员批处理入口保留。
```

- 拉项目元信息。
- 拉任务。
- 通过 `/api/predictions` 写回预测。

这和 Label Studio 主动调用 `/predict` 是两条不同路径。

可选方向：

1. 保留控制台作为可选管理工具
   - 需要区分两个地址：
     - 容器内部服务地址
     - 浏览器可访问的公开地址

2. 忽略控制台，只走平台内置智能标注流程
   - 更简单。
   - 使用 Label Studio 的智能标注连接和 Data Manager 批量生成。

建议：

- 保留控制台代码，但不要把它作为平台集成的主路径。
- 官方路径以 Label Studio 调 `/predict` 为准。

待确认：

```text
生产环境是否需要控制台：是
是否需要 nginx 暴露控制台：需要浏览器可访问；第一阶段可先直接暴露宿主机端口，后续再决定是否改成 nginx 代理
```

### 问题 6：认证 Token 策略

旧后端使用：

当前结论：

```text
部署场景是可信内网。
ML 后端应该是大家共用的服务，不绑定某个个人用户。
使用共享管理员 token。
```

```text
LABEL_STUDIO_API_TOKEN=shared-admin-fixed-token
```

这个方案依赖共享管理员模式或固定 token。

需要确认：

- 部署场景是否只是可信内网？
- 是否启用 `ENABLE_SHARED_ADMIN_MODE=true`？
- ML 后端是否应该使用专门的服务账号 token，而不是共享管理员 token？

建议：

- 本地或内网 compose 测试可以用 `SHARED_ADMIN_FIXED_TOKEN`。
- 类生产环境应该创建专门的 ML 服务账号 token。

待确认：

```text
Token 来源：共享管理员 token，例如 `shared-admin-fixed-token`
是否启用共享管理员模式：倾向启用或至少保证固定共享管理员 token 可用
生产环境安全要求：可信内网共用服务；后续如有外网/多租户要求再改为专门服务账号 token
```

### 问题 7：预测生成入口

当前平台至少有这些生成预测的入口：

1. 项目设置里连接 ML 后端，然后平台在任务加载或批量动作中生成预测。
2. Data Manager 动作“生成 AI 初稿”，对选中任务调用已连接 ML 后端。
3. 旧 ML 后端控制台主动拉任务并写回预测。

当前代码确认：

- `label_studio/data_manager/actions/basic.py` 里已有 `retrieve_tasks_predictions()`，动作标题是“生成 AI 初稿”，会对选中任务调用已连接且状态为 connected 的 ML 后端。
- `label_studio/data_manager/functions.py` 里的 `evaluate_predictions()` 会调用 `ml_backend.predict_many_tasks(tasks)`。
- `label_studio/projects/api.py` 的 `ProjectNextTaskAPI._make_response()` 中，如果 `project.show_collab_predictions` 为真且当前任务没有 predictions，会调用 `ml_backend.predict_one_task(next_task)`。
- 因此平台已有两个核心入口：Data Manager 批量生成，以及打开/领取下一条任务时单条生成。

当前结论：

```text
先使用平台已有入口，不新增新的预测入口。
第一轮重点验证 Data Manager 的“生成 AI 初稿”批量入口。
打开任务时自动预测作为现有能力保留，但不是第一轮主要验证路径。
旧图像后端控制台保留为辅助入口。
```

建议官方流程：

- 以平台内置 ML 后端连接 + Data Manager 批量生成为主。
- 旧控制台只作为诊断或管理员批处理工具。

待确认：

```text
主要用户流程：项目设置连接 ML 后端后，在 Data Manager 对选中任务执行“生成 AI 初稿”
是否需要打开任务时自动预测：保留现有能力，第一轮不重点改
是否需要批量对选中任务生成预测：是，第一轮重点验证
```

## 第 1 阶段：打通图像后端容器网络

目标：让当前已有图像后端可以在 Docker Compose 中被 Label Studio `app` 容器访问。

本阶段只处理图像后端。文本后端不在本阶段实现。

计划做：

- 修改 `docker-compose.yml`。
- 增加 `ml-backend-image` 服务。
- `ml-backend-image` 使用源码构建：

```yaml
build:
  context: ../ml_integration_v2_ImageAnnotation
```

- 图像权重稍后补充到 `D:\Copy\ml_integration_v2_ImageAnnotation\weights`。
- 注意：旧图像后端 Dockerfile 中有 `COPY weights /app/weights`。如果实施时权重目录还没放进去，构建会失败；因此要么先放好权重目录，要么至少放一个空的 `weights` 目录作为构建占位。
- 给 `app` 设置：

```text
ML_HOST=http://ml-backend-image:9091
```

- 给 `ml-backend-image` 设置：

```text
LABEL_STUDIO_URL=http://app:8080
LABEL_STUDIO_API_TOKEN=shared-admin-fixed-token
ML_BACKEND_PORT=9091
ML_BACKEND_URL=http://localhost:9091
MODEL_VERSION=faster-rcnn-resnet50-v1.0
MODEL_VERSION_OPTIONS=faster-rcnn-resnet50-v1.0
CONFIDENCE_THRESHOLD=0.7
IMAGE_REQUEST_TIMEOUT=20
INFERENCE_DEVICE=cpu
```

地址分工：

```text
Label Studio 保存并调用的 ML 后端地址：   http://ml-backend-image:9091
浏览器访问图像后端控制台的地址：         http://localhost:9091/console 或服务器公开地址
ML 后端反向访问 Label Studio 的地址：     http://app:8080
```

如果部署到服务器，`ML_BACKEND_URL` 应使用浏览器可访问的服务器地址，例如：

```text
ML_BACKEND_URL=http://服务器IP:9091
```

Compose 中应暴露控制台端口，例如：

```yaml
ports:
  - "9091:9091"
```

连通性检查：

```powershell
docker compose exec app curl -f http://ml-backend-image:9091/health
docker compose exec ml-backend-image python -c "import requests; print(requests.get('http://app:8080/api/projects', timeout=10).status_code)"
```

浏览器控制台检查：

```text
http://localhost:9091/console
```

期望结果：

- 第一个命令返回 HTTP 200。
- 第二个命令根据认证情况可能返回 HTTP 200、401 或 403。
- 如果 token 正确，ML 后端应能访问 Label Studio API。

风险点：

- 如果 `app` 容器内部实际不是 `8080`，需要改用 `http://nginx` 或确认真实内部端口。

## 第 2 阶段：平台默认连接

目标：把智能标注设置页从单个默认连接入口调整为多个明确入口。

计划做：

- 增加或调整按钮：
  - “连接默认图像模型”
  - “连接默认文本模型”
- 第一阶段先让“连接默认图像模型”使用 Docker 内部可访问的图像 ML 后端地址。
- 文本按钮可以先隐藏、禁用或显示“文本后端未配置”，具体 UI 行为在文本阶段前再定。
- 图像默认地址优先使用环境变量：

```text
ML_HOST=http://ml-backend-image:9091
```

- 如果后续需要两个默认地址，建议新增环境变量，而不是继续复用单个 `ML_HOST`：

```text
ML_IMAGE_HOST=http://ml-backend-image:9091
ML_TEXT_HOST=http://ml-backend-text:9092
```

- `ML_HOST` 可以保留为兼容旧逻辑的图像默认地址，或作为 fallback。
- 确认前端渲染出的 `window.APP_SETTINGS.mlHost` 有值。

验证方式：

- 打开项目设置中的智能标注页。
- 点击“连接默认图像模型”。
- 确认保存的后端 URL 是 `http://ml-backend-image:9091`。
- 确认状态为已连接。
- 确认模型版本来自 `/setup`。

风险点：

- 保存的 URL 是 Docker 内部地址，浏览器不一定能打开。UI 文案不能暗示用户必须能在浏览器里访问这个 URL。

## 第 3 阶段：文本后端 MVP

目标：新增一个文本 ML 后端，能生成合法的 Label Studio AI 初稿。

开始前必须确认：

- 文本推理类型。
- 具体 Transformers 模型名称。
- 已训练权重如何放入镜像。
- CPU/GPU 运行要求。
- 第一版支持的 label config。

如果放在本仓库，建议目录：

```text
ml_backends/text/
  app.py
  Dockerfile
  requirements.txt
  README.md
  tests/
    test_predict_contract.py
```

如果作为兄弟项目，建议目录：

```text
D:\Copy\ml_integration_text/
  app.py
  Dockerfile
  requirements.txt
  README.md
  tests/
    test_predict_contract.py
```

协议行为：

- 容器内加载本地 Transformers 模型和已训练权重。
- 解析 `label_config`。
- 找到 `Text` 对象标签。
- 找到支持的控制标签。
- 从 `task["data"]` 提取文本。
- 每个 task 返回一个 prediction result。

文本分类返回示例：

```json
{
  "results": [
    {
      "result": [
        {
          "from_name": "sentiment",
          "to_name": "text",
          "type": "choices",
          "value": {
            "choices": ["positive"]
          }
        }
      ],
      "score": 0.87
    }
  ]
}
```

NER 返回示例：

```json
{
  "results": [
    {
      "result": [
        {
          "from_name": "ner",
          "to_name": "text",
          "type": "labels",
          "value": {
            "start": 0,
            "end": 2,
            "text": "北京",
            "labels": ["地点"]
          }
        }
      ],
      "score": 0.91
    }
  ]
}
```

验证方式：

- 单元测试 `/predict` 返回结构。
- 项目设置中手动连接 `http://ml-backend-text:9092`。
- Data Manager 中执行“生成 AI 初稿”。
- 打开任务，确认预测作为 AI 初稿显示。

## 第 4 阶段：多后端 UI

目标：当图像和文本后端都存在时，智能标注设置页要让用户看得明白。

可选改进：

1. 多个默认连接按钮
   - “连接默认图像模型”
   - “连接默认文本模型”

2. 根据项目配置推荐默认后端
   - 配置包含 `<Image>`，推荐图像后端。
   - 配置包含 `<Text>`，推荐文本后端。

3. ML 后端返回能力元信息
   - 可选地在 `/health` 或 `/setup` 返回：

```json
{
  "status": "ok",
  "model_version": "text-ner-v1",
  "capabilities": ["text", "ner"]
}
```

风险点：

- 当前 `MLBackend` 模型没有存丰富能力信息。除非 UI 确实需要，否则不要过早扩展数据库字段。

## 第 5 阶段：生产化加固

基础图像和文本流程都跑通后再做。

需要考虑：

- 使用专门 ML 服务账号 token，而不是共享管理员 token。
- 健康检查超时和服务启动 readiness。
- 模型预热。
- GPU compose profile。
- 模型和缓存持久化 volume。
- 预测失败日志。
- 用户可读的连接错误信息。
- Docker 网络假设的验证测试。

## 第一版不做什么

第一版不要做这些：

- 不重写 Label Studio ML 协议。
- 不急着把图像和文本合并成一个后端。
- 不要求浏览器能直连 ML 后端。
- 不把旧图像后端控制台作为主预测路径。
- 不新增数据库模型，除非确认现有 `MLBackend` 字段不够。
- 不做训练流程，先把预测连通性跑通。

## 建议讨论议程

实施前先补齐这些答案：

```text
1. 文本推理类型：暂不讨论
2. 第一版文本 label config：后续确认
3. 文本模型运行方式：容器内运行本地 Transformers 模型，并包含已训练权重
4. 图像后端用源码构建还是预构建镜像：源码构建，权重稍后添加
5. 文本后端放在本仓库还是兄弟仓库：待确认
6. 默认连接按钮行为：显示“连接默认图像模型”和“连接默认文本模型”
7. 是否需要暴露旧图像后端控制台：需要从浏览器访问；第一阶段先暴露宿主机端口，后续再评估 nginx 代理
8. 认证 token 策略：可信内网使用共享管理员 token
9. 主要预测生成入口：先使用 Data Manager 的“生成 AI 初稿”
10. CPU/GPU 和部署目标：图像先按现有 CPU 后端跑通；文本后续确认
```

## 推荐初始决策

如果希望风险最低，建议先这样定：

```text
1. 图像和文本 ML 后端拆成两个容器。
2. Label Studio 通过 Docker 服务名访问 ML 服务。
3. 第一阶段先跑通图像后端：`http://ml-backend-image:9091`。
4. 智能标注设置页显示“连接默认图像模型”和“连接默认文本模型”两个入口。
5. 图像后端使用 `D:\Copy\ml_integration_v2_ImageAnnotation` 源码构建，权重稍后补充。
6. 旧图像后端控制台保留并从浏览器可访问，但平台主路径仍走 `/predict`。
7. 可信内网使用共享管理员 token。
8. 文本后端后续单独实现 `/health`、`/setup`、`/predict` 协议，并在容器内加载本地 Transformers 权重。
9. 第一轮官方验证入口使用 Data Manager 的“生成 AI 初稿”。
```

## 第一轮实施完成标准

第一轮实现只有满足以下条件才算完成：

- `docker compose up` 能启动 Label Studio、数据库、图像 ML 后端。
- Label Studio `app` 容器能访问 `http://ml-backend-image:9091/health`。
- 图像后端使用源码构建；实施时权重目录已经就位，或至少构建占位目录已经存在。
- “连接默认图像模型”能保存一个已连接后端。
- 选中的图像任务能通过平台生成 AI 初稿。
- 旧图像后端控制台可以从浏览器访问，例如 `http://localhost:9091/console` 或服务器公开地址。
- 文本推理类型暂不实施，不在未确认状态下开写。

文本后端实现后，还需要满足：

- `docker compose up` 能启动 `ml-backend-text`。
- Label Studio `app` 容器能访问 `http://ml-backend-text:9092/health`。
- 文本项目可以连接文本后端。
- 选中的文本任务可以生成合法 Label Studio prediction 格式的 AI 初稿。
