# 标注平台 Nginx 反向代理部署说明

## 1. 背景

当前部署环境（示例）：

- 标注平台：`http://<标注平台IP>:7000`（Docker）
- 外部数据集管理平台：`http://<外部平台IP>:<外部平台端口>`（K8s 或其他部署）
- 问题：前端直接调用外部平台接口时触发浏览器 CORS 跨域拦截。

本文档中的示例以 `<标注平台IP>=68.68.18.26`、`<外部平台IP>:<外部平台端口>=68.68.18.26:31798` 为例，**所有 IP 和端口均通过环境变量或配置文件传入，代码中不再写死**。

## 2. 方案

在 Docker 中增加一个 Nginx 容器，监听标注平台的入口端口（示例为 `7000`），作为标注平台的唯一入口：

- 外部接口路径（`/api/v1/admin/user/dict/*`、`/api/v1/fileExplorer/*`）代理到外部平台
- 其他所有请求代理到 Label Studio 容器

因为浏览器访问的全部是标注平台入口地址，属于同源请求，不再触发 CORS。

涉及的三个外部接口：

1. `GET /api/v1/admin/user/dict/model_class` — 模型分类字典
2. `POST /api/v1/fileExplorer/feDatasets` — 创建数据集
3. `POST /api/v1/fileExplorer/feDatasets/getUploadUrl` — 获取上传地址

## 3. 代码调整

为了让前端在 Nginx 代理模式下使用相对路径调用外部接口，同时让后端 SSO 认证地址可配置，需修改以下文件。

### 3.1 `label_studio/core/settings/base.py`

`SSO_USERINFO_HOST` 改为**必须**通过环境变量配置，代码中不再保留默认值；同时新增 `SSO_DATASET_API_HOST` 用于前端数据集接口：

```python
# SSO platform integration: host for /api/v1/admin/auth/userinfo
# Configure via the SSO_USERINFO_HOST environment variable.
# Accept either "host:port" or a full "http(s)://host:port" URL prefix.
# The actual value is required at runtime; build-time may leave it empty.
SSO_USERINFO_HOST = get_env('SSO_USERINFO_HOST', '')
SSO_USERINFO_TIMEOUT = int(get_env('SSO_USERINFO_TIMEOUT', '5'))

# Host used by the frontend for direct dataset-management API calls.
# Defaults to the SSO userinfo host. Set to an empty string when an Nginx
# reverse proxy serves the external dataset APIs under the same origin as
# Label Studio, so the browser uses relative URLs and avoids CORS.
SSO_DATASET_API_HOST = get_env('SSO_DATASET_API_HOST', SSO_USERINFO_HOST)
```

> **注意**：`SSO_USERINFO_HOST` 在运行时必须设置，但构建镜像时可以为空，避免 `docker build` 阶段因缺少环境变量而失败。运行时若未设置，后端调用 SSO 接口会抛出配置错误。`SSO_DATASET_API_HOST` 置空时前端才会走相对路径。

### 3.2 `label_studio/core/context_processors.py`

`ssoHost` 改为读取 `SSO_DATASET_API_HOST`，未配置时回退到 `SSO_USERINFO_HOST`，不再写死 IP：

```python
sso_host = getattr(
    django_settings, 'SSO_DATASET_API_HOST', django_settings.SSO_USERINFO_HOST
)
if sso_host and not sso_host.startswith(('http://', 'https://')):
    sso_host = f'http://{sso_host}'
```

### 3.3 `label_studio/core/middleware.py` 与 `core/utils/sso.py`

去掉 `getattr(settings, 'SSO_USERINFO_HOST', '68.68.18.26:31798')` 中的硬编码默认值，直接使用 `settings.SSO_USERINFO_HOST`：

```python
# middleware.py
host = settings.SSO_USERINFO_HOST
if not host.startswith(('http://', 'https://')):
    host = f'http://{host}'
return host
```

```python
# sso.py
host = settings.SSO_USERINFO_HOST
if not host.startswith(('http://', 'https://')):
    host = f'http://{host}'
return host
```

### 3.4 `label_studio/frontend/src/utils/datasetManagementApi.js`

`getSsoHost()` 在 `ssoHost` 为空时返回空字符串，使请求走相对路径：

```javascript
function getSsoHost() {
  const host = window.APP_SETTINGS?.ssoHost;
  if (host === '' || host === null || host === undefined) return '';
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  return `http://${host}`;
}
```

### 3.5 `label_studio/core/settings/base.py` 与 `label_studio/core/context_processors.py`（ML 后端地址）

智能标注默认 ML 后端地址 `68.68.18.26:9000` 也通过 `ML_HOST` 环境变量配置，并作为 `mlHost` 暴露给前端：

```python
# base.py
_ML_HOST = get_env('ML_HOST', '')
if _ML_HOST and not _ML_HOST.startswith(('http://', 'https://')):
    _ML_HOST = f'http://{_ML_HOST}'
ML_HOST = _ML_HOST
```

```python
# context_processors.py
'mlHost': getattr(django_settings, 'ML_HOST', ''),
```

前端 `MachineLearningSettings.js` 会优先使用 `window.APP_SETTINGS.mlHost`，未配置时回退到当前页面主机的 `:9000` 端口。

## 4. Nginx 配置

本目录提供 [`nginx.conf`](nginx.conf)，其中外部平台地址使用示例值 `68.68.18.26:31798`。**部署前必须手动替换为实际的外部平台地址**。

需要修改的位置有两处（已在文件中用 `# TODO:` 标出）：

1. `location /api/v1/admin/user/dict/` 中的 `proxy_pass` 和 `proxy_set_header Host`
2. `location /api/v1/fileExplorer/` 中的 `proxy_pass` 和 `proxy_set_header Host`

配置内容如下：

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 500M;

    # 模型分类字典
    # TODO: 把下面的 68.68.18.26:31798 替换为实际的外部平台地址
    location /api/v1/admin/user/dict/ {
        proxy_pass http://68.68.18.26:31798;
        proxy_set_header Host 68.68.18.26:31798;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 数据集管理接口：feDatasets / getUploadUrl
    # TODO: 把下面的 68.68.18.26:31798 替换为实际的外部平台地址
    location /api/v1/fileExplorer/ {
        proxy_pass http://68.68.18.26:31798;
        proxy_set_header Host 68.68.18.26:31798;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Label Studio 其他所有请求
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
    }
}
```

说明：

- `proxy_pass` 后没有斜杠，会原样保留 URI 转发给上游。
- `Host` 头在外部接口处设为外部平台地址，避免外部平台因 Host 校验拒绝。
- Label Studio 处 `Host` 头保持 `$host`，即浏览器访问的地址。

## 5. 部署步骤

### 5.1 前置要求

#### 1. 构建前端静态资源

Dockerfile 会直接复制 `label_studio/frontend/dist/` 目录到镜像中，因此**构建镜像前必须先重新编译前端**：

```bash
cd label_studio/frontend
npm install   # 如果 node_modules 已存在可省略
npm run build
cd ../..
```

编译完成后，`label_studio/frontend/dist/` 里会生成最新的 JS/CSS。

#### 2. 构建 Docker 镜像

```bash
docker build -t huibiao-system:latest .
```

#### 3. 修改 Nginx 配置

编辑 [`nginx.conf`](nginx.conf)，把 `68.68.18.26:31798` 替换为实际外部平台地址。

### 5.2 方式一：使用 `deploy.ps1` 一键脚本（PowerShell）

脚本支持通过环境变量覆盖配置，默认使用示例值。**执行前请确保已完成 5.1 的前置要求（前端构建、镜像构建、nginx.conf 已修改）**。

```powershell
$env:HOST_PORT = "7000"
$env:LABEL_STUDIO_HOST = "http://68.68.18.26:7000"
$env:SSO_USERINFO_HOST = "68.68.18.26:31798"
$env:ML_HOST = "68.68.18.26:9000"

.\deploy.ps1
```

也可直接执行使用默认值：

```powershell
.\deploy.ps1
```

脚本会自动完成停止旧容器、创建网络、启动 Label Studio、启动 Nginx 的全部步骤。

### 5.3 方式二：手动逐步部署（Bash / Git Bash）

#### 步骤 1：停止并移除旧容器

```bash
docker stop huibiao-system huibiao-nginx
docker rm huibiao-system huibiao-nginx
```

#### 步骤 2：创建 Docker 网络

```bash
docker network create huibiao-net
```

#### 步骤 3：启动 Label Studio（不暴露 7000 端口）

```bash
HOST_PORT=7000
LABEL_STUDIO_HOST=http://68.68.18.26:${HOST_PORT}
SSO_USERINFO_HOST=68.68.18.26:31798
ML_HOST=68.68.18.26:9000

docker run -d \
  --name huibiao-system \
  --network huibiao-net \
  -v "${PWD}/mydata:/label-studio/data" \
  -e LABEL_STUDIO_HOST=${LABEL_STUDIO_HOST} \
  -e SSO_USERINFO_HOST=${SSO_USERINFO_HOST} \
  -e SSO_DATASET_API_HOST="" \
  -e ML_HOST=${ML_HOST} \
  huibiao-system:latest
```

关键变化：

- 去掉 `-p 7000:8080`
- 增加 `--network huibiao-net`
- `SSO_DATASET_API_HOST=""` 让前端走相对路径
- `SSO_USERINFO_HOST` 供后端 SSO 使用
- `ML_HOST` 供智能标注默认后端使用

#### 步骤 4：启动 Nginx

```bash
HOST_PORT=7000

docker run -d \
  --name huibiao-nginx \
  --network huibiao-net \
  -p "${HOST_PORT}:80" \
  -v "${PWD}/nginx.conf:/etc/nginx/conf.d/default.conf" \
  nginx:alpine
```

#### 步骤 5：查看运行状态

```bash
docker ps

# 查看 Nginx 日志
docker logs -f huibiao-nginx

# 查看 Label Studio 日志
docker logs -f huibiao-system
```

## 6. 验证

1. 浏览器访问 `http://68.68.18.26:7000?token=xxxx`（替换为实际地址），应能正常跳转。
2. 打开浏览器开发者工具 → Network，创建项目时观察：
   - `model_class` 请求 URL 应为 `http://<标注平台IP>:7000/api/v1/admin/user/dict/model_class`
   - `feDatasets` 请求 URL 应为 `http://<标注平台IP>:7000/api/v1/fileExplorer/feDatasets`
3. 不应再出现 CORS 错误。

### 6.1 如果请求 URL 仍然是 `68.68.18.26:31798`

说明前端还在使用旧的 `ssoHost`，按以下顺序排查：

1. **前端是否已重新编译**：检查 `label_studio/frontend/dist/` 生成时间，确认是修改代码后新编译的。
2. **镜像是否基于最新 dist 构建**：重新执行 `docker build -t huibiao-system:latest .`。
3. **浏览器缓存**：按 `Ctrl + F5` 强制刷新，或打开 Network 面板勾选 `Disable cache` 后再刷新。
4. **检查 `window.APP_SETTINGS.ssoHost`**：在浏览器控制台执行：
   ```javascript
   window.APP_SETTINGS.ssoHost
   ```
   期望输出空字符串 `''`。如果输出 `http://68.68.18.26:31798`，说明 `SSO_DATASET_API_HOST` 没有置空，检查容器环境变量：
   ```bash
   docker exec huibiao-system env | grep SSO
   ```
5. **检查 Nginx 是否代理成功**：Nginx 日志应能看到 `/api/v1/admin/user/dict/model_class` 请求转发到外部平台。

## 7. 常见问题

### Q1: 为什么 `SSO_USERINFO_HOST` 不能置空？

后端 `SSO_AUTHMiddleware` 需要调用外部平台的 `/api/v1/admin/auth/userinfo` 来完成登录鉴权。这个调用是后端直接发出的，不走浏览器，因此不存在 CORS 问题，仍需要真实的外部平台地址。

### Q2: 文件上传到 MinIO 还跨域吗？

`getUploadUrl` 返回的预签名 PUT URL 如果是 MinIO 直传地址且与标注平台入口不同源，仍然跨域。需要在 MinIO 上配置 CORS，或在 Ingress/Nginx 中再代理 MinIO。该问题待三个接口调通后再处理。

### Q3: 如何回滚？

```bash
docker stop huibiao-nginx huibiao-system
docker rm huibiao-nginx huibiao-system

# 恢复原来的启动方式
docker run -d \
  --name huibiao-system \
  -p 7000:8080 \
  -v "${PWD}/mydata:/label-studio/data" \
  -e SSO_USERINFO_HOST=68.68.18.26:31798 \
  huibiao-system:latest
```

## 8. 机器或外部平台地址变动时如何修改

当标注平台迁移到新机器，或外部平台 IP/端口变化时，**代码不需要重新修改**，只需调整启动参数和 `nginx.conf` 中的外部平台地址。

假设新环境为：

- 标注平台新地址：`http://68.67.118.89:7000`
- 外部平台新地址：`http://68.67.118.89:37777`

### 8.1 需要修改的地方

| 位置 | 修改项 | 新值示例 |
|---|---|---|
| `nginx.conf` | `proxy_pass` 中的外部平台地址 | `http://68.67.118.89:37777` |
| `nginx.conf` | `proxy_set_header Host` 中的外部平台地址 | `68.67.118.89:37777` |
| Label Studio 启动参数 | `LABEL_STUDIO_HOST` | `http://68.67.118.89:7000` |
| Label Studio 启动参数 | `SSO_USERINFO_HOST` | `68.67.118.89:37777` |
| Label Studio 启动参数 | `SSO_DATASET_API_HOST` | `""`（保持为空） |
| Label Studio 启动参数 | `ML_HOST` | `68.67.118.89:9000`（按需配置） |
| Docker 端口映射 | `-p` | `7000:80`（若端口不变则不变） |

### 8.2 不需要修改的地方

| 项目 | 原因 |
|---|---|
| 代码文件 | IP 和端口已全部改为环境变量或 nginx.conf 配置文件 |
| `proxy_pass http://huibiao-system:8080` | 容器名未变，走 Docker 内部网络 |
| Nginx 容器内部 `80` 端口 | 容器内部端口固定 |
| Label Studio 容器内部 `8080` 端口 | 容器内部端口固定 |
| 容器名 `huibiao-system`、`huibiao-nginx` | 可以沿用 |
| Docker 网络名 `huibiao-net` | 可以沿用 |
| 卷映射结构 | 结构不变，只需复制 `mydata` 到新机器 |

### 8.3 迁移操作示例

```bash
# 1. 在新机器上准备好 mydata 数据目录和镜像

# 2. 手动方式（Bash / Git Bash）
#    先修改 nginx.conf 中的外部平台地址
HOST_PORT=7000
LABEL_STUDIO_HOST=http://68.67.118.89:${HOST_PORT}
SSO_USERINFO_HOST=68.67.118.89:37777
ML_HOST=68.67.118.89:9000

docker network create huibiao-net

docker run -d \
  --name huibiao-system \
  --network huibiao-net \
  -v "${PWD}/mydata:/label-studio/data" \
  -e LABEL_STUDIO_HOST=${LABEL_STUDIO_HOST} \
  -e SSO_USERINFO_HOST=${SSO_USERINFO_HOST} \
  -e SSO_DATASET_API_HOST="" \
  -e ML_HOST=${ML_HOST} \
  huibiao-system:latest

docker run -d \
  --name huibiao-nginx \
  --network huibiao-net \
  -p "${HOST_PORT}:80" \
  -v "${PWD}/nginx.conf:/etc/nginx/conf.d/default.conf" \
  nginx:alpine
```

### 8.4 防火墙/安全组

新机器需要放行标注平台入口端口（示例为 `7000`）以及任何需要直接访问的端口。

### 8.5 数据迁移

如需保留历史数据，把旧机器上的 `mydata` 目录完整复制到新机器上，再启动容器即可。
