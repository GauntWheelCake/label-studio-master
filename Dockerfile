# Building the main container
FROM ubuntu:20.04

WORKDIR /label-studio

# ENV TZ=Europe/Berlin
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 系统依赖（包含 PostgreSQL Server）
RUN apt-get update && apt-get install -y \
    build-essential postgresql postgresql-contrib python3.8 python3-pip python3.8-dev \
    uwsgi git libxml2-dev libxslt-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN chgrp -R 0 /var/log /var/cache /var/run /run /tmp /etc/uwsgi && \
    chmod -R g+rwX /var/log /var/cache /var/run /run /tmp /etc/uwsgi

# 先复制依赖清单（利用缓存）
COPY deploy/requirements.txt /label-studio/

# 安装后端依赖
RUN python3 -m pip install --upgrade pip \
    && python3 -m pip install -r /label-studio/requirements.txt \
    && python3 -m pip install uwsgi

# 运行所需环境变量
ENV DJANGO_SETTINGS_MODULE=core.settings.label_studio
ENV LABEL_STUDIO_BASE_DATA_DIR=/label-studio/data

# 共享管理员模式配置（烧入镜像）
ENV ENABLE_SHARED_ADMIN_MODE=true \
    SHARED_ADMIN_EMAIL=shared-admin@huibiaosystem.local \
    SHARED_ADMIN_USERNAME=shared-admin \
    SHARED_ORGANIZATION_TITLE="Hui Biao Shared" \
    SHARED_ADMIN_FIXED_TOKEN=asldjfklawdkgnakjhjdfoijgp; \
    DJANGO_DB=postgres \
    POSTGRE_HOST=localhost \
    POSTGRE_PORT=5432 \
    POSTGRE_USER=label_studio \
    POSTGRE_PASSWORD=label_studio_pwd \
    POSTGRE_NAME=label_studio_db

# 复制源码
COPY . /label-studio

# ★ 补丁(a)：递归修正 .sh 的 CRLF -> LF，并加执行权限
RUN find /label-studio/deploy -type f -name "*.sh" -exec sed -i 's/\r$//' {} \; -exec chmod +x {} \;

# 开发模式安装项目
RUN python3.8 /label-studio/setup.py develop

EXPOSE 8080

# ★ 补丁(b)：将 DRF 固定到兼容版本（避免 NullBooleanField 报错）
RUN python3 -m pip install --no-cache-dir "djangorestframework==3.13.1"

# （保留）构建阶段的预初始化（不编前端）
RUN bash -xe /label-studio/deploy/prebuild_wo_frontend.sh

ENTRYPOINT ["/label-studio/deploy/docker-entrypoint.sh"]
# 用 JSON 写法更稳
CMD ["bash", "/label-studio/deploy/start_label_studio.sh"]
