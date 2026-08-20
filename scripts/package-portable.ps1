param(
  [string]$Version = "1.0.1"
)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$SourceExecutable = Join-Path $ProjectRoot "src-tauri\target\release\ai-jadwali-desktop.exe"
$PortableName = "AI-Jadwali-Desktop-$Version-Portable-Windows-x64"
$OutputRoot = Join-Path $ProjectRoot "dist-portable"
$PortableDirectory = Join-Path $OutputRoot $PortableName
$ArchivePath = Join-Path $OutputRoot "$PortableName.zip"

if (-not (Test-Path $SourceExecutable -PathType Leaf)) {
  throw "Portable source executable was not found: $SourceExecutable"
}

New-Item -ItemType Directory -Path $PortableDirectory -Force | Out-Null
Copy-Item $SourceExecutable (Join-Path $PortableDirectory "AI Jadwali Desktop.exe") -Force
Set-Content (Join-Path $PortableDirectory "portable.mode") "portable" -Encoding utf8
Set-Content (Join-Path $PortableDirectory "README-AR.txt") @(
  "AI Jadwali Desktop $Version - Portable"
  ""
  "شغّل AI Jadwali Desktop.exe مباشرة دون تثبيت."
  "سيُنشئ التطبيق مجلد portable-data بجانب البرنامج لحفظ قواعد المدارس والنسخ الاحتياطية."
  "انقل المجلد كاملًا عند نسخه إلى جهاز آخر، ولا تحذف portable.mode أو portable-data."
  "يتطلب Windows 10 (1803 أو أحدث) أو Windows 11 مع Microsoft Edge WebView2 Runtime."
) -Encoding utf8

Compress-Archive -Path (Join-Path $PortableDirectory "*") -DestinationPath $ArchivePath -CompressionLevel Optimal -Force
Get-Item $ArchivePath
