$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'mobile')
try {
    if (-not (Test-Path -LiteralPath 'node_modules/expo/bin/cli')) {
        throw 'Mobile dependencies are missing. Follow README.md to run npm ci first.'
    }
    if (-not (Test-Path -LiteralPath '.env')) {
        throw 'Create mobile/.env using the README.md setup steps first.'
    }
    $env:EXPO_NO_TELEMETRY = '1'
    node node_modules/expo/bin/cli start --lan
} finally {
    Pop-Location
}
