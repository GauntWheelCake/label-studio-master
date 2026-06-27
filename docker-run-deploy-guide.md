# Label Studio 三容器 Docker Run 部署说明

本文档用于在不使用 `docker compose` 的情况下，通过 `docker load -i` 和 `docker run` 部署：

- 标注平台容器：内置 Label Studio + 内置 PostgreSQL
- 智能标注容器：ML Backend
- Nginx 代理容器：可选，但推荐用于正式访问入口

本文默认端口约定：

```text
标注平台        宿主机端口 7000
图像智能标注    宿主机端口 9001
文本智能标注    宿主机端口 9002
```

端口映射格式是 `宿主机端口:容器内部端口`。例如标注平台容器内部仍监听 `8080`，所以对外使用 `7000` 时写成 `-p 7000:8080`。如果你的智能标注镜像内部也监听 `9001`、`9002`，就写成 `-p 9001:9001`、`-p 9002:9002`；如果镜像内部监听的是其他端口，请把冒号右边改成镜像内部实际端口。

> 注意：本文基于当前仓库的 `Dockerfile` 和 `docker-compose.yml` 整理。当前标注平台镜像里已经安装 PostgreSQL，并且启动时如果 `POSTGRE_HOST=localhost`，会自动启动容器内部 PostgreSQL。

## 1. 准备工作

请先启动 Docker Desktop。

如果是在 Windows PowerShell 中执行，建议进入项目目录：

```powershell
cd D:\Copy\label-studio-master
```

加载三个 tar 镜像：

```powershell
docker load -i .\label-studio.tar
docker load -i .\ml-backend-image.tar
docker load -i .\nginx.tar
```

查看实际加载出来的镜像名：

```powershell
docker images
```

下文默认使用这些镜像名：

```text
heartexlabs/label-studio:latest
huibiao/ml-backend-image:latest
nginx:latest
```

如果你的 `docker images` 中显示的名称不同，请把后续命令里的镜像名替换成你自己的实际镜像名。

## 2. 创建网络、数据目录和数据卷

创建一个专用 Docker 网络，方便容器之间用名称访问：

```powershell
docker network create label-studio-net
```

创建本地数据目录：

```powershell
mkdir mydata
mkdir postgres-data
```

创建给 Nginx 共享静态资源的 Docker 数据卷：

```powershell
docker volume create ls-static-build
docker volume create ls-frontend-dist
```

目录和卷的用途：

```text
.\mydata                         标注平台上传文件、头像、媒体文件等
.\postgres-data                  标注平台内置 PostgreSQL 数据
ls-static-build                  app 与 nginx 共享的后端静态资源
ls-frontend-dist                 app 与 nginx 共享的前端构建资源
```

## 3. 启动标注平台容器

标注平台容器会同时启动 Label Studio 和容器内部 PostgreSQL。

```powershell
docker run -d `
  --name label-studio-app `
  --network label-studio-net `
  --network-alias app `
  -p 7000:8080 `
  -e POSTGRE_HOST=localhost `
  -e POSTGRE_PORT=5432 `
  -e POSTGRE_USER=postgres `
  -e POSTGRE_PASSWORD=postgres `
  -e POSTGRE_NAME=postgres `
  -e LABEL_STUDIO_BASE_DATA_DIR=/label-studio/data `
  -e ENABLE_SHARED_ADMIN_MODE=true `
  -e SHARED_ADMIN_FIXED_TOKEN=shared-admin-fixed-token `
  -e ML_HOST=http://ml-backend-image:9001 `
  -e ML_IMAGE_HOST=http://ml-backend-image:9001 `
  -e ML_TEXT_HOST=http://ml-backend-text:9002 `
  -e ML_LABEL_STUDIO_URL=http://app:8080 `
  -v ${PWD}\mydata:/label-studio/data `
  -v ${PWD}\postgres-data:/var/lib/postgresql/data `
  -v ls-static-build:/label-studio/label_studio/core/static_build `
  -v ls-frontend-dist:/label-studio/label_studio/frontend/dist `
  heartexlabs/label-studio:latest
```

关键挂载：

```text
/label-studio/data               必须挂载，保存上传文件和媒体资源
/var/lib/postgresql/data         必须挂载，保存内置 PostgreSQL 数据
```

如果不挂载 `/var/lib/postgresql/data`，删除容器后数据库数据会丢失。

## 4. 启动智能标注容器

```powershell
docker run -d `
  --name ml-backend-image `
  --network label-studio-net `
  --network-alias ml-backend-image `
  -p 9001:9001 `
  -e LABEL_STUDIO_URL=http://app:8080 `
  -e LABEL_STUDIO_API_TOKEN=shared-admin-fixed-token `
  -e ML_BACKEND_PORT=9001 `
  -e ML_BACKEND_URL=http://localhost:9001 `
  -e MODEL_VERSION=faster-rcnn-resnet50-v1.0 `
  -e MODEL_VERSION_OPTIONS=faster-rcnn-resnet50-v1.0 `
  -e CONFIDENCE_THRESHOLD=0.7 `
  -e IMAGE_REQUEST_TIMEOUT=20 `
  -e INFERENCE_DEVICE=cpu `
  huibiao/ml-backend-image:latest
```

这里的 `LABEL_STUDIO_API_TOKEN` 要和标注平台容器里的 `SHARED_ADMIN_FIXED_TOKEN` 保持一致。

如果你还有文本智能标注镜像，可以按下面方式启动。请把最后一行镜像名替换为你实际 `docker images` 看到的文本智能标注镜像名：

```powershell
docker run -d `
  --name ml-backend-text `
  --network label-studio-net `
  --network-alias ml-backend-text `
  -p 9002:9002 `
  -e LABEL_STUDIO_URL=http://app:8080 `
  -e LABEL_STUDIO_API_TOKEN=shared-admin-fixed-token `
  -e ML_BACKEND_PORT=9002 `
  -e ML_BACKEND_URL=http://localhost:9002 `
  -e INFERENCE_DEVICE=cpu `
  your-text-ml-backend-image:latest
```

## 5. 启动 Nginx 代理容器

如果只是本机简单测试，可以不启动 Nginx，直接访问：

```text
http://localhost:7000
```

如果要使用 Nginx 作为统一入口，先确认当前仓库存在：

```text
deploy\nginx\default.conf
```

然后启动 Nginx：

```powershell
docker run -d `
  --name label-studio-nginx `
  --network label-studio-net `
  -p 80:80 `
  -v ls-static-build:/label-studio/label_studio/core/static_build:ro `
  -v ls-frontend-dist:/label-studio/label_studio/frontend/dist:ro `
  -v ${PWD}\mydata:/label-studio/data:ro `
  -v ${PWD}\deploy\nginx\default.conf:/etc/nginx/conf.d/default.conf:ro `
  nginx:latest `
  nginx -g "daemon off;"
```

启动 Nginx 后访问：

```text
http://localhost
```

如果本机 80 端口已经被占用，可以改成：

```powershell
-p 8088:80
```

然后访问：

```text
http://localhost:8088
```

## 6. 检查运行状态

查看容器：

```powershell
docker ps -a
```

查看日志：

```powershell
docker logs label-studio-app
docker logs ml-backend-image
docker logs label-studio-nginx
```

持续查看日志：

```powershell
docker logs -f label-studio-app
```

## 7. 常见问题

### 7.1 Nginx 访问 502

先检查标注平台容器是否启动成功：

```powershell
docker logs label-studio-app
```

Nginx 配置中的上游是：

```text
http://app:8080
```

所以标注平台容器必须和 Nginx 在同一个 Docker 网络里，并且启动时需要带：

```powershell
--network label-studio-net `
--network-alias app `
```

### 7.2 智能标注连不上标注平台

检查智能标注容器里的配置：

```text
LABEL_STUDIO_URL=http://app:8080
LABEL_STUDIO_API_TOKEN=shared-admin-fixed-token
```

并确认标注平台容器里配置的是：

```text
SHARED_ADMIN_FIXED_TOKEN=shared-admin-fixed-token
```

两个 token 必须一致。

### 7.3 删除容器后数据还在吗

如果你按本文挂载了下面两个目录，数据还在：

```text
.\mydata
.\postgres-data
```

其中：

```text
.\mydata                         保存上传文件等媒体资源
.\postgres-data                  保存数据库
```

### 7.4 重新启动容器

```powershell
docker start label-studio-app
docker start ml-backend-image
docker start label-studio-nginx
```

### 7.5 停止容器

```powershell
docker stop label-studio-nginx
docker stop ml-backend-image
docker stop label-studio-app
```

### 7.6 删除容器后重新创建

删除容器不会删除 `.\mydata`、`.\postgres-data` 和 Docker volume，数据仍会保留。

```powershell
docker rm label-studio-nginx
docker rm ml-backend-image
docker rm label-studio-app
```

然后重新执行第 3、4、5 步即可。

## 8. 推荐启动顺序

```text
1. docker load -i 加载三个镜像
2. docker network create label-studio-net
3. 创建 mydata、postgres-data、本地目录和静态资源 volume
4. 启动 label-studio-app
5. 启动 ml-backend-image
6. 可选启动 label-studio-nginx
7. 浏览器访问 http://localhost 或 http://localhost:7000
```

## 9. 最小部署模式

如果暂时不想跑 Nginx，只跑两个容器即可：

```text
label-studio-app
ml-backend-image
```

访问地址：

```text
http://localhost:7000
```

这种模式最适合本机测试和快速验证。
