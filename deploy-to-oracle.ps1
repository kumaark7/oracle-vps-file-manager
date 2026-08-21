$ErrorActionPreference = "Stop"

$ProjectName = if ($env:OVFM_PROJECT_NAME) { $env:OVFM_PROJECT_NAME } else { "oracle-vps-file-manager" }
$Server = if ($env:OVFM_SERVER) { $env:OVFM_SERVER } else { throw "Set OVFM_SERVER, for example ubuntu@YOUR_SERVER_IP" }
$KeyPath = if ($env:OVFM_KEY_PATH) { $env:OVFM_KEY_PATH } else { throw "Set OVFM_KEY_PATH, for example D:\path\to\your-key.pem" }
$RepoUrl = if ($env:OVFM_REPO_URL) { $env:OVFM_REPO_URL } else { throw "Set OVFM_REPO_URL, for example https://github.com/YOUR_GITHUB_USERNAME/oracle-vps-file-manager.git" }
$Branch = if ($env:OVFM_BRANCH) { $env:OVFM_BRANCH } else { "main" }
$PublicUrl = if ($env:OVFM_PUBLIC_URL) { $env:OVFM_PUBLIC_URL } else { "http://YOUR_SERVER_IP" }
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
  "tr -d '\r' < '$RemoteInstallScript' > '${RemoteInstallScript}.unix' && chmod +x '${RemoteInstallScript}.unix' && sudo APP_NAME='$ProjectName' REPO_URL='$RepoUrl' BRANCH='$Branch' PUBLIC_URL='$PublicUrl' bash '${RemoteInstallScript}.unix' && rm -f '$RemoteInstallScript' '${RemoteInstallScript}.unix'"
)
Invoke-Native "ssh" $sshInstallArgs

Write-Host ""
Write-Host "Done. Open $PublicUrl"
