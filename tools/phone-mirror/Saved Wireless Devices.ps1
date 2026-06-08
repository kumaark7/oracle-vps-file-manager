$ErrorActionPreference = "Stop"

$storagePath = Join-Path $PSScriptRoot "phone-mirror-devices.json"
$mirrorScript = Join-Path $PSScriptRoot "start-phone-mirror.ps1"

if (-not (Test-Path $storagePath)) {
  Write-Host "No saved device data found yet." -ForegroundColor Yellow
  Write-Host "Connect once first so the phone can be remembered." -ForegroundColor Yellow
  exit 1
}

try {
  $data = Get-Content -Path $storagePath -Raw | ConvertFrom-Json
}
catch {
  Write-Host "Could not read saved device data." -ForegroundColor Red
  exit 1
}

$devices = @($data.devices | Where-Object { $_.lastKnownIp })
if ($devices.Count -eq 0) {
  Write-Host "No saved wireless-capable devices found." -ForegroundColor Yellow
  Write-Host "Connect once and let the script learn the device IP first." -ForegroundColor Yellow
  exit 1
}

while ($true) {
  Clear-Host
  Write-Host "============================" -ForegroundColor Cyan
  Write-Host "  SAVED WIRELESS DEVICES" -ForegroundColor Cyan
  Write-Host "============================" -ForegroundColor Cyan
  Write-Host ""

  for ($i = 0; $i -lt $devices.Count; $i++) {
    $device = $devices[$i]
    $name = if ($device.displayName) { $device.displayName } else { $device.id }
    if ($device.tag) {
      $name = "$name [$($device.tag)]"
    }

    $port = if ($device.lastWirelessPort) { $device.lastWirelessPort } else { 5555 }
    Write-Host "$($i + 1). $name"
    Write-Host "   IP: $($device.lastKnownIp)   Port: $port"
    Write-Host ""
  }

  Write-Host "0. Back"
  Write-Host ""
  $choice = Read-Host "Select device"

  if ($choice -eq "0") {
    exit 0
  }

  $index = 0
  if (-not [int]::TryParse($choice, [ref]$index)) {
    continue
  }

  if ($index -lt 1 -or $index -gt $devices.Count) {
    continue
  }

  $selected = $devices[$index - 1]
  $port = if ($selected.lastWirelessPort) { [int]$selected.lastWirelessPort } else { 5555 }

  Write-Host ""
  Write-Host "Starting wireless mirror for $($selected.displayName)..." -ForegroundColor Green
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $mirrorScript -Wireless -PhoneIp $selected.lastKnownIp -Port $port
  Write-Host ""
  pause
}
