$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$PythonExe = Join-Path $ProjectRoot '.kdzda/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $PythonExe)) { throw 'Python environment .kdzda is missing. Run scripts/bootstrap/setup-local.ps1 first.' }
& $PythonExe (Join-Path $ProjectRoot 'scripts/run/launch.py') configure-deepseek
if ($LASTEXITCODE -ne 0) { throw 'DeepSeek configuration failed.' }
