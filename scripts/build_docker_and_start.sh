SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

if bash ${SCRIPT_DIR}/../deploy/prebuild.sh; then
  docker build -t heartexlabs/label-studio ${SCRIPT_DIR}/..
fi

if [ $? -eq 0 ]; then
    EXTERNAL_PORT=${LABEL_STUDIO_PORT:-8000}
    INTERNAL_PORT=${LABEL_STUDIO_INTERNAL_PORT:-8000}
    docker run -it -p ${EXTERNAL_PORT}:${INTERNAL_PORT} -v `pwd`/mydata:/label-studio/data heartexlabs/label-studio:latest
else
    echo "Docker build failed."
fi
