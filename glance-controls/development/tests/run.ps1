param([Parameter(Mandatory)][string]$SineChromePath, [Parameter(Mandatory)][string]$ZenPath, [switch]$HotInstall,
 [ValidateSet('GlancePositionTest.sys.mjs','ButtonOrderTest.sys.mjs','GlanceInUse.sys.mjs')]
 [string]$TestModule='GlancePositionTest.sys.mjs')
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$run = Join-Path $root ('.backup-scratch\native-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$profile = Join-Path $run 'profile'
$chrome = Join-Path $profile 'chrome'
$source = (Resolve-Path -LiteralPath $SineChromePath).Path
New-Item -ItemType Directory -Path "$chrome\sine-mods" -Force | Out-Null
Copy-Item -LiteralPath "$source\JS" -Destination "$chrome\JS" -Recurse
Copy-Item -LiteralPath "$source\utils" -Destination "$chrome\utils" -Recurse
  $entry = Get-Content -LiteralPath "$root\theme.json" -Raw | ConvertFrom-Json
  $id = $entry.id
  New-Item -ItemType Directory -Path "$chrome\sine-mods\$id" | Out-Null
  foreach ($name in @('chrome.css', 'preferences.json', 'theme.json')) {
    Copy-Item -LiteralPath "$root\$name" -Destination "$chrome\sine-mods\$id\$name"
  }
  if (Test-Path -LiteralPath "$root\copy-url.uc.js") {
    Copy-Item -LiteralPath "$root\copy-url.uc.js" -Destination "$chrome\sine-mods\$id\copy-url.uc.js"
  }
  if (Test-Path -LiteralPath "$root\button-order.uc.js") {
    Copy-Item -LiteralPath "$root\button-order.uc.js" -Destination "$chrome\sine-mods\$id\button-order.uc.js"
  }
$entry | Add-Member enabled $true -Force
$entry | Add-Member 'no-updates' $true -Force
$testMods = @{ $id = $entry }
if ($HotInstall) {
  $testMods | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath "$profile\deferred-mods.json"
  $testMods.Remove($id)
}
$testMods | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath "$chrome\sine-mods\mods.json"
Copy-Item -LiteralPath "$PSScriptRoot\$TestModule" -Destination "$chrome\JS\$TestModule"
$main = "$chrome\JS\sine.sys.mjs"
$text = Get-Content -LiteralPath $main -Raw
$hook = 'Sine.init().then(() => ChromeUtils.importESModule("chrome://userscripts/content/' + $TestModule + '").run());'
if (([regex]::Matches($text, 'Sine\.init\(\);')).Count -ne 1) { throw 'Unsupported Sine entrypoint: expected one Sine.init(); hook' }
$text.Replace('Sine.init();', $hook) | Set-Content -LiteralPath $main
@'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("sine.auto-updates", false);
user_pref("sine.engine.auto-update", false);
user_pref("sine.mods.disable-all", false);
user_pref("sine.allow-unsafe-js", true);
user_pref("zen.welcome-screen.seen", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
'@ | Set-Content -LiteralPath "$profile\user.js"
$process = Start-Process -FilePath $ZenPath -ArgumentList @('-headless', '-no-remote', '-new-instance', '-profile', ('"' + $profile + '"'), 'about:blank') -WindowStyle Hidden -RedirectStandardOutput "$run\stdout.log" -RedirectStandardError "$run\stderr.log" -PassThru
try {
  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-Path -LiteralPath "$profile\position-result.json") -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
} finally {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
}
if (-not (Test-Path -LiteralPath "$profile\position-result.json")) { throw "No receipt: $run" }
Copy-Item -LiteralPath "$profile\position-result.json" -Destination "$run\result.json"
$result = Get-Content -LiteralPath "$run\result.json" -Raw | ConvertFrom-Json
[ordered]@{run=$run;passed=$result.passed;checks=$result.checks.Count;failures=@($result.checks | Where-Object { -not $_.passed });error=$result.error} | ConvertTo-Json -Depth 8
if (-not $result.passed) { exit 1 }
