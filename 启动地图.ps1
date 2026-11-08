param([int]$Port=8790, [string]$Python='py')
$ErrorActionPreference = 'Stop'
[string[]]$pythonArgs=if ([IO.Path]::GetFileNameWithoutExtension($Python) -eq 'py') { @('-3') } else { @() }
& $Python @pythonArgs (Join-Path $PSScriptRoot 'server.py') --port $Port
if ($LASTEXITCODE -ne 0) { throw '地图服务启动失败，请检查 Python 3.10 或以上版本及端口占用。' }
