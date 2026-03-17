#!/usr/bin/env bash

# 容器内 PostgreSQL 启动脚本
# 用途：初始化并启动容器内的 PostgreSQL 服务

set -e

POSTGRES_DATA_DIR="/var/lib/postgresql/data"
PG_VERSION="11"

echo "=> Starting internal PostgreSQL server..."

# 如果指定了外部 PostgreSQL 主机（非 localhost），则不启动容器内 PostgreSQL
if [[ "${POSTGRE_HOST}" != "localhost" && "${POSTGRE_HOST}" != "127.0.0.1" ]]; then
    echo "=> External PostgreSQL host detected: ${POSTGRE_HOST}"
    echo "=> Skipping internal PostgreSQL initialization"
    return 0 2>/dev/null || exit 0
fi

# 检查 PostgreSQL 数据目录是否已初始化
if [[ ! -d "${POSTGRES_DATA_DIR}/base" ]]; then
    echo "=> Initializing PostgreSQL data directory..."
    mkdir -p "${POSTGRES_DATA_DIR}"
    chown postgres:postgres "${POSTGRES_DATA_DIR}"
    chmod 700 "${POSTGRES_DATA_DIR}"
    
    # 以 postgres 用户初始化数据库集群
    sudo -u postgres /usr/lib/postgresql/${PG_VERSION}/bin/initdb -D "${POSTGRES_DATA_DIR}"
fi

# 启动 PostgreSQL daemon
echo "=> Starting PostgreSQL daemon..."
sudo -u postgres /usr/lib/postgresql/${PG_VERSION}/bin/postgres -D "${POSTGRES_DATA_DIR}" &
POSTGRES_PID=$!

# 等待 PostgreSQL 就绪（最多 30 秒）
echo "=> Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if sudo -u postgres /usr/lib/postgresql/${PG_VERSION}/bin/pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
        echo "=> PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "=> ERROR: PostgreSQL failed to start"
        exit 1
    fi
    sleep 1
done

# 创建数据库用户和数据库（如果不存在）
echo "=> Creating PostgreSQL user and database..."
sudo -u postgres psql -h localhost <<EOF
SELECT 1 FROM pg_user WHERE usename = '${POSTGRE_USER}' LIMIT 1;
EOF

# 更安全的方式：先检查用户是否存在   
USER_EXISTS=$(sudo -u postgres psql -h localhost -t -c "SELECT 1 FROM pg_user WHERE usename = '${POSTGRE_USER}';" 2>/dev/null || echo "")
if [[ -z "$USER_EXISTS" ]]; then
    echo "=> Creating user ${POSTGRE_USER}..."
    sudo -u postgres psql -h localhost -c "CREATE USER ${POSTGRE_USER} WITH PASSWORD '${POSTGRE_PASSWORD}';"
    sudo -u postgres psql -h localhost -c "ALTER USER ${POSTGRE_USER} CREATEDB;"
fi

# 创建数据库（如果不存在）
DB_EXISTS=$(sudo -u postgres psql -h localhost -l | grep "${POSTGRE_NAME}" || echo "")
if [[ -z "$DB_EXISTS" ]]; then
    echo "=> Creating database ${POSTGRE_NAME}..."
    sudo -u postgres psql -h localhost -c "CREATE DATABASE ${POSTGRE_NAME} OWNER ${POSTGRE_USER};"
fi

echo "=> PostgreSQL initialization complete"

# 保持 PostgreSQL 后台运行
wait $POSTGRES_PID
