[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProfilePath,
  [string]$PackagePath = (Join-Path $PSScriptRoot '..\dist\sine\zen-icons'),
  [switch]$DryRun,
  [switch]$Rollback,
  [switch]$Recover,
  [string]$BackupPath
)
$ErrorActionPreference = 'Stop'
$modId = 'zen-icons-local'
if ($Recover) { $Rollback = $true }
function Resolve-Directory([string]$Value) {
  $resolved = (Resolve-Path -LiteralPath $Value).Path
  if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { throw "Not a directory: $Value" }
  $ancestor = Get-Item -LiteralPath $resolved -Force
  while ($ancestor) {
    if ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked paths are not supported: $($ancestor.FullName)" }
    $ancestor = $ancestor.Parent
  }
  return $resolved
}
function Assert-Tree([string]$Directory) {
  if ((Get-Item -LiteralPath $Directory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked directory refused: $Directory" }
  foreach ($child in Get-ChildItem -LiteralPath $Directory -Force) {
    if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked entry refused: $($child.FullName)" }
    if ($child.PSIsContainer) { Assert-Tree $child.FullName }
  }
}
function Get-Inventory([string]$Directory) {
  Assert-Tree $Directory
  $files = @{}
  foreach ($file in Get-ChildItem -LiteralPath $Directory -Recurse -File -Force) {
    $relative = [IO.Path]::GetRelativePath($Directory, $file.FullName).Replace('\','/')
    $files[$relative] = @{size=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
  }
  return $files
}
function Assert-Inventory([string]$Directory, $Expected, [switch]$Package) {
  $actual = Get-Inventory $Directory
  if ($Package) { $actual.Remove('package-inventory.json') }
  if ($actual.Count -ne $Expected.Count) { throw 'Inventory file count mismatch' }
  foreach ($key in $Expected.Keys) {
    if (-not $actual.ContainsKey($key) -or $actual[$key].size -ne $Expected[$key].size -or $actual[$key].sha256 -ne $Expected[$key].sha256) { throw "Inventory mismatch: $key" }
  }
}
function Save-Json([string]$Destination, $Value) {
  $pending = "$Destination.pending-$([Guid]::NewGuid().ToString('N'))"
  $Value | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $pending -Encoding utf8
  [IO.File]::Move($pending, $Destination, $true)
}
function Merge-OwnedConfig($Entry, [string[]]$OwnCss) {
  $mods = Get-Content -Raw -LiteralPath $modsJsonPath | ConvertFrom-Json -AsHashtable
  if ($null -eq $Entry) { $mods.Remove($modId) } else { $mods[$modId] = $Entry }
  Save-Json $modsJsonPath $mods
  $lines = @(Get-Content -LiteralPath $aggregateCssPath | Where-Object { $_ -notmatch $ownCssPattern })
  $pending = "$aggregateCssPath.pending-$([Guid]::NewGuid().ToString('N'))"
  @($lines) + @($OwnCss) | Set-Content -LiteralPath $pending -Encoding utf8
  [IO.File]::Move($pending, $aggregateCssPath, $true)
}
$profile = Resolve-Directory $ProfilePath
$modsRoot = Resolve-Directory (Join-Path $profile 'chrome\sine-mods')
$modsJsonPath = Join-Path $modsRoot 'mods.json'
$aggregateCssPath = Join-Path $modsRoot 'chrome.css'
$target = Join-Path $modsRoot $modId
$backupRoot = Join-Path $modsRoot '.zen-icons-backups'
$ownCssPattern = '^\s*@import\s+.*[/\\]zen-icons-local[/\\]chrome\.css["'')\s;]*$'
foreach ($sharedFile in @($modsJsonPath,$aggregateCssPath)) {
  if (-not (Test-Path -LiteralPath $sharedFile -PathType Leaf)) { throw "Missing Sine file: $sharedFile" }
  if ((Get-Item -LiteralPath $sharedFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked configuration refused: $sharedFile" }
}
if (Test-Path -LiteralPath $target) { $null = Resolve-Directory $target; Assert-Tree $target }
if (Test-Path -LiteralPath $backupRoot) { $null = Resolve-Directory $backupRoot }
$selectedBackup = $null
if ($Rollback) {
  if (-not $BackupPath) { throw 'Rollback requires an explicit -BackupPath from a completed deployment.' }
  $selectedBackup = Resolve-Directory $BackupPath
  if ([IO.Path]::GetDirectoryName($selectedBackup) -ne $backupRoot) { throw 'Backup must be a direct child of this profile Zen Icons backup directory.' }
  $metadata = Get-Content -Raw -LiteralPath (Join-Path $selectedBackup 'metadata.json') | ConvertFrom-Json -AsHashtable
  $requiredStatus = if ($Recover) { 'ready' } else { 'complete' }
  if ($metadata.schema -ne 2 -or $metadata.status -ne $requiredStatus -or $metadata.profile -ne $profile) { throw 'Backup is incomplete, legacy, or belongs to another profile.' }
  $source = Join-Path $selectedBackup 'target'
  if ($metadata.hadTarget) { Assert-Inventory $source $metadata.inventory }
} else {
  $source = Resolve-Directory $PackagePath
  $inventory = Get-Content -Raw -LiteralPath (Join-Path $source 'package-inventory.json') | ConvertFrom-Json -AsHashtable
  if ($inventory.schema -ne 1 -or $inventory.modId -ne $modId) { throw 'Unsupported package inventory' }
  foreach ($required in @('theme.json','chrome.css','chrome.manifest','ZenIcons.uc.js','runtime.sys.mjs','ZenEmojisData.min.mjs','modules/src/zen-icons-sine/picker-model.mjs','modules/src/zen-icons-sine/custom-storage.mjs','modules/src/zen-icons-sine/folder-presentation.mjs','lucide/activity.svg')) {
    if (-not $inventory.files.ContainsKey($required)) { throw "Incomplete package: $required" }
  }
  Assert-Inventory $source $inventory.files -Package
  $theme = Get-Content -Raw -LiteralPath (Join-Path $source 'theme.json') | ConvertFrom-Json -AsHashtable
  if ($theme.id -ne $modId) { throw 'Unexpected package mod ID' }
}
if ($DryRun) {
  @{action=if($Rollback){'rollback'}else{'deploy'};profile=$profile;target=$target;writes=$false;backup=$selectedBackup} | ConvertTo-Json -Compress
  exit 0
}
$operationLock = $null
$browserLock = $null
$attempt = $null
$swapped = $false
$movedPrevious = $false
$configStarted = $false
try {
  $operationLock = [IO.File]::Open((Join-Path $modsRoot '.zen-icons-deploy.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  if (Test-Path -LiteralPath $backupRoot) {
    foreach ($savedAttempt in Get-ChildItem -LiteralPath $backupRoot -Directory) {
      $savedMetadata = Join-Path $savedAttempt.FullName 'metadata.json'
      if (-not (Test-Path -LiteralPath $savedMetadata)) { continue }
      $saved = Get-Content -Raw -LiteralPath $savedMetadata | ConvertFrom-Json -AsHashtable
      if ($Recover -and $savedAttempt.FullName -eq $selectedBackup) { continue }
      if ($saved.schema -eq 2 -and $saved.status -notin @('complete','failed-recovered','recovered')) {
        throw "Interrupted deployment retained at $($savedAttempt.FullName); recover this attempt before another deployment. No files have been replaced."
      }
    }
  }
  $parentLock = Join-Path $profile 'parent.lock'
  if (Test-Path -LiteralPath $parentLock) {
    $browserLock = [IO.File]::Open($parentLock,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  }
  $previousMods = Get-Content -Raw -LiteralPath $modsJsonPath | ConvertFrom-Json -AsHashtable
  $previousEntry = $previousMods[$modId]
  $previousCss = @(Get-Content -LiteralPath $aggregateCssPath | Where-Object { $_ -match $ownCssPattern })
  $hadTarget = Test-Path -LiteralPath $target -PathType Container
  $attempt = Join-Path $backupRoot ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $attempt | Out-Null
  $stage = Join-Path $attempt 'candidate'
  $previous = Join-Path $attempt 'replaced-target'
  $receipt = @{schema=2;status='preparing';profile=$profile;hadTarget=$hadTarget;entry=$previousEntry;css=$previousCss;operation=if($Rollback){'rollback'}else{'deploy'};selectedBackup=$selectedBackup}
  Save-Json (Join-Path $attempt 'metadata.json') $receipt
  if ($hadTarget) {
    Copy-Item -LiteralPath $target -Destination (Join-Path $attempt 'target') -Recurse
    $receipt.inventory = Get-Inventory (Join-Path $attempt 'target')
    Assert-Inventory $target $receipt.inventory
  }
  New-Item -ItemType Directory -Path $stage | Out-Null
  if (-not $Rollback -or $metadata.hadTarget) {
    foreach ($child in Get-ChildItem -LiteralPath $source -Force | Where-Object Name -ne 'custom') {
      Copy-Item -LiteralPath $child.FullName -Destination $stage -Recurse
    }
  }
  # Rollback changes code only. Copy CURRENT user files, never their old snapshot.
  $currentCustom = Join-Path $target 'custom'
  if ($Recover -and -not $hadTarget) {
    $currentCustom = Join-Path $selectedBackup 'replaced-target\custom'
    if (-not (Test-Path -LiteralPath $currentCustom)) { $currentCustom = Join-Path $source 'custom' }
    if (Test-Path -LiteralPath $currentCustom) { Assert-Tree $currentCustom }
  }
  if (Test-Path -LiteralPath $currentCustom -PathType Container) { Copy-Item -LiteralPath $currentCustom -Destination (Join-Path $stage 'custom') -Recurse }
  else { New-Item -ItemType Directory -Path (Join-Path $stage 'custom') | Out-Null }
  $candidateInventory = Get-Inventory $stage
  $expectedCode = if ($Rollback) { if($metadata.hadTarget){$metadata.inventory}else{@{}} } else { $packageFiles = @{} + $inventory.files; $packageFiles['package-inventory.json'] = (Get-Inventory $source)['package-inventory.json']; $packageFiles }
  foreach ($key in $expectedCode.Keys | Where-Object { -not $_.StartsWith('custom/') }) {
    if ($candidateInventory[$key].sha256 -ne $expectedCode[$key].sha256) { throw "Candidate copy mismatch: $key" }
  }
  $receipt.candidateInventory = $candidateInventory
  $receipt.status = 'ready'
  Save-Json (Join-Path $attempt 'metadata.json') $receipt
  if ($hadTarget) { Move-Item -LiteralPath $target -Destination $previous; $movedPrevious=$true }
  Move-Item -LiteralPath $stage -Destination $target
  $swapped=$true
  Assert-Inventory $target $candidateInventory
  $configStarted=$true
  if ($Rollback) { Merge-OwnedConfig $metadata.entry $metadata.css }
  else {
    $theme.enabled=$true; $theme.origin='local'; $theme['no-updates']=$true
    $cssUri=[Uri]::new((Join-Path $target 'chrome.css')).AbsoluteUri
    Merge-OwnedConfig $theme @(('@import "{0}";' -f $cssUri))
  }
  $receipt.status='complete'
  Save-Json (Join-Path $attempt 'metadata.json') $receipt
  if ($Recover) { $metadata.status='recovered'; $metadata.recoveredBy=$attempt; Save-Json (Join-Path $selectedBackup 'metadata.json') $metadata }
  @{action=if($Rollback){'rollback'}else{'deploy'};backup=$attempt;restoredFrom=$selectedBackup;target=$target;customDirectory=(Join-Path $profile 'zen-icon-packs');legacyCustomDirectory=(Join-Path $target 'custom');writes=$true} | ConvertTo-Json -Compress
} catch {
  $failure=$_
  if ($swapped) { Move-Item -LiteralPath $target -Destination (Join-Path $attempt 'failed-candidate') }
  if ($movedPrevious) { Move-Item -LiteralPath $previous -Destination $target }
  if ($configStarted) { Merge-OwnedConfig $previousEntry $previousCss }
  if ($attempt) { $receipt.status='failed-recovered'; $receipt.error=$failure.Exception.Message; Save-Json (Join-Path $attempt 'metadata.json') $receipt }
  throw $failure
} finally {
  if ($browserLock) { $browserLock.Dispose() }
  if ($operationLock) { $operationLock.Dispose() }
}
