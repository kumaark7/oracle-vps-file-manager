$ErrorActionPreference = "Stop"

node ".\node_modules\vite\bin\vite.js" build --configLoader runner

if (-not $env:ADMIN_PASSWORD) {
  throw "Set ADMIN_PASSWORD before starting the local preview."
}

if (-not $env:ADMIN_USER) {
  $env:ADMIN_USER = "admin"
}

if (-not $env:FILE_ROOT) {
  $env:FILE_ROOT = $PWD.Path
}

node ".\server\index.cjs"
