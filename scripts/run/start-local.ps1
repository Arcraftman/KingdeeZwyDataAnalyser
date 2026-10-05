$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Electron = Join-Path $ProjectRoot 'node_modules/electron'
if (-not (Test-Path -LiteralPath $Electron)) {
    throw 'Electron is not installed. Run npm install from the project root first.'
}
Push-Location $ProjectRoot
try {
    & npm.cmd run desktop
    if ($LASTEXITCODE -ne 0) { throw 'Electron failed to start.' }
} finally {
    Pop-Location
}
