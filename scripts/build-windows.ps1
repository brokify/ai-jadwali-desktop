$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  throw "This release script must run on Windows 10 or Windows 11."
}

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Invoke-CheckedCommand "npm ci" { npm ci }
Invoke-CheckedCommand "release verification" { npm run release:verify }
Invoke-CheckedCommand "application checks" { npm run check }
Invoke-CheckedCommand "dependency audit" { npm audit }
Invoke-CheckedCommand "end-to-end tests" { npm run test:e2e }
Invoke-CheckedCommand "Windows bundle" { npm run bundle:windows }

Write-Host "Windows release artifacts:"
Get-ChildItem "src-tauri\target\release\bundle\nsis" -File
Get-ChildItem "src-tauri\target\release\bundle\msi" -File
