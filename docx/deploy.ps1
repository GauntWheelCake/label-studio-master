# 标注平台 Nginx 反向代理部署脚本
# 用法：在包含本脚本的目录下用 PowerShell 执行
#
# 使用本脚本前，请先用实际的外部平台地址修改同目录下的 nginx.conf 文件。
#
# 可通过环境变量配置：
#   $env:HOST_PORT = "7000"
#   $env:LABEL_STUDIO_HOST = "http://68.68.18.26:7000"
#   $env:SSO_USERINFO_HOST = "68.68.18.26:31798"
#   $env:ML_HOST = "68.68.18.26:9000"

$ErrorActionPreference = "Stop"

# 默认配置（可在执行前通过 $env:xxx 覆盖）
$hostPort = if ($env:HOST_PORT) { $env:HOST_PORT } else { "7000" }
$labelStudioHost = if ($env:LABEL_STUDIO_HOST) { $env:LABEL_STUDIO_HOST } else { "http://68.68.18.26:${hostPort}" }
$ssoUserinfoHost = if ($env:SSO_USERINFO_HOST) { $env:SSO_USERINFO_HOST } else { "68.68.18.26:31798" }
$mlHost = if ($env:ML_HOST) { $env:ML_HOST } else { "" }

# 停止并移除旧容器（如果存在）
$containers = @("huibiao-system", "huibiao-nginx")
foreach ($name in $containers) {
    $exists = docker ps -aq -f name=$name
    if ($exists) {
        Write-Host "Stopping and removing existing container: $name"
        docker stop $name | Out-Null
        docker rm $name | Out-Null
    }
}

# 创建 Docker 网络（已存在则忽略错误）
docker network create huibiao-net 2>$null
if ($?) {
    Write-Host "Docker network 'huibiao-net' created."
} else {
    Write-Host "Docker network 'huibiao-net' already exists or creation skipped."
}

# 启动 Label Studio，不直接暴露 7000 端口
# SSO_DATASET_API_HOST 置空，让前端通过相对路径调用外部数据集接口
Write-Host "Starting Label Studio container..."
docker run -d `
  --name huibiao-system `
  --network huibiao-net `
  -v "${PWD}\mydata:/label-studio/data" `
  -e LABEL_STUDIO_HOST=$labelStudioHost `
  -e SSO_USERINFO_HOST=$ssoUserinfoHost `
  -e SSO_DATASET_API_HOST="" `
  -e ML_HOST=$mlHost `
  huibiao-system:latest

# 启动 Nginx，作为统一入口暴露宿主机的 $hostPort 端口
Write-Host "Starting Nginx container..."
docker run -d `
  --name huibiao-nginx `
  --network huibiao-net `
  -p "${hostPort}:80" `
  -v "${PWD}\nginx.conf:/etc/nginx/conf.d/default.conf" `
  nginx:alpine

Write-Host "Done. Access the platform at $labelStudioHost"
Write-Host "Reminder: make sure nginx.conf points to the correct external platform address."
