$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Python = Join-Path $ProjectRoot '.kdzda/Scripts/python.exe'

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw 'Python environment is missing. Run scripts\bootstrap\setup-local.ps1 first.'
}

Push-Location $ProjectRoot
try {
    Write-Host 'Checking for unresolved merge markers...'
    $Markers = & rg -n --hidden --text `
        --glob '!.git/**' --glob '!node_modules/**' --glob '!.kdzda/**' `
        --glob '!build/**' --glob '!dist/**' --glob '!runtime/**' `
        '^(<{7,}|={7,}|>{7,}|\|{7,})( .*)?$' .
    if ($LASTEXITCODE -eq 0) {
        $Markers | Write-Host -ForegroundColor Red
        throw 'Unresolved merge markers found.'
    }
    if ($LASTEXITCODE -ne 1) {
        throw "Merge marker scan failed with exit code $LASTEXITCODE"
    }

    Write-Host 'Running Ruff...'
    & $Python -m ruff check KingdeeZwyDataAnalyser scripts
    Assert-LastExitCode 'Ruff'

    Write-Host 'Compiling Python sources...'
    & $Python -m compileall -q KingdeeZwyDataAnalyser scripts
    Assert-LastExitCode 'Python compilation'

    Write-Host 'Checking Electron JavaScript syntax...'
    $JavaScriptFiles = Get-ChildItem electron -Recurse -File | Where-Object { $_.Extension -in '.js', '.cjs', '.mjs' }
    foreach ($File in $JavaScriptFiles) {
        & node --check $File.FullName
        Assert-LastExitCode ("JavaScript syntax: " + $File.FullName)
    }

    Write-Host 'All static checks passed.' -ForegroundColor Green
} finally {
    Pop-Location
}
