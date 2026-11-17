$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot 'mobile')
try {
    $env:EXPO_NO_TELEMETRY = '1'
    node node_modules/expo/bin/cli start --web --port 8082 --localhost
} finally {
    Pop-Location
}
