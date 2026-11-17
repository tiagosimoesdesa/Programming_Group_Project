$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'backend')
try {
    $pythonPath = Join-Path $PWD '.venv/Scripts/python.exe'
    if (-not (Test-Path -LiteralPath $pythonPath)) {
        throw 'Backend dependencies are missing. Follow README.md to run uv sync first.'
    }
    if (-not (Test-Path -LiteralPath '.env')) {
        throw 'Create backend/.env using the README.md setup steps first.'
    }
    & $pythonPath -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }
    & $pythonPath -m uvicorn app.main:app --host 0.0.0.0 --port 8000
} finally {
    Pop-Location
}
