Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptPath = Join-Path $PSScriptRoot "start-phone-mirror.ps1"
$storagePath = Join-Path $PSScriptRoot "phone-mirror-devices.json"
$logPath = Join-Path $PSScriptRoot "phone-mirror.log"
$adbPath = "C:\adb\adb.exe"

function Add-Log {
  param(
    [System.Windows.Forms.TextBox]$LogBox,
    [string]$Message
  )

  $timestamp = Get-Date -Format "HH:mm:ss"
  $LogBox.AppendText("[$timestamp] $Message`r`n")
}

function Get-SavedDevices {
  if (-not (Test-Path $storagePath)) {
    return @()
  }

  try {
    $data = Get-Content -Path $storagePath -Raw | ConvertFrom-Json -AsHashtable
    if ($data.devices) {
      return @($data.devices)
    }
  }
  catch {
  }

  return @()
}

function Get-RecentLogLines {
  if (-not (Test-Path $logPath)) {
    return @("No connection log yet.")
  }

  return @(Get-Content -Path $logPath -Tail 12)
}

function Clear-LogFile {
  if (Test-Path $logPath) {
    Set-Content -Path $logPath -Value ""
  }
}

function Quote-Argument {
  param(
    [string]$Value
  )

  if ($null -eq $Value) {
    return '""'
  }

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  return '"' + ($Value -replace '"', '\"') + '"'
}

function Build-ArgumentList {
  param(
    [string]$Mode,
    [bool]$PrepareOnly,
    [bool]$ScreenOff,
    [string]$Rotate,
    [string]$PhoneIp,
    [string]$Port,
    [string]$PairPort,
    [string]$PairCode,
    [string]$SavedDeviceId,
    [string]$Tag
  )

  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $scriptPath
  )

  switch ($Mode) {
    "Wireless" { $arguments += "-Wireless" }
    "PairWireless" { $arguments += "-PairWireless" }
  }

  if ($PrepareOnly) {
    $arguments += "-PrepareOnly"
  }

  if ($ScreenOff) {
    $arguments += "-ScreenOffWhileConnected"
  }

  if ($Rotate -and $Rotate -ne "Normal") {
    $arguments += @("-Rotate", $Rotate)
  }

  if ($SavedDeviceId) {
    $arguments += @("-SavedDeviceId", $SavedDeviceId)
  }

  if ($Tag) {
    $arguments += @("-Tag", $Tag)
  }

  if ($PhoneIp) {
    $arguments += @("-PhoneIp", $PhoneIp)
  }

  if ($Port) {
    $arguments += @("-Port", $Port)
  }

  if ($PairPort) {
    $arguments += @("-PairPort", $PairPort)
  }

  if ($PairCode) {
    $arguments += @("-PairCode", $PairCode)
  }

  return ,$arguments
}

function Convert-ArgumentListToString {
  param(
    [string[]]$Arguments
  )

  return (($Arguments | ForEach-Object { Quote-Argument $_ }) -join " ")
}

function Get-CurrentConnectionState {
  $state = @{
    usbReady = $false
    wirelessReady = $false
    unauthorized = $false
    message = "Connect phone and enable USB debugging."
    readyUsbSerial = $null
    readyWirelessTarget = $null
  }

  if (-not (Test-Path $adbPath)) {
    $state.message = "ADB not found."
    return $state
  }

  $deviceLines = & $adbPath devices | Select-Object -Skip 1 | Where-Object { $_.Trim() }
  foreach ($line in $deviceLines) {
    if ($line -match "^\S+\s+unauthorized$") {
      $state.unauthorized = $true
    }

    if ($line -match "^\S+\s+device$") {
      $serial = ($line -split '\s+')[0]
      if ($serial -match ':') {
        $state.wirelessReady = $true
        if (-not $state.readyWirelessTarget) {
          $state.readyWirelessTarget = $serial
        }
      }
      else {
        $state.usbReady = $true
        if (-not $state.readyUsbSerial) {
          $state.readyUsbSerial = $serial
        }
      }
    }
  }

  if ($state.unauthorized) {
    $state.message = "USB debugging authorization needed on the phone."
  }
  elseif ($state.usbReady -and $state.wirelessReady) {
    $state.message = "USB and wireless device available."
  }
  elseif ($state.usbReady) {
    $state.message = "USB debugging ready."
  }
  elseif ($state.wirelessReady) {
    $state.message = "Wireless device available."
  }

  return $state
}

function Get-SelectedDevice {
  param(
    [System.Windows.Forms.ListView]$DeviceListView
  )

  if ($DeviceListView.SelectedItems.Count -gt 0 -and $DeviceListView.SelectedItems[0].Tag) {
    return $DeviceListView.SelectedItems[0].Tag
  }

  return $null
}

function Update-SelectedDeviceFields {
  param(
    [System.Windows.Forms.ListView]$DeviceListView,
    [System.Windows.Forms.TextBox]$PhoneIpBox,
    [System.Windows.Forms.TextBox]$PortBox,
    [System.Windows.Forms.TextBox]$PairPortBox,
    [System.Windows.Forms.TextBox]$TagBox
  )

  $selected = Get-SelectedDevice -DeviceListView $DeviceListView
  if (-not $selected) {
    $TagBox.Text = ""
    return
  }

  if ($selected.lastKnownIp) {
    $PhoneIpBox.Text = $selected.lastKnownIp
  }

  if ($selected.lastWirelessPort) {
    $PortBox.Text = [string]$selected.lastWirelessPort
  }

  if ($selected.lastPairPort) {
    $PairPortBox.Text = [string]$selected.lastPairPort
  }

  $TagBox.Text = if ($selected.tag) { $selected.tag } else { "" }
}

function Refresh-DeviceList {
  param(
    [System.Windows.Forms.ListView]$DeviceListView,
    [System.Windows.Forms.TextBox]$PhoneIpBox,
    [System.Windows.Forms.TextBox]$PortBox,
    [System.Windows.Forms.TextBox]$PairPortBox,
    [System.Windows.Forms.TextBox]$TagBox,
    [string]$PreferredDeviceId,
    [string]$PreferredIp
  )

  $savedDevices = Get-SavedDevices | Sort-Object -Property lastSeenAt -Descending
  $DeviceListView.Items.Clear()

  foreach ($device in $savedDevices) {
    $label = if ($device.displayName) { $device.displayName } else { $device.id }
    if ($device.tag) {
      $label = "$label [$($device.tag)]"
    }

    $item = New-Object System.Windows.Forms.ListViewItem($label)
    $item.Tag = $device
    [void]$DeviceListView.Items.Add($item)
  }

  if ($DeviceListView.Items.Count -eq 0) {
    return
  }

  $selectedIndex = 0
  if ($PreferredDeviceId) {
    for ($i = 0; $i -lt $DeviceListView.Items.Count; $i++) {
      if ($DeviceListView.Items[$i].Tag.id -eq $PreferredDeviceId) {
        $selectedIndex = $i
        break
      }
    }
  }
  elseif ($PreferredIp) {
    for ($i = 0; $i -lt $DeviceListView.Items.Count; $i++) {
      if ($DeviceListView.Items[$i].Tag.lastKnownIp -eq $PreferredIp) {
        $selectedIndex = $i
        break
      }
    }
  }

  $DeviceListView.Items[$selectedIndex].Selected = $true
  $DeviceListView.Items[$selectedIndex].Focused = $true
  Update-SelectedDeviceFields -DeviceListView $DeviceListView -PhoneIpBox $PhoneIpBox -PortBox $PortBox -PairPortBox $PairPortBox -TagBox $TagBox
}

function Refresh-LogBox {
  param(
    [System.Windows.Forms.TextBox]$LogBox
  )

  $LogBox.Clear()
  foreach ($line in Get-RecentLogLines) {
    $LogBox.AppendText("$line`r`n")
  }
}

function Set-ButtonState {
  param(
    [System.Windows.Forms.Button]$Button,
    [bool]$Enabled,
    [System.Drawing.Color]$EnabledColor
  )

  $Button.Enabled = $Enabled
  if ($Enabled) {
    $Button.BackColor = $EnabledColor
    $Button.ForeColor = [System.Drawing.Color]::White
  }
  else {
    $Button.BackColor = [System.Drawing.Color]::FromArgb(70, 76, 100)
    $Button.ForeColor = [System.Drawing.Color]::FromArgb(170, 176, 194)
  }
}

function Update-ActionAvailability {
  param(
    [hashtable]$ConnectionState,
    [System.Windows.Forms.ListView]$DeviceListView,
    [System.Windows.Forms.Button]$UsbButton,
    [System.Windows.Forms.Button]$WirelessButton,
    [System.Windows.Forms.Button]$PairButton,
    [System.Windows.Forms.Label]$StatusLabel
  )

  $selected = Get-SelectedDevice -DeviceListView $DeviceListView
  $hasSavedWireless = $false
  if ($selected -and $selected.lastKnownIp) {
    $hasSavedWireless = $true
  }

  Set-ButtonState -Button $UsbButton -Enabled $ConnectionState.usbReady -EnabledColor ([System.Drawing.Color]::FromArgb(233, 84, 171))
  Set-ButtonState -Button $WirelessButton -Enabled ($ConnectionState.usbReady -or $ConnectionState.wirelessReady -or $hasSavedWireless) -EnabledColor ([System.Drawing.Color]::FromArgb(40, 52, 94))
  Set-ButtonState -Button $PairButton -Enabled $true -EnabledColor ([System.Drawing.Color]::FromArgb(40, 52, 94))
  $StatusLabel.Text = $ConnectionState.message
}

function Start-Mirror {
  param(
    [string]$Mode,
    [System.Windows.Forms.ListView]$DeviceListView,
    [System.Windows.Forms.TextBox]$PhoneIpBox,
    [System.Windows.Forms.TextBox]$PortBox,
    [System.Windows.Forms.TextBox]$PairPortBox,
    [System.Windows.Forms.TextBox]$PairCodeBox,
    [System.Windows.Forms.TextBox]$TagBox,
    [System.Windows.Forms.CheckBox]$ScreenOffCheckBox,
    [System.Windows.Forms.ComboBox]$RotateComboBox,
    [System.Windows.Forms.TextBox]$LogBox
  )

  $selectedDevice = Get-SelectedDevice -DeviceListView $DeviceListView
  $savedDeviceId = if ($selectedDevice) { $selectedDevice.id } else { $null }

  $baseArgs = Build-ArgumentList `
    -Mode $Mode `
    -PrepareOnly $false `
    -ScreenOff $ScreenOffCheckBox.Checked `
    -Rotate $RotateComboBox.SelectedItem `
    -PhoneIp $PhoneIpBox.Text.Trim() `
    -Port $PortBox.Text.Trim() `
    -PairPort $PairPortBox.Text.Trim() `
    -PairCode $PairCodeBox.Text.Trim() `
    -SavedDeviceId $savedDeviceId `
    -Tag $TagBox.Text.Trim()

  $prepareArgs = Build-ArgumentList `
    -Mode $Mode `
    -PrepareOnly $true `
    -ScreenOff $ScreenOffCheckBox.Checked `
    -Rotate $RotateComboBox.SelectedItem `
    -PhoneIp $PhoneIpBox.Text.Trim() `
    -Port $PortBox.Text.Trim() `
    -PairPort $PairPortBox.Text.Trim() `
    -PairCode $PairCodeBox.Text.Trim() `
    -SavedDeviceId $savedDeviceId `
    -Tag $TagBox.Text.Trim()

  try {
    & "powershell.exe" @prepareArgs
    Refresh-DeviceList -DeviceListView $DeviceListView -PhoneIpBox $PhoneIpBox -PortBox $PortBox -PairPortBox $PairPortBox -TagBox $TagBox -PreferredDeviceId $savedDeviceId -PreferredIp $PhoneIpBox.Text.Trim()
    Refresh-LogBox -LogBox $LogBox
    Start-Process -FilePath "powershell.exe" -ArgumentList (Convert-ArgumentListToString -Arguments $baseArgs) -WorkingDirectory $PSScriptRoot -WindowStyle Minimized | Out-Null
  }
  catch {
    Add-Log -LogBox $LogBox -Message "Mirror failed to launch."
  }
}

function New-CardPanel {
  param(
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )

  $panel = New-Object System.Windows.Forms.Panel
  $panel.Location = New-Object System.Drawing.Point($X, $Y)
  $panel.Size = New-Object System.Drawing.Size($Width, $Height)
  $panel.BackColor = [System.Drawing.Color]::FromArgb(40, 52, 94)
  return $panel
}

function New-TitleLabel {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width
  )

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
  $label.ForeColor = [System.Drawing.Color]::White
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($Width, 26)
  return $label
}

function New-SoftLabel {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height = 22
  )

  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $label.ForeColor = [System.Drawing.Color]::FromArgb(188, 196, 226)
  $label.Location = New-Object System.Drawing.Point($X, $Y)
  $label.Size = New-Object System.Drawing.Size($Width, $Height)
  return $label
}

function Style-TextBox {
  param(
    [System.Windows.Forms.TextBox]$TextBox
  )

  $TextBox.BorderStyle = "FixedSingle"
  $TextBox.BackColor = [System.Drawing.Color]::FromArgb(30, 42, 80)
  $TextBox.ForeColor = [System.Drawing.Color]::White
  $TextBox.Font = New-Object System.Drawing.Font("Segoe UI", 9)
}

function Style-ComboBox {
  param(
    [System.Windows.Forms.ComboBox]$ComboBox
  )

  $ComboBox.BackColor = [System.Drawing.Color]::FromArgb(30, 42, 80)
  $ComboBox.ForeColor = [System.Drawing.Color]::White
  $ComboBox.FlatStyle = "Flat"
  $ComboBox.Font = New-Object System.Drawing.Font("Segoe UI", 9)
}

function Style-ListView {
  param(
    [System.Windows.Forms.ListView]$ListView
  )

  $ListView.BackColor = [System.Drawing.Color]::FromArgb(30, 42, 80)
  $ListView.ForeColor = [System.Drawing.Color]::White
  $ListView.BorderStyle = "FixedSingle"
  $ListView.Font = New-Object System.Drawing.Font("Segoe UI", 9)
  $ListView.View = "Details"
  $ListView.FullRowSelect = $true
  $ListView.HeaderStyle = "None"
  $ListView.MultiSelect = $false
  [void]$ListView.Columns.Add("Device", 420)
}

function Style-FlatButton {
  param(
    [System.Windows.Forms.Button]$Button,
    [System.Drawing.Color]$BackColor
  )

  $Button.FlatStyle = "Flat"
  $Button.FlatAppearance.BorderSize = 0
  $Button.BackColor = $BackColor
  $Button.ForeColor = [System.Drawing.Color]::White
  $Button.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Phone Mirror"
$form.Size = New-Object System.Drawing.Size(1040, 760)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(27, 36, 70)

$headerPanel = New-Object System.Windows.Forms.Panel
$headerPanel.Location = New-Object System.Drawing.Point(0, 0)
$headerPanel.Size = New-Object System.Drawing.Size(1040, 105)
$headerPanel.Add_Paint({
  $graphics = $_.Graphics
  $rectangle = New-Object System.Drawing.Rectangle(0, 0, $headerPanel.Width, $headerPanel.Height)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rectangle,
    [System.Drawing.Color]::FromArgb(158, 106, 230),
    [System.Drawing.Color]::FromArgb(255, 71, 145),
    0.0
  )
  $graphics.FillRectangle($brush, $rectangle)
  $brush.Dispose()
})
$form.Controls.Add($headerPanel)

$headerTitle = New-Object System.Windows.Forms.Label
$headerTitle.Text = "Phone Mirror"
$headerTitle.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$headerTitle.ForeColor = [System.Drawing.Color]::White
$headerTitle.Location = New-Object System.Drawing.Point(32, 24)
$headerTitle.Size = New-Object System.Drawing.Size(220, 32)
$headerPanel.Controls.Add($headerTitle)

$headerSub = New-Object System.Windows.Forms.Label
$headerSub.Text = "SAVE FIRST, THEN MIRROR"
$headerSub.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
$headerSub.ForeColor = [System.Drawing.Color]::FromArgb(255, 238, 242)
$headerSub.Location = New-Object System.Drawing.Point(34, 56)
$headerSub.Size = New-Object System.Drawing.Size(220, 18)
$headerPanel.Controls.Add($headerSub)

$statusLabel = New-Object System.Windows.Forms.Label
$statusLabel.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$statusLabel.ForeColor = [System.Drawing.Color]::White
$statusLabel.Location = New-Object System.Drawing.Point(700, 38)
$statusLabel.Size = New-Object System.Drawing.Size(300, 24)
$statusLabel.TextAlign = "MiddleRight"
$headerPanel.Controls.Add($statusLabel)

$savedCard = New-CardPanel -X 22 -Y 130 -Width 500 -Height 300
$form.Controls.Add($savedCard)
$savedCard.Controls.Add((New-TitleLabel -Text "Saved Device List" -X 24 -Y 18 -Width 180))
$savedCard.Controls.Add((New-SoftLabel -Text "Connected phone is saved first, shown here, then mirror can start." -X 24 -Y 50 -Width 420 -Height 34))

$deviceListView = New-Object System.Windows.Forms.ListView
$deviceListView.Location = New-Object System.Drawing.Point(24, 92)
$deviceListView.Size = New-Object System.Drawing.Size(446, 120)
Style-ListView -ListView $deviceListView
$savedCard.Controls.Add($deviceListView)

$refreshButton = New-Object System.Windows.Forms.Button
$refreshButton.Text = "Refresh"
$refreshButton.Location = New-Object System.Drawing.Point(24, 226)
$refreshButton.Size = New-Object System.Drawing.Size(100, 30)
Style-FlatButton -Button $refreshButton -BackColor ([System.Drawing.Color]::FromArgb(74, 90, 144))
$savedCard.Controls.Add($refreshButton)

$tagLabel = New-SoftLabel -Text "Optional Tag" -X 150 -Y 226 -Width 100
$savedCard.Controls.Add($tagLabel)

$tagBox = New-Object System.Windows.Forms.TextBox
$tagBox.Location = New-Object System.Drawing.Point(150, 252)
$tagBox.Size = New-Object System.Drawing.Size(160, 24)
Style-TextBox -TextBox $tagBox
$savedCard.Controls.Add($tagBox)

$savedCard.Controls.Add((New-SoftLabel -Text "Phone name is saved automatically. Tag is optional." -X 330 -Y 252 -Width 140 -Height 34))

$optionsCard = New-CardPanel -X 540 -Y 130 -Width 475 -Height 300
$form.Controls.Add($optionsCard)
$optionsCard.Controls.Add((New-TitleLabel -Text "Connection Settings" -X 24 -Y 18 -Width 220))
$optionsCard.Controls.Add((New-SoftLabel -Text "Buttons stay gray until the needed connection is ready." -X 24 -Y 50 -Width 420 -Height 34))

$screenOffCheckBox = New-Object System.Windows.Forms.CheckBox
$screenOffCheckBox.Text = "Turn phone screen off only while connected"
$screenOffCheckBox.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$screenOffCheckBox.ForeColor = [System.Drawing.Color]::White
$screenOffCheckBox.BackColor = [System.Drawing.Color]::Transparent
$screenOffCheckBox.Location = New-Object System.Drawing.Point(24, 96)
$screenOffCheckBox.Size = New-Object System.Drawing.Size(280, 24)
$optionsCard.Controls.Add($screenOffCheckBox)

$rotateLabel = New-SoftLabel -Text "Rotate view" -X 24 -Y 132 -Width 100
$optionsCard.Controls.Add($rotateLabel)

$rotateComboBox = New-Object System.Windows.Forms.ComboBox
$rotateComboBox.DropDownStyle = "DropDownList"
$rotateComboBox.Location = New-Object System.Drawing.Point(24, 158)
$rotateComboBox.Size = New-Object System.Drawing.Size(170, 25)
Style-ComboBox -ComboBox $rotateComboBox
[void]$rotateComboBox.Items.AddRange(@("Normal", "Right", "UpsideDown", "Left"))
$rotateComboBox.SelectedIndex = 0
$optionsCard.Controls.Add($rotateComboBox)

$phoneIpLabel = New-SoftLabel -Text "Phone IP" -X 220 -Y 132 -Width 100
$optionsCard.Controls.Add($phoneIpLabel)

$phoneIpBox = New-Object System.Windows.Forms.TextBox
$phoneIpBox.Location = New-Object System.Drawing.Point(220, 158)
$phoneIpBox.Size = New-Object System.Drawing.Size(220, 24)
Style-TextBox -TextBox $phoneIpBox
$optionsCard.Controls.Add($phoneIpBox)

$portLabel = New-SoftLabel -Text "Wireless port" -X 24 -Y 198 -Width 110
$optionsCard.Controls.Add($portLabel)

$portBox = New-Object System.Windows.Forms.TextBox
$portBox.Text = "5555"
$portBox.Location = New-Object System.Drawing.Point(24, 224)
$portBox.Size = New-Object System.Drawing.Size(170, 24)
Style-TextBox -TextBox $portBox
$optionsCard.Controls.Add($portBox)

$pairPortLabel = New-SoftLabel -Text "Pairing port" -X 220 -Y 198 -Width 110
$optionsCard.Controls.Add($pairPortLabel)

$pairPortBox = New-Object System.Windows.Forms.TextBox
$pairPortBox.Location = New-Object System.Drawing.Point(220, 224)
$pairPortBox.Size = New-Object System.Drawing.Size(100, 24)
Style-TextBox -TextBox $pairPortBox
$optionsCard.Controls.Add($pairPortBox)

$pairCodeLabel = New-SoftLabel -Text "Pairing code" -X 340 -Y 198 -Width 110
$optionsCard.Controls.Add($pairCodeLabel)

$pairCodeBox = New-Object System.Windows.Forms.TextBox
$pairCodeBox.Location = New-Object System.Drawing.Point(340, 224)
$pairCodeBox.Size = New-Object System.Drawing.Size(100, 24)
Style-TextBox -TextBox $pairCodeBox
$optionsCard.Controls.Add($pairCodeBox)

$usbTile = New-CardPanel -X 22 -Y 450 -Width 160 -Height 125
$usbTile.BackColor = [System.Drawing.Color]::FromArgb(233, 84, 171)
$form.Controls.Add($usbTile)
$usbButton = New-Object System.Windows.Forms.Button
$usbButton.Text = "USB Mirror"
$usbButton.Location = New-Object System.Drawing.Point(0, 0)
$usbButton.Size = New-Object System.Drawing.Size(160, 125)
Style-FlatButton -Button $usbButton -BackColor ([System.Drawing.Color]::FromArgb(233, 84, 171))
$usbTile.Controls.Add($usbButton)

$wifiTile = New-CardPanel -X 195 -Y 450 -Width 160 -Height 125
$form.Controls.Add($wifiTile)
$wirelessButton = New-Object System.Windows.Forms.Button
$wirelessButton.Text = "Wi-Fi Mirror"
$wirelessButton.Location = New-Object System.Drawing.Point(0, 0)
$wirelessButton.Size = New-Object System.Drawing.Size(160, 125)
Style-FlatButton -Button $wirelessButton -BackColor ([System.Drawing.Color]::FromArgb(40, 52, 94))
$wifiTile.Controls.Add($wirelessButton)

$pairTile = New-CardPanel -X 368 -Y 450 -Width 160 -Height 125
$form.Controls.Add($pairTile)
$pairButton = New-Object System.Windows.Forms.Button
$pairButton.Text = "Pair Over Wi-Fi"
$pairButton.Location = New-Object System.Drawing.Point(0, 0)
$pairButton.Size = New-Object System.Drawing.Size(160, 125)
Style-FlatButton -Button $pairButton -BackColor ([System.Drawing.Color]::FromArgb(40, 52, 94))
$pairTile.Controls.Add($pairButton)

$notesCard = New-CardPanel -X 548 -Y 450 -Width 220 -Height 125
$form.Controls.Add($notesCard)
$notesCard.Controls.Add((New-TitleLabel -Text "Status" -X 18 -Y 14 -Width 130))
$notesCard.Controls.Add((New-SoftLabel -Text "1. Save device`r`n2. See it in the list`r`n3. Start mirror" -X 18 -Y 46 -Width 180 -Height 50))

$logCard = New-CardPanel -X 785 -Y 450 -Width 230 -Height 250
$form.Controls.Add($logCard)
$logCard.Controls.Add((New-TitleLabel -Text "Recent Log" -X 18 -Y 14 -Width 140))

$clearLogButton = New-Object System.Windows.Forms.Button
$clearLogButton.Text = "Clear Log"
$clearLogButton.Location = New-Object System.Drawing.Point(118, 12)
$clearLogButton.Size = New-Object System.Drawing.Size(90, 28)
Style-FlatButton -Button $clearLogButton -BackColor ([System.Drawing.Color]::FromArgb(74, 90, 144))
$clearLogButton.Font = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Bold)
$logCard.Controls.Add($clearLogButton)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 8.5)
$logBox.Location = New-Object System.Drawing.Point(18, 52)
$logBox.Size = New-Object System.Drawing.Size(190, 180)
$logBox.BorderStyle = "None"
$logBox.BackColor = [System.Drawing.Color]::FromArgb(30, 42, 80)
$logBox.ForeColor = [System.Drawing.Color]::White
$logCard.Controls.Add($logBox)

$deviceListView.Add_SelectedIndexChanged({
  Update-SelectedDeviceFields -DeviceListView $deviceListView -PhoneIpBox $phoneIpBox -PortBox $portBox -PairPortBox $pairPortBox -TagBox $tagBox
  $state = Get-CurrentConnectionState
  Update-ActionAvailability -ConnectionState $state -DeviceListView $deviceListView -UsbButton $usbButton -WirelessButton $wirelessButton -PairButton $pairButton -StatusLabel $statusLabel
})

$refreshButton.Add_Click({
  $state = Get-CurrentConnectionState
  Refresh-DeviceList -DeviceListView $deviceListView -PhoneIpBox $phoneIpBox -PortBox $portBox -PairPortBox $pairPortBox -TagBox $tagBox -PreferredDeviceId $null -PreferredIp $phoneIpBox.Text.Trim()
  Refresh-LogBox -LogBox $logBox
  Update-ActionAvailability -ConnectionState $state -DeviceListView $deviceListView -UsbButton $usbButton -WirelessButton $wirelessButton -PairButton $pairButton -StatusLabel $statusLabel
})

$clearLogButton.Add_Click({
  Clear-LogFile
  Refresh-LogBox -LogBox $logBox
  Add-Log -LogBox $logBox -Message "Log cleared."
})

$usbButton.Add_Click({
  Start-Mirror -Mode "USB" -DeviceListView $deviceListView -PhoneIpBox $phoneIpBox -PortBox $portBox -PairPortBox $pairPortBox -PairCodeBox $pairCodeBox -TagBox $tagBox -ScreenOffCheckBox $screenOffCheckBox -RotateComboBox $rotateComboBox -LogBox $logBox
})

$wirelessButton.Add_Click({
  Start-Mirror -Mode "Wireless" -DeviceListView $deviceListView -PhoneIpBox $phoneIpBox -PortBox $portBox -PairPortBox $pairPortBox -PairCodeBox $pairCodeBox -TagBox $tagBox -ScreenOffCheckBox $screenOffCheckBox -RotateComboBox $rotateComboBox -LogBox $logBox
})

$pairButton.Add_Click({
  if (-not $phoneIpBox.Text.Trim()) {
    [System.Windows.Forms.MessageBox]::Show(
      "Enter the phone IP from the Wireless debugging screen first.",
      "Phone Mirror",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    return
  }

  if (-not $pairPortBox.Text.Trim() -or -not $pairCodeBox.Text.Trim()) {
    [System.Windows.Forms.MessageBox]::Show(
      "Enter the pairing port and pairing code from the phone first.",
      "Phone Mirror",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
    return
  }

  Start-Mirror -Mode "PairWireless" -DeviceListView $deviceListView -PhoneIpBox $phoneIpBox -PortBox $portBox -PairPortBox $pairPortBox -PairCodeBox $pairCodeBox -TagBox $tagBox -ScreenOffCheckBox $screenOffCheckBox -RotateComboBox $rotateComboBox -LogBox $logBox
})

$statusTimer = New-Object System.Windows.Forms.Timer
$statusTimer.Interval = 2500
$statusTimer.Add_Tick({
  $state = Get-CurrentConnectionState
  Update-ActionAvailability -ConnectionState $state -DeviceListView $deviceListView -UsbButton $usbButton -WirelessButton $wirelessButton -PairButton $pairButton -StatusLabel $statusLabel
})

$initialState = Get-CurrentConnectionState
Refresh-DeviceList -DeviceListView $deviceListView -PhoneIpBox $phoneIpBox -PortBox $portBox -PairPortBox $pairPortBox -TagBox $tagBox -PreferredDeviceId $null -PreferredIp $null
Refresh-LogBox -LogBox $logBox
Update-ActionAvailability -ConnectionState $initialState -DeviceListView $deviceListView -UsbButton $usbButton -WirelessButton $wirelessButton -PairButton $pairButton -StatusLabel $statusLabel
$statusTimer.Start()

[void]$form.ShowDialog()
