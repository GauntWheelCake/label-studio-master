# 麒麟系统离线部署指南：标注平台 + 图像智能标注 + Nginx

本文档适用于当前改造后的慧标标注平台离线部署。部署目标是在麒麟系统服务器上运行三个容器：

- 标注平台：`huibiao-system:06241`
- 图像智能标注后端：`ml-backend-image-cpu:06241`
- Nginx 入口代理：`nginx:latest`

当前版本已经修改过标注平台和图像智能标注后端，部署时必须使用新镜像。旧镜像不包含默认图像模型连接、当前用户 token 传递、图像后端控制台补救等能力。

## 1. 当前架构

```text
用户浏览器
  |
  | http://服务器IP:7000
  v
Nginx 容器 huibiao-nginx
  |
  | Docker 内网 http://huibiao-system:8080
  v
标注平台容器 huibiao-system
  |
  | Docker 内网 http://ml-backend-image:9091
  v
图像智能标注容器 ml-backend-image
```

Nginx 的作用：

1. 对外只暴露一个标注平台入口：`http://服务器IP:7000`
2. 把普通页面请求转发给标注平台容器
3. 把数据集/字典接口转发给外部 SSO / 数据集平台，避免浏览器 CORS 跨域问题

图像智能标注控制台单独暴露：

```text
http://服务器IP:9091/console
```

## 2. 示例环境

下面命令使用示例值：

```text
服务器 IP：68.68.18.26
标注平台入口端口：7000
图像智能标注端口：9091
外部 SSO / 数据集平台：68.68.18.26:31798
```

实际部署时，把这些值替换成你的内网真实地址。

## 3. 加载离线镜像

把 tar 包上传到服务器，例如放在：

```bash
/opt/huibiao-images
```

执行：

```bash
cd /opt/huibiao-images

docker load -i huibiao-system_06241.tar
docker load -i ml-backend-image-cpu_06241.tar
docker load -i nginx_latest.tar
```

检查镜像：

```bash
docker images | grep -E "huibiao-system|ml-backend-image|nginx"
```

期望看到：

```text
huibiao-system             06241
ml-backend-image-cpu       06241
nginx                      latest
```

如果镜像名或 tag 不同，后续 `docker run` 里的镜像名也要同步替换。

## 4. 准备部署目录

建议固定使用：

```bash
/opt/huibiao-deploy
```

执行：

```bash
mkdir -p /opt/huibiao-deploy
cd /opt/huibiao-deploy

mkdir -p mydata
mkdir -p postgres-data
mkdir -p nginx
```

目录说明：

```text
mydata          标注平台上传文件、导出文件、媒体文件
postgres-data   标注平台容器内置 PostgreSQL 数据
nginx           Nginx 配置文件
```

不要删除 `mydata` 和 `postgres-data`。删除它们会丢文件或数据库。

## 5. 准备 Nginx 配置

创建配置文件：

```bash
vi /opt/huibiao-deploy/nginx/default.conf
```

写入以下内容。请把 `68.68.18.26:31798` 替换成真实外部 SSO / 数据集平台地址。

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

只需要改外部平台地址：

```nginx
proxy_pass http://外部平台IP:端口;
proxy_set_header Host 外部平台IP:端口;
```

不要改：

```nginx
proxy_pass http://huibiao-system:8080;
```

这是 Nginx 容器访问标注平台容器的 Docker 内网地址。

## 6. 停止并删除旧容器

如果服务器上旧的标注平台和图像后端已经删除，只需要确认 Nginx 也重建。

建议统一执行：

```bash
docker stop huibiao-nginx huibiao-system ml-backend-image
docker rm huibiao-nginx huibiao-system ml-backend-image
```

如果提示容器不存在，可以忽略。

注意：删除容器不会删除 `/opt/huibiao-deploy/mydata` 和 `/opt/huibiao-deploy/postgres-data`。

## 7. 创建 Docker 网络

```bash
docker network create huibiao-net
```

如果提示网络已存在，可以忽略。

## 8. 启动标注平台容器

把命令中的：

```text
68.68.18.26
68.68.18.26:31798
```

替换为真实服务器 IP 和真实外部 SSO / 数据集平台地址。

```bash
docker run -d \
  --name huibiao-system \
  --network huibiao-net \
  --network-alias huibiao-system \
  -v /opt/huibiao-deploy/mydata:/label-studio/data \
  -v /opt/huibiao-deploy/postgres-data:/var/lib/postgresql/data \
  -e HOST=http://68.68.18.26:7000 \
  -e LABEL_STUDIO_HOST=http://68.68.18.26:7000 \
  -e SSO_USERINFO_HOST=68.68.18.26:31798 \
  -e SSO_DATASET_API_HOST="" \
  -e ML_IMAGE_HOST=http://ml-backend-image:9091 \
  -e ML_LABEL_STUDIO_URL=http://huibiao-system:8080 \
  huibiao-system:06241
```

不要给标注平台加：

```bash
-p 7000:8080
```

`7000` 端口必须给 Nginx 使用。

关键变量说明：

| 变量 | 作用 | 示例 |
|---|---|---|
| `HOST` | 浏览器访问标注平台的地址，前端静态资源会用它 | `http://68.68.18.26:7000` |
| `LABEL_STUDIO_HOST` | 标注平台对外地址 | `http://68.68.18.26:7000` |
| `SSO_USERINFO_HOST` | 标注平台后端访问 SSO 的地址 | `68.68.18.26:31798` |
| `SSO_DATASET_API_HOST` | 置空，让前端数据集接口走 Nginx 相对路径 | `""` |
| `ML_IMAGE_HOST` | 标注平台容器访问图像后端 | `http://ml-backend-image:9091` |
| `ML_LABEL_STUDIO_URL` | 图像后端回调标注平台 | `http://huibiao-system:8080` |

## 9. 启动图像智能标注后端

把 `68.68.18.26` 替换为真实服务器 IP。

```bash
docker run -d \
  --name ml-backend-image \
  --network huibiao-net \
  --network-alias ml-backend-image \
  -p 9091:9091 \
  -e LABEL_STUDIO_URL=http://huibiao-system:8080 \
  -e ML_BACKEND_URL=http://68.68.18.26:9091 \
  ml-backend-image-cpu:06241
```

说明：

- `LABEL_STUDIO_URL=http://huibiao-system:8080` 是容器内网地址。
- `ML_BACKEND_URL=http://68.68.18.26:9091` 是浏览器访问地址。
- 图像后端内部监听端口是 `9091`。
- 不需要手动写死 `LABEL_STUDIO_API_TOKEN`。连接默认图像模型时，标注平台会通过 `/setup` 把当前用户 token 传给图像后端。

## 10. 启动 Nginx

```bash
docker run -d \
  --name huibiao-nginx \
  --network huibiao-net \
  -p 7000:80 \
  -v /opt/huibiao-deploy/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:latest
```

Nginx 必须重新启动，因为它需要挂载新的 `default.conf`。

访问地址：

```text
标注平台：http://68.68.18.26:7000
图像后端控制台：http://68.68.18.26:9091/console
```

## 11. 验证服务

查看容器：

```bash
docker ps
```

应看到：

```text
huibiao-system
ml-backend-image
huibiao-nginx
```

检查标注平台：

```bash
curl http://127.0.0.1:7000/api/version
```

检查图像后端：

```bash
curl http://127.0.0.1:9091/health
```

查看日志：

```bash
docker logs huibiao-system
docker logs ml-backend-image
docker logs huibiao-nginx
```

如果想持续观察日志：

```bash
docker logs -f huibiao-system
```

## 12. 验证智能标注

1. 浏览器打开：

   ```text
   http://68.68.18.26:7000
   ```

2. 进入某个项目。

3. 打开：

   ```text
   项目设置 -> 智能标注
   ```

4. 点击：

   ```text
   连接默认图像模型
   ```

5. 打开图像后端控制台：

   ```text
   http://68.68.18.26:9091/console
   ```

6. 点击：

   ```text
   检查连通性
   ```

期望看到：

```text
标注平台 API 可达
ML Backend URL 可达
```

## 13. 当前版本的 token 规则

当前版本不再依赖固定共享 token 作为主方案。

实际流程：

1. 用户通过 SSO 登录标注平台。
2. 标注平台拿到当前用户的 API token。
3. 页面会把当前用户 token 写入 `sessionStorage['label_studio_api_token']`，用于排查。
4. 点击“连接默认图像模型”时，标注平台调用图像后端 `/setup`。
5. `/setup` 请求会把当前项目、标注配置、标注平台地址、当前用户 token 传给图像后端。
6. 图像后端保存这个 token，后续用它访问标注平台 API。

因此，不要再假设所有用户都使用：

```text
shared-admin-fixed-token
```

如果连接失败，可以通过图像后端控制台手动补救。

## 14. 地址规则

部署时最容易错的是地址。按下面规则区分：

| 场景 | 地址 | 示例 |
|---|---|---|
| 浏览器访问标注平台 | 服务器 IP + Nginx 端口 | `http://68.68.18.26:7000` |
| 浏览器访问图像后端控制台 | 服务器 IP + 图像后端端口 | `http://68.68.18.26:9091/console` |
| Nginx 访问标注平台 | Docker 容器名 | `http://huibiao-system:8080` |
| 标注平台访问图像后端 | Docker 容器名 | `http://ml-backend-image:9091` |
| 图像后端访问标注平台 | Docker 容器名 | `http://huibiao-system:8080` |
| 标注平台访问 SSO | 外部平台地址 | `68.68.18.26:31798` |

一句话：

```text
给浏览器看的，用服务器 IP。
容器之间互相访问，用容器名。
```

## 15. 常见问题

### 15.1 页面白屏

检查标注平台容器环境变量：

```bash
docker exec huibiao-system env | grep -E "HOST|LABEL_STUDIO_HOST"
```

应类似：

```text
HOST=http://68.68.18.26:7000
LABEL_STUDIO_HOST=http://68.68.18.26:7000
```

不要把 `HOST` 配成：

```text
http://huibiao-system:8080
```

浏览器访问不了 Docker 内网容器名。

### 15.2 连接默认图像模型失败

检查标注平台能不能访问图像后端：

```bash
docker exec huibiao-system curl http://ml-backend-image:9091/health
```

检查图像后端能不能访问标注平台：

```bash
docker exec ml-backend-image curl http://huibiao-system:8080/api/version
```

如果不通，通常是容器不在同一个 Docker 网络，或者容器名写错。

### 15.3 图像后端控制台显示 401

可能是 token 没通过 `/setup` 写入。

处理：

1. 回到标注平台项目。
2. 在“智能标注”里重新点击“连接默认图像模型”。
3. 再去图像后端控制台点击“检查连通性”。

### 15.4 数据集接口跨域或导入失败

检查：

```bash
docker exec huibiao-system env | grep SSO
```

应有：

```text
SSO_DATASET_API_HOST=
```

如果不是空，前端可能会直接请求外部平台，从而触发 CORS。

还要检查 Nginx 配置里的外部平台地址是否正确：

```bash
cat /opt/huibiao-deploy/nginx/default.conf
```

### 15.5 上传大文件失败

检查 Nginx 配置：

```nginx
client_max_body_size 1024m;
```

如果文件更大，可以调大。

## 16. 重新部署新镜像

如果后续重新拿到新的 tar 包，保留历史数据时按这个流程：

```bash
cd /opt/huibiao-images

docker load -i huibiao-system_06241.tar
docker load -i ml-backend-image-cpu_06241.tar

docker stop huibiao-nginx huibiao-system ml-backend-image
docker rm huibiao-nginx huibiao-system ml-backend-image
```

不要删除：

```text
/opt/huibiao-deploy/mydata
/opt/huibiao-deploy/postgres-data
```

然后重新执行第 8、9、10 节启动命令。

## 17. 使用 docker compose 部署

手动 `docker run` 适合第一次排查。正式部署更推荐 `docker compose`，因为所有参数都写在文件里，以后启动、停止、重启都更简单。

compose 方式需要两个文件：

```text
/opt/huibiao-deploy/.env
/opt/huibiao-deploy/docker-compose.yml
```

Nginx 配置仍然使用：

```text
/opt/huibiao-deploy/nginx/default.conf
```

### 17.1 准备 .env

创建：

```bash
vi /opt/huibiao-deploy/.env
```

写入：

```env
# 服务器对外访问地址
SERVER_IP=68.68.18.26

# 标注平台入口端口
LABEL_STUDIO_PORT=7000

# 图像智能标注入口端口
ML_IMAGE_PORT=9091

# 外部 SSO / 数据集平台地址，注意这里不要写 http://
SSO_EXTERNAL_HOST=68.68.18.26:31798

# 镜像名称
LABEL_STUDIO_IMAGE=huibiao-system:06241
ML_IMAGE_BACKEND_IMAGE=ml-backend-image-cpu:06241
NGINX_IMAGE=nginx:latest
```

实际部署时，通常只需要改：

```env
SERVER_IP=真实服务器IP
SSO_EXTERNAL_HOST=真实外部平台IP:端口
```

### 17.2 准备 docker-compose.yml

创建：

```bash
vi /opt/huibiao-deploy/docker-compose.yml
```

写入：

```yaml
services:
  huibiao-system:
    image: ${LABEL_STUDIO_IMAGE}
    container_name: huibiao-system
    restart: unless-stopped
    environment:
      HOST: http://${SERVER_IP}:${LABEL_STUDIO_PORT}
      LABEL_STUDIO_HOST: http://${SERVER_IP}:${LABEL_STUDIO_PORT}
      SSO_USERINFO_HOST: ${SSO_EXTERNAL_HOST}
      SSO_DATASET_API_HOST: ""
      ML_IMAGE_HOST: http://ml-backend-image:9091
      ML_LABEL_STUDIO_URL: http://huibiao-system:8080
    volumes:
      - ./mydata:/label-studio/data
      - ./postgres-data:/var/lib/postgresql/data
    networks:
      - huibiao-net

  ml-backend-image:
    image: ${ML_IMAGE_BACKEND_IMAGE}
    container_name: ml-backend-image
    restart: unless-stopped
    depends_on:
      - huibiao-system
    ports:
      - "${ML_IMAGE_PORT}:9091"
    environment:
      LABEL_STUDIO_URL: http://huibiao-system:8080
      ML_BACKEND_URL: http://${SERVER_IP}:${ML_IMAGE_PORT}
    networks:
      - huibiao-net

  huibiao-nginx:
    image: ${NGINX_IMAGE}
    container_name: huibiao-nginx
    restart: unless-stopped
    depends_on:
      - huibiao-system
    ports:
      - "${LABEL_STUDIO_PORT}:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    networks:
      - huibiao-net

networks:
  huibiao-net:
    name: huibiao-net
```

### 17.3 启动

第一次启动前确认目录存在：

```bash
cd /opt/huibiao-deploy

mkdir -p mydata
mkdir -p postgres-data
mkdir -p nginx
```

确认 `nginx/default.conf` 已经按第 5 节写好。

启动：

```bash
docker compose up -d
```

如果系统里的 compose 命令是旧版，也可能需要：

```bash
docker-compose up -d
```

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f
```

### 17.4 停止、重启、删除容器

停止：

```bash
docker compose stop
```

重启：

```bash
docker compose restart
```

删除容器但保留数据：

```bash
docker compose down
```

注意：`docker compose down` 不会删除 `mydata` 和 `postgres-data` 目录。不要手动删除这两个目录。

### 17.5 更新镜像后重启

新 tar 包加载后：

```bash
cd /opt/huibiao-images

docker load -i huibiao-system_06241.tar
docker load -i ml-backend-image-cpu_06241.tar
docker load -i nginx_latest.tar
```

回到部署目录：

```bash
cd /opt/huibiao-deploy

docker compose down
docker compose up -d
```

## 18. 换 IP 或换外部平台时要改哪里

如果服务器 IP、端口、外部 SSO / 数据集平台地址发生变化，不需要改代码，只改配置。

### 18.1 服务器 IP 变化

例如服务器从：

```text
68.68.18.26
```

变成：

```text
68.67.118.89
```

需要改：

```text
/opt/huibiao-deploy/.env
```

把：

```env
SERVER_IP=68.68.18.26
```

改成：

```env
SERVER_IP=68.67.118.89
```

然后重启：

```bash
cd /opt/huibiao-deploy
docker compose down
docker compose up -d
```

受影响的实际变量是：

```text
HOST=http://${SERVER_IP}:7000
LABEL_STUDIO_HOST=http://${SERVER_IP}:7000
ML_BACKEND_URL=http://${SERVER_IP}:9091
```

这些都由 `.env` 自动带入，不需要逐条手改。

### 18.2 标注平台入口端口变化

例如从 `7000` 改成 `7100`。

修改：

```env
LABEL_STUDIO_PORT=7100
```

然后重启：

```bash
docker compose down
docker compose up -d
```

访问地址也随之变成：

```text
http://服务器IP:7100
```

### 18.3 图像后端端口变化

例如从 `9091` 改成 `19091`。

修改：

```env
ML_IMAGE_PORT=19091
```

然后重启：

```bash
docker compose down
docker compose up -d
```

浏览器访问图像后端控制台变成：

```text
http://服务器IP:19091/console
```

注意：容器内部仍然是 `9091`，所以 compose 里是：

```yaml
ports:
  - "${ML_IMAGE_PORT}:9091"
```

这一行不要改成 `${ML_IMAGE_PORT}:${ML_IMAGE_PORT}`。

### 18.4 外部 SSO / 数据集平台地址变化

例如外部平台从：

```text
68.68.18.26:31798
```

变成：

```text
68.67.118.89:37777
```

需要改两个地方。

第一处：`.env`

```env
SSO_EXTERNAL_HOST=68.67.118.89:37777
```

第二处：`nginx/default.conf`

把两组外部平台代理都改掉：

```nginx
location /api/v1/admin/user/dict/ {
    proxy_pass http://68.67.118.89:37777;
    proxy_set_header Host 68.67.118.89:37777;
}

location /api/v1/fileExplorer/ {
    proxy_pass http://68.67.118.89:37777;
    proxy_set_header Host 68.67.118.89:37777;
}
```

然后重启：

```bash
docker compose down
docker compose up -d
```

为什么这里要改两个地方：

- `.env` 里的 `SSO_EXTERNAL_HOST` 给标注平台后端使用，用来调用 SSO 用户信息接口。
- `nginx/default.conf` 里的 `proxy_pass` 给浏览器侧数据集/字典接口使用，用来避免 CORS。

### 18.5 容器名不要随便改

下面这些 Docker 内网地址依赖容器名：

```text
http://huibiao-system:8080
http://ml-backend-image:9091
```

如果没有特别原因，不要改容器名：

```text
huibiao-system
ml-backend-image
huibiao-nginx
```

否则这些变量和 Nginx 配置都要同步改：

```text
ML_IMAGE_HOST
ML_LABEL_STUDIO_URL
LABEL_STUDIO_URL
proxy_pass http://huibiao-system:8080
```

### 18.6 换 IP 后快速检查清单

改完配置并重启后，依次检查：

```bash
docker compose ps
curl http://127.0.0.1:7000/api/version
curl http://127.0.0.1:9091/health
```

如果端口也改了，用新端口替换。

浏览器检查：

```text
http://新服务器IP:标注平台端口
http://新服务器IP:图像后端端口/console
```

标注平台内检查：

```text
项目设置 -> 智能标注 -> 连接默认图像模型
```

图像后端控制台检查：

```text
检查连通性
```

期望看到：

```text
标注平台 API 可达
ML Backend URL 可达
```
