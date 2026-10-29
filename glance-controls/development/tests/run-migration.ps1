param([Parameter(Mandatory)][string]$SineChromePath, [Parameter(Mandatory)][string]$ZenPath, [Parameter(Mandatory)][string]$LegacyPackageRoot, [switch]$Live, [switch]$Bridge, [ValidateSet('ButtonOrderTest.sys.mjs','GlancePositionTest.sys.mjs','GlanceInUse.sys.mjs')][string]$RuntimeTest='ButtonOrderTest.sys.mjs', [string]$PackageRoot)
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $LegacyPackageRoot).Path
$modRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$collection=Split-Path $modRoot -Parent
if ($PackageRoot) { $collection=(Resolve-Path -LiteralPath $PackageRoot).Path }
$run=Join-Path $modRoot ('.backup-scratch\migration-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$profile=Join-Path $run 'profile'
$chrome=Join-Path $profile 'chrome'
$source=(Resolve-Path -LiteralPath $SineChromePath).Path
New-Item -ItemType Directory -Path "$chrome\sine-mods" -Force | Out-Null
Copy-Item -LiteralPath "$source\JS" -Destination "$chrome\JS" -Recurse
Copy-Item -LiteralPath "$source\utils" -Destination "$chrome\utils" -Recurse
'{}' | Set-Content "$chrome\sine-mods\mods.json"
Copy-Item "$PSScriptRoot\MigrationTest.sys.mjs","$PSScriptRoot\$RuntimeTest" "$chrome\JS"
Copy-Item "$collection\glance-controls\theme.json" "$profile\new-theme.json"
Copy-Item "$root\theme.json" "$profile\old-theme.json"
if (Test-Path "$collection\theme.json") { Copy-Item "$collection\theme.json" "$profile\catalogue-theme.json" }
@{live=[bool]$Live;bridge=[bool]$Bridge;runtimeTest=$RuntimeTest} | ConvertTo-Json | Set-Content "$profile\migration-config.json"
$package=Join-Path $run 'package'
New-Item -ItemType Directory -Path "$package\Zen-Mods\glance-controls" -Force | Out-Null
foreach($name in 'theme.json','catalogue.css','catalogue-preferences.json') {
 Copy-Item -LiteralPath "$collection\$name" -Destination "$package\Zen-Mods\$name"
}
foreach($name in 'theme.json','chrome.css','preferences.json','copy-url.uc.js','button-order.uc.js','LICENSE','README.md') {
 Copy-Item -LiteralPath "$collection\glance-controls\$name" -Destination "$package\Zen-Mods\glance-controls\$name"
}
Compress-Archive -LiteralPath "$package\Zen-Mods" -DestinationPath "$profile\candidate.zip"
$oldFolder=Join-Path $run 'old-repo'
New-Item -ItemType Directory -Path $oldFolder | Out-Null
foreach ($file in 'theme.json','chrome.css','preferences.json','copy-url.uc.js','button-order.uc.js','LICENSE','README.md') {
  Copy-Item "$root\$file" $oldFolder
}
Compress-Archive -LiteralPath $oldFolder -DestinationPath "$profile\old.zip"
$main="$chrome\JS\sine.sys.mjs"
(Get-Content $main -Raw).Replace('Sine.init();','Sine.init().then(() => ChromeUtils.importESModule("chrome://userscripts/content/MigrationTest.sys.mjs").run());') | Set-Content $main
@'
user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);
user_pref("sine.auto-updates", false);
user_pref("sine.engine.auto-update", false);
user_pref("sine.mods.disable-all", false);
user_pref("sine.allow-unsafe-js", true);
user_pref("zen.welcome-screen.seen", true);
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
'@ | Set-Content "$profile\user.js"
$process=Start-Process -FilePath $ZenPath -ArgumentList @('-headless','-no-remote','-new-instance','-profile',('"' + $profile + '"'),'about:blank') -WindowStyle Hidden -RedirectStandardOutput "$run\stdout.log" -RedirectStandardError "$run\stderr.log" -PassThru
try {
  $deadline=(Get-Date).AddSeconds(55)
  while (-not (Test-Path "$profile\position-result.json") -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 250 }
} finally {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
}
if (-not (Test-Path "$profile\position-result.json")) { throw "No receipt: $run" }
$runtime=Get-Content "$profile\position-result.json" -Raw | ConvertFrom-Json
$migration=Get-Content "$profile\migration-result.json" -Raw | ConvertFrom-Json
@{run=$run;migration=$migration;runtime=$runtime} | ConvertTo-Json -Depth 20 | Set-Content "$run\result.json"
@{run=$run;passed=($runtime.passed -and $migration.passed);migrationChecks=$migration.checks.Count;runtimeChecks=$runtime.checks.Count;errors=@($migration.error,$runtime.error);failures=@($migration.checks + $runtime.checks | Where-Object {-not $_.passed})} | ConvertTo-Json -Depth 8
if (-not ($runtime.passed -and $migration.passed)) { exit 1 }
