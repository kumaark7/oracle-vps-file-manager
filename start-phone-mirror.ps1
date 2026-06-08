param(
  [switch]$Wireless,
  [switch]$PairWireless,
  [string]$PhoneIp,
  [int]$Port = 5555,
  [int]$PairPort,
  [string]$PairCode,
  [ValidateSet("Normal", "Right", "UpsideDown", "Left")]
  [string]$Rotate
)

$ErrorActionPreference = "Stop"

function Find-ToolPath {
  param(
    [string]$CommandName,
    [string[]]$FallbackPaths
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($path in $FallbackPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Get-ReadyDevices {
  param(
    [string]$AdbExecutable
  )

  $deviceLines = & $AdbExecutable devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }
  return @($deviceLines | Where-Object { $_ -match "\sdevice$" })
}

function Get-DeviceSerial {
  param(
    [string[]]$ReadyDevices
  )

  if (-not $ReadyDevices -or $ReadyDevices.Count -eq 0) {
    return $null
  }

  return ($ReadyDevices[0] -split '\s+')[0]
}

function Get-DeviceIp {
  param(
    [string]$AdbExecutable
  )

  $routeInfo = & $AdbExecutable shell ip route 2>$null
  if (-not $routeInfo) {
    return $null
  }

  foreach ($line in $routeInfo) {
    if ($line -match 'src\s+(\d+\.\d+\.\d+\.\d+)') {
      return $matches[1]
    }
  }

  return $null
}

function Get-WirelessTarget {
  param(
    [string]$AdbExecutable,
    [string]$RequestedIp
  )

  $deviceLines = & $AdbExecutable devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }
  $tcpDevices = @($deviceLines | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+:\d+\s+device$' })

  if ($RequestedIp) {
    $match = $tcpDevices | Where-Object { $_ -match "^$([regex]::Escape($RequestedIp)):" } | Select-Object -First 1
    if ($match) {
      return ($match -split '\s+')[0]
    }

    return $null
  }

  if ($tcpDevices.Count -gt 0) {
    return ($tcpDevices[0] -split '\s+')[0]
  }

  return $null
}

function Invoke-Adb {
  param(
    [string]$AdbExecutable,
    [string]$DeviceSerial,
    [string[]]$Arguments
  )

  $adbArgs = @()
  if ($DeviceSerial) {
    $adbArgs += @("-s", $DeviceSerial)
  }

  $adbArgs += $Arguments
  & $AdbExecutable @adbArgs
}

function Get-ScreenIsOn {
  param(
    [string]$AdbExecutable,
    [string]$DeviceSerial
  )

  $powerInfo = Invoke-Adb -AdbExecutable $AdbExecutable -DeviceSerial $DeviceSerial -Arguments @("shell", "dumpsys", "power") 2>$null
  if (-not $powerInfo) {
    return $null
  }

  foreach ($line in $powerInfo) {
    if ($line -match 'mWakefulness=(Awake|Dreaming)') {
      return $true
    }
  }

  foreach ($line in $powerInfo) {
    if ($line -match 'Display State=ON' -or $line -match 'mScreenState=ON') {
      return $true
    }
  }

  return $false
}

function Set-ScreenPowerState {
  param(
    [string]$AdbExecutable,
    [string]$DeviceSerial,
    [bool]$TurnOn
  )

  $currentState = Get-ScreenIsOn -AdbExecutable $AdbExecutable -DeviceSerial $DeviceSerial
  if ($null -eq $currentState) {
    return
  }

  if ($TurnOn -and -not $currentState) {
    Invoke-Adb -AdbExecutable $AdbExecutable -DeviceSerial $DeviceSerial -Arguments @("shell", "input", "keyevent", "POWER") | Out-Null
  }

  if (-not $TurnOn -and $currentState) {
    Invoke-Adb -AdbExecutable $AdbExecutable -DeviceSerial $DeviceSerial -Arguments @("shell", "input", "keyevent", "POWER") | Out-Null
  }
}

function Get-RotationValue {
  param(
    [string]$RotateOption
  )

  if (-not $RotateOption) {
    return $null
  }

  $rotationMap = @{
    Normal = "0"
    Right = "90"
    UpsideDown = "180"
    Left = "270"
  }

  return $rotationMap[$RotateOption]
}

function Start-ScrcpySession {
  param(
    [string]$AdbExecutable,
    [string]$ScrcpyExecutable,
    [string]$DeviceSerial,
    [string[]]$ConnectionArguments,
    [scriptblock]$OnSessionClosed
  )

  $scrcpyArgs = @("--stay-awake")

  if ($DeviceSerial) {
    $scrcpyArgs += "--serial=$DeviceSerial"
  }

  $rotationValue = Get-RotationValue -RotateOption $Rotate
  if ($rotationValue) {
    $scrcpyArgs += "--display-orientation=$rotationValue"
  }

  if ($ConnectionArguments) {
    $scrcpyArgs += $ConnectionArguments
  }

  $scrcpyExitCode = 0

  try {
    & $ScrcpyExecutable @scrcpyArgs
    $scrcpyExitCode = $LASTEXITCODE
  }
  finally {
    if ($OnSessionClosed) {
      & $OnSessionClosed
    }
  }

  exit $scrcpyExitCode
}

$adbPath = Find-ToolPath -CommandName "adb" -FallbackPaths @(
  "C:\adb\adb.exe"
)

if (-not $adbPath) {
  Write-Host "ADB was not found. Install Android platform-tools first." -ForegroundColor Red
  exit 1
}

$scrcpyPath = Find-ToolPath -CommandName "scrcpy" -FallbackPaths @(
  "C:\ProgramData\chocolatey\bin\scrcpy.exe",
  "C:\ProgramData\chocolatey\lib\scrcpy\tools\scrcpy.exe",
  "C:\scrcpy\scrcpy.exe"
)

if (-not $scrcpyPath) {
  Write-Host "scrcpy is not installed yet." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Install it with one of these commands, then run this script again:" -ForegroundColor Yellow
  Write-Host "  choco install scrcpy -y"
  Write-Host "  winget install Genymobile.scrcpy"
  exit 1
}

if ($PairWireless) {
  Write-Host "Preparing direct wireless pairing..." -ForegroundColor Cyan
  Write-Host "On the phone open Developer options > Wireless debugging > Pair device with pairing code." -ForegroundColor Yellow

  if (-not $PhoneIp) {
    $PhoneIp = Read-Host "Enter the phone IP address shown on the phone"
  }

  if (-not $PairPort) {
    $pairPortInput = Read-Host "Enter the pairing port shown on the phone"
    if (-not [int]::TryParse($pairPortInput, [ref]$PairPort)) {
      Write-Host "The pairing port must be a number." -ForegroundColor Red
      exit 1
    }
  }

  if (-not $PairCode) {
    $PairCode = Read-Host "Enter the pairing code shown on the phone"
  }

  if (-not $PhoneIp -or -not $PairPort -or -not $PairCode) {
    Write-Host "Phone IP, pairing port, and pairing code are all required." -ForegroundColor Red
    exit 1
  }

  & $adbPath pair "${PhoneIp}:$PairPort" $PairCode | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Wireless pairing failed." -ForegroundColor Red
    exit $LASTEXITCODE
  }

  Start-Sleep -Seconds 2
  $wirelessTarget = Get-WirelessTarget -AdbExecutable $adbPath -RequestedIp $PhoneIp
  if (-not $wirelessTarget) {
    $wirelessTarget = Read-Host "Enter the wireless debugging address shown on the phone (example: 192.168.1.5:37639)"
  }

  if (-not $wirelessTarget) {
    Write-Host "A wireless debugging address is required after pairing." -ForegroundColor Red
    exit 1
  }

  & $adbPath connect $wirelessTarget | Out-Host
  Start-Sleep -Seconds 2

  $wirelessReady = Get-WirelessTarget -AdbExecutable $adbPath -RequestedIp $PhoneIp
  if (-not $wirelessReady) {
    Write-Host "The phone did not come online over Wi-Fi." -ForegroundColor Yellow
    Write-Host "Make sure the phone and PC are on the same Wi-Fi network and Wireless debugging stays enabled."
    exit 1
  }

  Write-Host "Starting wireless phone mirror and control..." -ForegroundColor Green
  Write-Host "Clipboard sync is handled by scrcpy, so copy and paste should work while connected." -ForegroundColor Green

  Start-ScrcpySession -AdbExecutable $adbPath -ScrcpyExecutable $scrcpyPath -DeviceSerial $null -ConnectionArguments @("--tcpip=$wirelessReady") -OnSessionClosed {
    Write-Host "Mirror window closed. Ending wireless connection..." -ForegroundColor Yellow
    & $adbPath disconnect $wirelessReady | Out-Null
  }
}

if ($Wireless) {
  Write-Host "Preparing wireless Android mirroring..." -ForegroundColor Cyan

  if (-not $PhoneIp) {
    $readyDevices = Get-ReadyDevices -AdbExecutable $adbPath
    if ($readyDevices.Count -eq 0) {
      Write-Host "No ready USB-connected phone was found for wireless setup." -ForegroundColor Yellow
      Write-Host ""
      Write-Host "For the first wireless setup, connect the phone with USB, unlock it, and allow USB debugging."
      exit 1
    }

    $PhoneIp = Get-DeviceIp -AdbExecutable $adbPath
  }

  if (-not $PhoneIp) {
    Write-Host "Could not detect the phone IP address automatically." -ForegroundColor Yellow
    Write-Host "Reconnect with USB and keep the phone unlocked, or run with -PhoneIp 192.168.x.x"
    exit 1
  }

  Write-Host "Using phone IP $PhoneIp on port $Port" -ForegroundColor Green

  $readyDevices = Get-ReadyDevices -AdbExecutable $adbPath
  if ($readyDevices.Count -gt 0) {
    & $adbPath tcpip $Port | Out-Host
    Start-Sleep -Seconds 2
  }

  & $adbPath connect "${PhoneIp}:$Port" | Out-Host
  Start-Sleep -Seconds 2

  $wirelessTarget = "${PhoneIp}:$Port"
  $wirelessReady = @((& $adbPath devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }) | Where-Object { $_ -match "^$([regex]::Escape($wirelessTarget))\s+device$" })
  if ($wirelessReady.Count -eq 0) {
    Write-Host "Wireless ADB did not come online yet." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Make sure the phone and PC are on the same Wi-Fi network, then try again."
    exit 1
  }

  Write-Host "Starting wireless phone mirror and control..." -ForegroundColor Green
  Write-Host "Clipboard sync is handled by scrcpy, so copy and paste should work while connected." -ForegroundColor Green

  Start-ScrcpySession -AdbExecutable $adbPath -ScrcpyExecutable $scrcpyPath -DeviceSerial $null -ConnectionArguments @("--tcpip=$wirelessTarget") -OnSessionClosed {
    Write-Host "Mirror window closed. Ending wireless connection..." -ForegroundColor Yellow
    & $adbPath disconnect $wirelessTarget | Out-Null
  }
}

Write-Host "Checking for a connected Android phone..." -ForegroundColor Cyan
$readyDevices = Get-ReadyDevices -AdbExecutable $adbPath

if ($readyDevices.Count -eq 0) {
  Write-Host "No ready phone was found." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Do this on your phone, then run the script again:"
  Write-Host "  1. Enable Developer options"
  Write-Host "  2. Turn on USB debugging"
  Write-Host "  3. Connect the phone with a USB cable"
  Write-Host "  4. Tap Allow on the USB debugging prompt"
  exit 1
}

Write-Host "Starting phone mirror and control..." -ForegroundColor Green
Write-Host "Clipboard sync is handled by scrcpy, so copy and paste should work while connected." -ForegroundColor Green

$deviceSerial = Get-DeviceSerial -ReadyDevices $readyDevices
Start-ScrcpySession -AdbExecutable $adbPath -ScrcpyExecutable $scrcpyPath -DeviceSerial $deviceSerial -ConnectionArguments @()
