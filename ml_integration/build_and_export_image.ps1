param(
    [string]$Tag = "huibiao/ml-backend:faster-rcnn-v1",
    [string]$TarName = "huibiao-ml-backend-faster-rcnn-v1.tar"
)

$ErrorActionPreference = "Stop"

Write-Host "[1/2] Building image: $Tag"
docker build -f ml_integration/Dockerfile -t $Tag .

Write-Host "[2/2] Exporting image to: $TarName"
docker save -o $TarName $Tag

Write-Host "Done. Share this file: $TarName"
