$ErrorActionPreference = "Stop"

$ProjectName = "oracle-vps-file-manager"
$Server = "ubuntu@144.24.158.211"
$KeyPath = "D:\Kishore\ssh-key-2026-06-07.key"
$RepoUrl = "https://github.com/kumaark7/oracle-vps-file-manager.git"
$Branch = "main"
$RemoteInstallScript = "/tmp/${ProjectName}-install-on-vps.sh"

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

Write-Host "Sending deploy helper to $Server..."
$scpArgs = @(
  "-i", $KeyPath,
  "deploy/install-on-vps.sh",
  "${Server}:${RemoteInstallScript}"
)
Invoke-Native "scp" $scpArgs

Write-Host "Running GitHub-based install/update on the VPS..."
$sshInstallArgs = @(
  "-i", $KeyPath,
  $Server,
  "sudo APP_NAME='$ProjectName' REPO_URL='$RepoUrl' BRANCH='$Branch' bash '$RemoteInstallScript' && rm -f '$RemoteInstallScript'"
)
Invoke-Native "ssh" $sshInstallArgs

Write-Host ""
Write-Host "Done. Open http://144.24.158.211"
