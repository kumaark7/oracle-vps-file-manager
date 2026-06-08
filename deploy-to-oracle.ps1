$ErrorActionPreference = "Stop"

$ProjectName = "oracle-vps-file-manager"
$Server = "ubuntu@144.24.158.211"
$KeyPath = "D:\Kishore\ssh-key-2026-06-07.key"
$RemoteUploadPath = "/home/ubuntu/$ProjectName"

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,

    [Parameter(Mandatory = $true)]
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

Write-Host "Uploading $ProjectName to $Server..."
$sshPrepareArgs = @("-i", $KeyPath, $Server, "rm -rf '$RemoteUploadPath' && mkdir -p '$RemoteUploadPath'")
Invoke-Native "ssh" $sshPrepareArgs

$scpArgs = @(
  "-i", $KeyPath,
  "-r",
  "package.json",
  "package-lock.json",
  "index.html",
  "postcss.config.js",
  "tailwind.config.js",
  "vite.config.js",
  "server.cjs",
  "src",
  "deploy",
  "README.md",
  "${Server}:${RemoteUploadPath}/"
)
Invoke-Native "scp" $scpArgs

Write-Host "Installing on the VPS..."
$sshInstallArgs = @("-i", $KeyPath, $Server, "cd '$RemoteUploadPath' && sudo bash deploy/install-on-vps.sh")
Invoke-Native "ssh" $sshInstallArgs

Write-Host ""
Write-Host "Done. Open http://144.24.158.211"
