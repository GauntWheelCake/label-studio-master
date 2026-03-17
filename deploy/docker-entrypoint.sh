#!/usr/bin/env bash

set -e

# 启动容器内 PostgreSQL（如果不指定外部主机）
if [[ "${POSTGRE_HOST}" == "localhost" || "${POSTGRE_HOST}" == "127.0.0.1" || -z "${POSTGRE_HOST}" ]]; then
    echo "=> Starting internal PostgreSQL server..."
    bash /label-studio/deploy/start_internal_postgres.sh &
    POSTGRES_BG_PID=$!
    sleep 2
fi

# 等待数据库就绪
echo "=> Waiting for database at ${POSTGRE_HOST}:${POSTGRE_PORT}..."
for i in {1..30}; do
    if python3 -c "import psycopg2; psycopg2.connect(host='${POSTGRE_HOST}', port='${POSTGRE_PORT}', user='${POSTGRE_USER}', password='${POSTGRE_PASSWORD}', database='${POSTGRE_NAME}')" >/dev/null 2>&1; then
        echo "=> Database is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "=> ERROR: Database failed to become ready"
        exit 1
    fi
    sleep 1
done

echo "=> Do database migrations..."
python3 label_studio/manage.py migrate

echo "=> Run $@..."
exec "$@"

