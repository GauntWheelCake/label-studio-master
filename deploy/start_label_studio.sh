#!/usr/bin/env bash
# see deploy/uwsgi.ini for details
# /usr/local/bin/uwsgi --ini /label-studio/deploy/uwsgi.ini
echo "Make simple Label Studio launch..."

BIND_HOST=${LABEL_STUDIO_BIND_HOST:-0.0.0.0}
PORT=${LABEL_STUDIO_PORT:-8000}

label-studio start --host "${BIND_HOST}" --port "${PORT}"