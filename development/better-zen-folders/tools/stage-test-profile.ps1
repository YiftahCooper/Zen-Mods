param([string]$ProfilePath)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$ProfilePath) { $ProfilePath = Join-Path $projectRoot '.test-profile-v2' }
$profile = [IO.Path]::GetFullPath($ProfilePath)
$testRoot = Join-Path $projectRoot 'artifacts/staging-tests'
if ($profile -ne (Join-Path $projectRoot '.test-profile-v2') -and
    !$profile.StartsWith($testRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Only the existing disposable profile or isolated staging fixtures are permitted.'
}
function Assert-Safe([string]$Path) {
  $absolute = [IO.Path]::GetFullPath($Path)
  if (!$absolute.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path outside project: $absolute"
  }
  $ancestor = $absolute
  while ($ancestor -and $ancestor -ne $projectRoot) {
    if (Test-Path -LiteralPath $ancestor) {
      if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Reparse point refused: $ancestor"
      }
    }
    $ancestor = [IO.Path]::GetDirectoryName($ancestor)
  }
  return $absolute
}
$id = '5b0aa51f-cea7-4de5-8344-3e86e77fb88d'
$files = @('chrome.css','preferences.json','theme.json','scripts/better-zen-folders.uc.mjs')
function Hashes([string]$Directory) {
  $result = [ordered]@{}
  foreach ($file in $files) {
    $path = Assert-Safe (Join-Path $Directory $file)
    $result[$file] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  }
  return $result
}
function Verify([string]$Directory, $Expected) {
  $actual = Hashes $Directory
  $inventory = @(Get-ChildItem -LiteralPath $Directory -Recurse -File -Force)
  if ($inventory.Count -ne $files.Count) { throw "Unexpected installed inventory: $Directory" }
  foreach ($file in $files) {
    if ($actual[$file] -ne $Expected[$file]) { throw "Hash mismatch: $file" }
  }
}
function Copy-Package([string]$From, [string]$To) {
  $null = New-Item -ItemType Directory -Path (Assert-Safe (Join-Path $To 'scripts')) -Force
  foreach ($file in $files) {
    Copy-Item -LiteralPath (Assert-Safe (Join-Path $From $file)) -Destination (Assert-Safe (Join-Path $To $file))
  }
}
$registryPath = Assert-Safe (Join-Path $profile 'chrome/sine-mods/mods.json')
$installed = Assert-Safe (Join-Path $profile "chrome/sine-mods/$id")
$lock = $null
$oldMoved = $false
$newMoved = $false
$registryChanged = $false
$receipt = $null
try {
  # Zen keeps this handle incompatible with an exclusive open while running.
  $lock = [IO.File]::Open((Assert-Safe (Join-Path $profile 'parent.lock')), 'Open', 'ReadWrite', 'None')
  $before = Hashes $installed
  Verify $installed $before
  $source = Hashes $projectRoot
  $theme = Get-Content -LiteralPath (Join-Path $projectRoot 'theme.json') -Raw | ConvertFrom-Json -AsHashtable
  if ($theme.id -ne $id -or $theme.preferences -ne 'preferences.json') { throw 'Incompatible candidate metadata' }
  $registryBeforeHash = (Get-FileHash -LiteralPath $registryPath).Hash
  $registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json -AsHashtable
  if (!$registry.Contains($id)) { throw 'BZF is not registered in this profile' }
  $entryBefore = $registry[$id] | ConvertTo-Json -Depth 100 -Compress
  foreach ($key in $theme.Keys) { $registry[$id][$key] = $theme[$key] }
  $registryText = $registry | ConvertTo-Json -Depth 100
  $releaseId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '-v' + $theme.version + '-round2-' + [guid]::NewGuid().ToString('N').Substring(0,8)
  $release = Assert-Safe (Join-Path $projectRoot "artifacts/releases/$releaseId")
  $package = Join-Path $release 'package'
  $stage = Assert-Safe (Join-Path $profile ".better-zen-folders-staging/$releaseId")
  $backup = Assert-Safe (Join-Path $profile ".better-zen-folders-rollbacks/$releaseId")
  $registryBackup = Assert-Safe (Join-Path $release 'mods.predecessor.json')
  $registryTemp = Assert-Safe (Join-Path $profile "chrome/sine-mods/mods.json.bzf-$releaseId")
  $receiptPath = Join-Path $release 'receipt.json'
  Copy-Package $projectRoot $package
  Verify $package $source
  Copy-Package $package $stage
  Verify $stage $source
  $null = New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($backup)) -Force
  $receipt = [ordered]@{release=$releaseId;status='prepared';profile=$profile;backup=$backup;package=$package;
    registryBackup=$registryBackup;registryBeforeHash=$registryBeforeHash;entryBefore=$entryBefore;
    predecessor=$before;candidate=$source;activation='not-launched';rollback='not-required'}
  [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 100))
  [IO.File]::WriteAllText($registryTemp, $registryText)
  $registryCandidateHash = (Get-FileHash -LiteralPath $registryTemp).Hash
  if ((Get-FileHash -LiteralPath $registryPath).Hash -ne $registryBeforeHash) { throw 'Registry changed during preparation; retry from a fresh read' }
  Verify $installed $before
  Move-Item -LiteralPath $installed -Destination $backup
  $oldMoved = $true
  Move-Item -LiteralPath $stage -Destination $installed
  $newMoved = $true
  [IO.File]::Replace($registryTemp, $registryPath, $registryBackup)
  $registryChanged = $true
  Verify $installed $source
  Verify $backup $before
  if ((Get-FileHash -LiteralPath $registryPath).Hash -ne $registryCandidateHash) { throw 'Installed registry changed unexpectedly' }
  $receipt.status = 'installed-hash-verified'
  $receipt['registryInstalledHash'] = $registryCandidateHash
  $receipt['receiptPath'] = $receiptPath
  [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 100))
  $receipt | ConvertTo-Json -Depth 100 -Compress
} catch {
  $failure = $_
  if ($receipt) {
    $receipt.status = 'failed'
    $receipt['failure'] = $failure.Exception.Message
    try {
      if ($registryChanged) {
        if ((Get-FileHash -LiteralPath $registryPath).Hash -ne $registryCandidateHash) {
          throw 'Concurrent registry change; retained both generations for scoped recovery'
        }
        Copy-Item -LiteralPath $registryBackup -Destination $registryPath -Force
      }
      if ($newMoved) {
        Move-Item -LiteralPath $installed -Destination (Assert-Safe ($stage + '-failed'))
      }
      if ($oldMoved) { Move-Item -LiteralPath $backup -Destination $installed }
      Verify $installed $before
      $receipt.rollback = 'complete'
    } catch {
      $receipt.rollback = 'required'
      $receipt['rollbackFailure'] = $_.Exception.Message
    }
    [IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 100))
  }
  throw $failure
} finally { if ($lock) { $lock.Dispose() } }
