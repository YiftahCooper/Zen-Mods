[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourceChromePath,

  [Parameter(Mandatory = $true)]
  [string]$SampleImagePath
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runId = [Guid]::NewGuid().ToString('N')
$testRoot = Join-Path $projectRoot ".backup-scratch\zen-icons-live-$runId"
$evidenceRoot = Join-Path $projectRoot "artifacts\live-tests\$runId"
$profile = Join-Path $testRoot 'profile'
$chrome = Join-Path $profile 'chrome'
$modsRoot = Join-Path $chrome 'sine-mods'
$target = Join-Path $modsRoot 'zen-icons-local'
$receipt = Join-Path $profile 'zen-icons-live-test.json'
$durableReceipt = Join-Path $evidenceRoot 'zen-icons-live-test.json'
$stdoutLog = Join-Path $evidenceRoot 'zen-stdout.log'
$stderrLog = Join-Path $evidenceRoot 'zen-stderr.log'
New-Item -ItemType Directory -Path (Split-Path $evidenceRoot) -Force | Out-Null
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$process = $null
$result = $null
$failure = $null
$evidenceError = $null
$receiptPreserved = $false
try {
  if (Test-Path -LiteralPath $testRoot) { throw "Scratch destination already exists: $testRoot" }
  $sourceChrome = (Resolve-Path -LiteralPath $SourceChromePath).Path
  $sampleImage = (Resolve-Path -LiteralPath $SampleImagePath).Path
New-Item -ItemType Directory -Path $chrome -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceChrome 'JS') -Destination (Join-Path $chrome 'JS') -Recurse
Copy-Item -LiteralPath (Join-Path $sourceChrome 'utils') -Destination (Join-Path $chrome 'utils') -Recurse
New-Item -ItemType Directory -Path $modsRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'dist\sine\zen-icons') -Destination $target -Recurse

$sampleTarget = Join-Path $target 'custom\My Icons\Sports'
New-Item -ItemType Directory -Path $sampleTarget -Force | Out-Null
Copy-Item -LiteralPath $sampleImage -Destination (Join-Path $sampleTarget 'sports-wide.png')

$theme = Get-Content -Raw -LiteralPath (Join-Path $target 'theme.json') | ConvertFrom-Json
$theme | Add-Member -NotePropertyName enabled -NotePropertyValue $true -Force
$theme | Add-Member -NotePropertyName origin -NotePropertyValue 'local' -Force
@{ 'zen-icons-local' = $theme } |
  ConvertTo-Json -Compress -Depth 20 |
  Set-Content -LiteralPath (Join-Path $modsRoot 'mods.json') -Encoding utf8
$cssUri = [Uri]::new((Join-Path $target 'chrome.css')).AbsoluteUri
"@import `"$cssUri`";" | Set-Content -LiteralPath (Join-Path $modsRoot 'chrome.css') -Encoding utf8
'' | Set-Content -LiteralPath (Join-Path $modsRoot 'content.css') -Encoding utf8

Copy-Item -LiteralPath (Join-Path $projectRoot 'tests\live\ZenIconsLiveTest.sys.mjs') -Destination (Join-Path $chrome 'JS\ZenIconsLiveTest.sys.mjs')
$sinePath = Join-Path $chrome 'JS\sine.sys.mjs'
$sine = Get-Content -Raw -LiteralPath $sinePath
$hook = 'Sine.init().then(() => ChromeUtils.importESModule("chrome://userscripts/content/ZenIconsLiveTest.sys.mjs").run());'
if (-not $sine.Contains('Sine.init();')) {
  throw 'The Sine initialization hook was not found.'
}
$sine.Replace('Sine.init();', $hook) | Set-Content -LiteralPath $sinePath -Encoding utf8

@'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("sine.allow-unsafe-js", true);
user_pref("sine.mods.disable-all", false);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
'@ | Set-Content -LiteralPath (Join-Path $profile 'user.js') -Encoding utf8

$process = Start-Process -FilePath 'C:\Program Files\Zen Browser\zen.exe' -ArgumentList @(
  '-headless',
  '-no-remote',
  '-new-instance',
  '-profile',
  $profile,
  'about:blank'
) -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru

$deadline = (Get-Date).AddSeconds(45)
try {
  while (-not (Test-Path -LiteralPath $receipt) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
  }
} finally {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    $process.WaitForExit(5000) | Out-Null
  }
}

if (-not (Test-Path -LiteralPath $receipt)) {
  $stderr = if (Test-Path -LiteralPath $stderrLog) {
    Get-Content -Raw -LiteralPath $stderrLog
  } else {
    ''
  }
  throw "Disposable Zen did not produce a receipt. Test profile: $profile`nZen stderr: $stderr"
}

} catch {
  $failure = $_
} finally {
  # Keep receipts (including malformed ones) outside the disposable profile.
  try {
    if (Test-Path -LiteralPath $receipt) {
      Copy-Item -LiteralPath $receipt -Destination $durableReceipt
      $receiptPreserved = $true
    }
  } catch {
    $evidenceError = $_.Exception.Message
  }
  if ($receiptPreserved -and $null -eq $failure) {
    try { $result = Get-Content -Raw -LiteralPath $durableReceipt | ConvertFrom-Json }
    catch { $failure = $_ }
  }
  $summary = [ordered]@{
    runId = $runId
    status = $(if ($failure -or $evidenceError) { 'error' } elseif ($result) { $result.result } else { 'no-receipt' })
    error = $(if ($failure) { $failure.Exception.Message } else { $null })
    evidenceError = $evidenceError
    profile = $profile
    receipt = $(if ($receiptPreserved) { $durableReceipt } else { $null })
    stdoutLog = $stdoutLog
    stderrLog = $stderrLog
    sourceChromePath = $SourceChromePath
    sampleImagePath = $SampleImagePath
    regeneration = 'Rebuild dist/sine/zen-icons from the retained project source, then rerun this script with the original SourceChromePath and SampleImagePath. Scratch profiles are not retained source.'
  }
  try {
    $summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'run-summary.json') -Encoding utf8
  } catch {
    throw "Could not preserve run summary at $evidenceRoot. Scratch retained at $testRoot. Original failure: $failure. Evidence failure: $evidenceError. Summary failure: $_"
  }
}
if ($evidenceError) { throw "Could not preserve receipt: $evidenceError. Scratch retained at $testRoot. Evidence: $evidenceRoot. Original failure: $failure" }
if ($failure) { throw $failure }
[ordered]@{
  profile = $profile
  receipt = $durableReceipt
  stdoutLog = $stdoutLog
  stderrLog = $stderrLog
  result = $result
} | ConvertTo-Json -Depth 30
