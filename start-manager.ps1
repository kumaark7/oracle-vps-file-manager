$ErrorActionPreference = "Stop"

node ".\node_modules\vite\bin\vite.js" build --configLoader runner

if (-not $env:ADMIN_PASSWORD) {
  $env:ADMIN_PASSWORD = "local-preview-password"
}

if (-not $env:ADMIN_USER) {
  $env:ADMIN_USER = "admin"
}

if (-not $env:FILE_ROOT) {
  $env:FILE_ROOT = $PWD.Path
}

node ".\server.cjs"
