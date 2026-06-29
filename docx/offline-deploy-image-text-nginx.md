# 离线部署说明：标注平台 + 图像智能标注 + 文本智能标注 + Nginx

本文档用于部署当前版本的慧标标注平台。相比旧版部署方案，本版本新增了文本智能标注后端容器。

当前部署包含四类容器：

- 标注平台容器：`huibiao-system:<tag>`
- 图像智能标注后端：`ml-backend-image-cpu:<tag>`
- 文本智能标注后端：`ml-backend-text-nllb-cpuonly:<tag>`
- Nginx 入口容器：`nginx:latest`

推荐拓扑：

```text
浏览器
  |
  | http://<标注平台服务器IP>:7000
  v
Nginx 容器 huibiao-nginx
  |
  | Docker 内网 http://huibiao-system:8080
  v
标注平台容器 huibiao-system
  |                         |
  | Docker 内网              | Docker 内网
  | http://ml-backend-image:9091
  |                         | http://ml-backend-text:9091
  v                         v
图像后端 ml-backend-image     文本后端 ml-backend-text
```

## 1. 部署前确认

以下示例使用占位地址：

```text
标注平台服务器 IP：68.68.18.26
标注平台浏览器入口端口：7000
图像后端外部调试端口：9091
文本后端外部调试端口：9002
外部 SSO / 数据集平台：68.68.18.26:31798
```

实际部署时需要把 IP、端口和镜像 tag 替换成真实环境值。

示例镜像：

```text
huibiao-system:06251
ml-backend-image-cpu:06251
ml-backend-text-nllb-cpuonly:06261
nginx:latest
```

如果你手里的 tar 包名称或 tag 不一致，后续 `docker run` 命令里的镜像名也要同步替换。

## 2. 加载离线镜像

把 tar 包复制到离线服务器后执行：

```powershell
docker load -i .\huibiao-system_06251.tar
docker load -i .\ml-backend-image-cpu_06251.tar
docker load -i .\ml-backend-text-nllb-cpuonly_06261.tar
docker load -i .\nginx_latest.tar
```

检查镜像：

```powershell
docker images
```

应能看到类似：

```text
huibiao-system                  06251
ml-backend-image-cpu            06251
ml-backend-text-nllb-cpuonly    06261
nginx                           latest
```

## 3. 准备部署目录

建议固定在一个目录下操作：

```powershell
mkdir D:\huibiao-deploy
cd D:\huibiao-deploy

mkdir mydata
mkdir postgres-data
mkdir nginx
```

目录用途：

```text
mydata          保存上传文件、导出文件、媒体文件等
postgres-data   保存标注平台容器内置 PostgreSQL 数据
nginx           保存 Nginx 配置
```

重要：`mydata` 和 `postgres-data` 要长期保留。删除容器不会删除这两个目录，但删除目录会丢数据。

## 4. Nginx 配置是否需要修改

新增文本后端后，Nginx 通常不需要新增转发规则。

原因是：

- 浏览器只访问标注平台入口 `http://<服务器IP>:7000`。
- 标注平台容器通过 Docker 内网访问图像后端和文本后端。
- 文本后端不需要浏览器直接访问，也不需要通过 Nginx 暴露给前端。

仍然使用原来的 Nginx 配置即可。创建文件：

```text
D:\huibiao-deploy\nginx\default.conf
```

内容如下。请把 `68.68.18.26:31798` 替换成真实的外部 SSO / 数据集平台地址。

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 1024m;

    location /api/v1/admin/user/dict/ {
        proxy_pass http://68.68.18.26:31798;
        proxy_set_header Host 68.68.18.26:31798;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/fileExplorer/ {
        proxy_pass http://68.68.18.26:31798;
        proxy_set_header Host 68.68.18.26:31798;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://huibiao-system:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
```

只有在你希望浏览器也通过 Nginx 访问文本后端调试接口时，才需要额外加 `/ml-text/` 之类的代理。正常智能标注流程不需要。

## 5. 停止旧容器

如果是重新部署，先停止并删除旧容器：

```powershell
docker stop huibiao-nginx huibiao-system ml-backend-image ml-backend-text
docker rm huibiao-nginx huibiao-system ml-backend-image ml-backend-text
```

如果提示容器不存在，可以忽略。

不要删除：

```text
mydata
postgres-data
```

## 6. 创建 Docker 网络

```powershell
docker network create huibiao-net
```

如果提示网络已存在，可以忽略。

## 7. 启动标注平台

请把下面命令里的 `68.68.18.26`、`68.68.18.26:31798`、镜像 tag 替换成真实值。

```powershell
docker run -d `
  --name huibiao-system `
  --network huibiao-net `
  --network-alias huibiao-system `
  -v ${PWD}\mydata:/label-studio/data `
  -v ${PWD}\postgres-data:/var/lib/postgresql/data `
  -e POSTGRE_HOST=localhost `
  -e POSTGRE_PORT=5432 `
  -e POSTGRE_USER=postgres `
  -e POSTGRE_PASSWORD=postgres `
  -e POSTGRE_NAME=postgres `
  -e LABEL_STUDIO_HOST=http://68.68.18.26:7000 `
  -e HOST=http://68.68.18.26:7000 `
  -e SSO_USERINFO_HOST=68.68.18.26:31798 `
  -e SSO_DATASET_API_HOST="" `
  -e SSO_DEBUG_MOCK=false `
  -e ENABLE_SHARED_ADMIN_MODE=false `
  -e ML_HOST=http://ml-backend-image:9091 `
  -e ML_IMAGE_HOST=http://ml-backend-image:9091 `
  -e ML_TEXT_HOST=http://ml-backend-text:9091 `
  -e ML_LABEL_STUDIO_URL=http://huibiao-system:8080 `
  huibiao-system:06251
```

关键变化是新增：

```text
ML_TEXT_HOST=http://ml-backend-text:9091
```

标注平台前端已经预留默认文本模型入口。后端会把 `ML_TEXT_HOST` 暴露到 `window.APP_SETTINGS.mlTextHost`，智能标注设置页会把它作为“默认文本模型”的候选地址。

不要给标注平台容器映射 `-p 7000:8080`。`7000` 端口只给 Nginx 使用。

## 8. 启动图像智能标注后端

```powershell
docker run -d `
  --name ml-backend-image `
  --network huibiao-net `
  --network-alias ml-backend-image `
  -p 9091:9091 `
  -e LABEL_STUDIO_URL=http://huibiao-system:8080 `
  -e LABEL_STUDIO_API_TOKEN=placeholder `
  -e ML_BACKEND_PORT=9091 `
  -e ML_BACKEND_URL=http://68.68.18.26:9091 `
  -e MODEL_VERSION=faster-rcnn-resnet50-v1.0 `
  -e MODEL_VERSION_OPTIONS=faster-rcnn-resnet50-v1.0 `
  -e CONFIDENCE_THRESHOLD=0.7 `
  -e IMAGE_REQUEST_TIMEOUT=20 `
  -e INFERENCE_DEVICE=cpu `
  ml-backend-image-cpu:06251
```

说明：

- `LABEL_STUDIO_URL=http://huibiao-system:8080` 是 Docker 内网地址。
- `ML_BACKEND_URL=http://68.68.18.26:9091` 是给浏览器或管理员调试看的外部地址。
- 当前智能标注推理不依赖 `.env` 或 console 保存的旧 token。图像后端在 `/predict` 时使用标注平台随请求传入的当前用户 token。
- `LABEL_STUDIO_API_TOKEN=placeholder` 只是兼容占位，不是多人推理的主路径。

## 9. 启动文本智能标注后端

```powershell
docker run -d `
  --name ml-backend-text `
  --network huibiao-net `
  --network-alias ml-backend-text `
  -p 9002:9091 `
  -e ML_BACKEND_PORT=9091 `
  -e TEXT_MODEL_NAME=/app/models/nllb-200-distilled-600M `
  -e MODEL_VERSION=nllb-translation-v1 `
  -e DEFAULT_SRC_LANG=eng_Latn `
  -e DEFAULT_TGT_LANG=zho_Hans `
  -e MAX_TRANSLATION_LENGTH=512 `
  -e INFERENCE_DEVICE=cpu `
  -e MAX_CONCURRENT_INFERENCE=1 `
  -e INFERENCE_WAIT_TIMEOUT=30 `
  -e TRANSFORMERS_OFFLINE=1 `
  -e HF_HUB_OFFLINE=1 `
  ml-backend-text-nllb-cpuonly:06261
```

说明：

- 文本后端容器内部监听 `9091`。
- `-p 9002:9091` 只是为了从宿主机调试，例如访问 `http://<服务器IP>:9002/health`。
- 标注平台容器访问文本后端时使用 Docker 内网地址：`http://ml-backend-text:9091`。
- 文本任务的数据通常直接在 `task.data` 里，所以一般不需要再用 token 下载文件；但接口仍然接收请求级 token，保持和图像后端一致。
- NLLB 模型第一次推理会加载模型，可能比后续请求慢。
- CPU 版本建议先保持 `MAX_CONCURRENT_INFERENCE=1`，避免多人同时推理时内存和 CPU 被打满。

## 10. 启动 Nginx

```powershell
docker run -d `
  --name huibiao-nginx `
  --network huibiao-net `
  -p 7000:80 `
  -v ${PWD}\nginx\default.conf:/etc/nginx/conf.d/default.conf:ro `
  nginx:latest
```

浏览器访问：

```text
http://68.68.18.26:7000
```

图像后端调试地址：

```text
http://68.68.18.26:9091/health
http://68.68.18.26:9091/console
```

文本后端调试地址：

```text
http://68.68.18.26:9002/health
```

## 11. 验证部署

查看容器：

```powershell
docker ps
```

检查标注平台：

```powershell
curl http://127.0.0.1:7000/api/version
```

检查图像后端：

```powershell
curl http://127.0.0.1:9091/health
```

检查文本后端：

```powershell
curl http://127.0.0.1:9002/health
```

检查标注平台容器能否访问两个 ML 后端：

```powershell
docker exec huibiao-system curl http://ml-backend-image:9091/health
docker exec huibiao-system curl http://ml-backend-text:9091/health
```

检查 ML 后端能否访问标注平台：

```powershell
docker exec ml-backend-image curl http://huibiao-system:8080/api/version
docker exec ml-backend-text curl http://huibiao-system:8080/api/version
```

如果文本后端容器没有 `curl`，可以只用宿主机的 `http://127.0.0.1:9002/health` 验证。

## 12. 文本后端推理烟测

可以在宿主机执行：

```powershell
$payload = @'
{
  "tasks": [
    {
      "id": 1,
      "data": {
        "source": "This is a test sentence."
      }
    }
  ],
  "label_config": "<View><Text name=\"source\" value=\"$source\"/><TextArea name=\"target\" toName=\"source\"/></View>",
  "params": {
    "src_lang": "eng_Latn",
    "tgt_lang": "zho_Hans"
  },
  "label_studio": {
    "url": "http://huibiao-system:8080",
    "api_token": "placeholder"
  }
}
'@

Invoke-WebRequest `
  -UseBasicParsing `
  -Uri http://127.0.0.1:9002/predict `
  -Method POST `
  -ContentType application/json `
  -Body $payload
```

预期返回中应包含 `predictions`，并且 `result` 里有 `textarea` 结果。

## 13. 在标注平台连接默认模型

### 图像项目

进入：

```text
项目设置 -> 智能标注 -> 连接默认图像模型
```

默认地址来自：

```text
ML_IMAGE_HOST=http://ml-backend-image:9091
```

### 文本项目

进入：

```text
项目设置 -> 智能标注 -> 连接默认文本模型
```

默认地址来自：

```text
ML_TEXT_HOST=http://ml-backend-text:9091
```

如果手动填写模型地址，也建议填写 Docker 内网地址：

```text
http://ml-backend-text:9091
```

不要在标注平台里填写 `http://127.0.0.1:9002`。对标注平台容器来说，`127.0.0.1` 指的是它自己，不是文本后端容器。

## 14. Token 传递规则

当前版本的核心逻辑是请求级 token。

流程是：

1. 用户登录标注平台。
2. 用户点击预标注或智能标注。
3. 标注平台后端读取当前请求用户的 API token。
4. 标注平台调用 ML 后端 `/predict`，在请求体里带上：

```json
{
  "label_studio": {
    "url": "http://huibiao-system:8080",
    "api_token": "<当前用户token>"
  }
}
```

5. 图像后端使用这个 token 下载 `/data/...` 图片。
6. 文本后端一般直接读取 `task.data` 的文本，不需要下载文件，但仍按同一协议接收 token。
7. 如果推理失败，ML 后端返回结构化错误，标注平台前端会展示失败原因。

因此：

- 不需要多人共用一个固定 token。
- 不需要用户连接后再去 ML backend console 保存 `.env`。
- 不应该依赖 `.env` 的旧 token 完成正常预标注。
- 多用户同时使用时，每个请求都携带当前用户自己的 token，不会串用别人的权限。

## 15. 地址规则

部署最容易出错的是地址。按下面规则区分：

| 场景 | 地址类型 | 示例 |
|---|---|---|
| 浏览器访问标注平台 | 服务器外部地址 | `http://68.68.18.26:7000` |
| 浏览器调试图像后端 | 服务器外部地址 | `http://68.68.18.26:9091/health` |
| 浏览器调试文本后端 | 服务器外部地址 | `http://68.68.18.26:9002/health` |
| Nginx 访问标注平台 | Docker 内网地址 | `http://huibiao-system:8080` |
| 标注平台访问图像后端 | Docker 内网地址 | `http://ml-backend-image:9091` |
| 标注平台访问文本后端 | Docker 内网地址 | `http://ml-backend-text:9091` |
| ML 后端访问标注平台 | Docker 内网地址 | `http://huibiao-system:8080` |
| 标注平台后端访问 SSO | 外部平台地址 | `68.68.18.26:31798` |

简化记忆：

```text
给浏览器看的，用服务器 IP。
容器互相访问，用容器名。
```

## 16. 常见问题

### Q1: 默认文本模型按钮没有出现

检查标注平台容器环境变量：

```powershell
docker exec huibiao-system env | findstr ML_TEXT_HOST
```

预期：

```text
ML_TEXT_HOST=http://ml-backend-text:9091
```

如果为空，前端不会拿到默认文本模型候选地址，需要重新启动标注平台容器并补上 `-e ML_TEXT_HOST=http://ml-backend-text:9091`。

### Q2: 连接默认文本模型失败

先检查两个容器是否在同一个 Docker 网络：

```powershell
docker network inspect huibiao-net
```

再检查标注平台容器能否访问文本后端：

```powershell
docker exec huibiao-system curl http://ml-backend-text:9091/health
```

如果这里失败，通常是文本容器未启动、容器名不对、网络不对，或者 `ML_TEXT_HOST` 写成了外部地址。

### Q3: 文本后端 health 正常，但第一次预标注很慢

这是正常现象。文本后端会在第一次推理时加载 NLLB 模型，第一次会慢一些。后续请求会复用已加载模型。

如果长时间没有返回，查看日志：

```powershell
docker logs -f ml-backend-text
```

### Q4: 文本推理失败，提示模型文件不存在

检查容器内模型目录：

```powershell
docker exec ml-backend-text dir /app/models/nllb-200-distilled-600M
```

如果目录不存在，说明打包镜像时没有把模型放进去，或者 `TEXT_MODEL_NAME` 配置错误。

### Q5: 图像预标注又出现 401

当前版本正常预标注不应该回退到 `.env` 的旧 token。排查顺序：

```powershell
docker logs -f huibiao-system
docker logs -f ml-backend-image
```

重点看 `/predict` 请求里是否收到了 `label_studio.api_token`。如果没有，说明标注平台镜像不是最新版本，或者当前运行的容器没有使用新的 `huibiao-system` 镜像。

### Q6: 手动填写 `http://127.0.0.1:9002` 为什么不行

标注平台连接 ML 后端是由标注平台后端容器发起的。对 `huibiao-system` 容器来说，`127.0.0.1` 是它自己，不是宿主机，也不是文本后端。

所以在标注平台里要填写：

```text
http://ml-backend-text:9091
```

## 17. 重新部署流程

如果只是替换新镜像并保留历史数据：

```powershell
docker load -i .\huibiao-system_06251.tar
docker load -i .\ml-backend-image-cpu_06251.tar
docker load -i .\ml-backend-text-nllb-cpuonly_06261.tar

docker stop huibiao-nginx huibiao-system ml-backend-image ml-backend-text
docker rm huibiao-nginx huibiao-system ml-backend-image ml-backend-text
```

不要删除：

```text
mydata
postgres-data
```

然后按第 7、8、9、10 节重新启动四个容器。

## 18. 迁移到新服务器

迁移时需要带走：

```text
mydata
postgres-data
nginx/default.conf
huibiao-system tar 包
ml-backend-image tar 包
ml-backend-text tar 包
nginx tar 包
```

新服务器上执行：

1. `docker load` 所有镜像。
2. 复制 `mydata` 和 `postgres-data`。
3. 修改 `nginx/default.conf` 中的外部 SSO / 数据集平台地址。
4. 修改启动命令中的 `HOST`、`LABEL_STUDIO_HOST`、`ML_BACKEND_URL` 为新服务器 IP。
5. 保持 `ML_IMAGE_HOST=http://ml-backend-image:9091`。
6. 保持 `ML_TEXT_HOST=http://ml-backend-text:9091`。
7. 按第 7、8、9、10 节启动容器。

新增文本后端后，迁移时只多带一个文本后端 tar 包，多启动一个 `ml-backend-text` 容器；Nginx 通常不需要修改。
