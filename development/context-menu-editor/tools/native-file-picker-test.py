"""Add a PID/profile-guarded Windows picker worker to the existing native probe.

Only a new headed-hidden browser is supported. The worker never examines UIA's
desktop root and never sends global input or activation messages. Reproducible
worker source, signaling, and reports remain under .backup-scratch/native.
"""
from __future__ import annotations

import argparse
import ctypes
from ctypes import wintypes
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

PACKAGE = Path(__file__).absolute().parents[1]
FIXTURE = PACKAGE / 'tests/native/icon-input-assets/wide-gradient.svg'
POWERSHELL = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'

WORKER = r'''
param([int]$BrowserProcessId,[string]$ExpectedStartFileTime,[string]$Fixture,[string]$Receipt,[string]$StopFile)
$ErrorActionPreference='Stop'
$report=[ordered]@{browserProcessId=$BrowserProcessId;fixture=$Fixture;selected=$false;guard='verified fresh profile, actual Marionette process ID, and live descendant ownership/start times';actions=@();ownedDialogs=@()}
$dialog=$null
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,UIAutomationClientsideProviders
$report.workerRuntime=[ordered]@{powerShell=$PSVersionTable.PSVersion.ToString();uiaAssembly=[System.Windows.Automation.AutomationElement].Assembly.Location}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CMEPickerWindows {
 public delegate bool EnumCallback(IntPtr hwnd, IntPtr context);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumCallback callback,IntPtr context);
 [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent,EnumCallback callback,IntPtr context);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint processId);
 [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent,int controlId);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd,StringBuilder value,int count);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool IsChild(IntPtr parent,IntPtr child);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern IntPtr SendText(IntPtr hwnd,uint message,UIntPtr wParam,string text,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern IntPtr ReadText(IntPtr hwnd,uint message,UIntPtr wParam,StringBuilder text,uint flags,uint timeout,out UIntPtr result);
 [DllImport("user32.dll",EntryPoint="SendMessageTimeoutW",SetLastError=true)]
 public static extern IntPtr SendRaw(IntPtr hwnd,uint message,UIntPtr wParam,IntPtr lParam,uint flags,uint timeout,out UIntPtr result);
}
'@
function Refresh-OwnedProcesses {
 $process=Get-Process -Id $BrowserProcessId -ErrorAction Stop
 if($process.StartTime.ToFileTimeUtc().ToString() -ne $ExpectedStartFileTime){throw 'Browser process identity changed'}
 if($process.Path -ne 'C:\Program Files\Zen Browser\zen.exe'){throw 'Browser executable identity changed'}
 $script:owned=@{};$script:owned[$BrowserProcessId]=[ordered]@{processId=$BrowserProcessId;parentProcessId=$null;startFileTime=$ExpectedStartFileTime}
 $pending=[System.Collections.Generic.Queue[int]]::new();$pending.Enqueue($BrowserProcessId)
 while($pending.Count){
  $parent=$pending.Dequeue()
  $liveParent=Get-Process -Id $parent -ErrorAction SilentlyContinue
  if($null -eq $liveParent -or $liveParent.StartTime.ToFileTimeUtc().ToString() -ne $script:owned[$parent].startFileTime){continue}
  foreach($child in Get-CimInstance Win32_Process -Filter "ParentProcessId=$parent" -ErrorAction Stop){
   $childId=[int]$child.ProcessId
   if($script:owned.ContainsKey($childId)){continue}
   $liveChild=Get-Process -Id $childId -ErrorAction SilentlyContinue
   if($null -eq $liveChild){continue}
   $created=$liveChild.StartTime.ToFileTimeUtc()
   if($created -lt [long]$ExpectedStartFileTime -or $created -lt [long]$script:owned[$parent].startFileTime){continue}
   if(-not $liveChild.Path -or -not $liveChild.Path.StartsWith('C:\Program Files\Zen Browser\',[System.StringComparison]::OrdinalIgnoreCase)){continue}
   $script:owned[$childId]=[ordered]@{processId=$childId;parentProcessId=$parent;startFileTime=$created.ToString()}
   $pending.Enqueue($childId)
  }
 }
}
function Assert-OwnedWindow([IntPtr]$Window) {
 Refresh-OwnedProcesses
 [uint32]$windowProcess=0
 [void][CMEPickerWindows]::GetWindowThreadProcessId($Window,[ref]$windowProcess)
 if(-not $script:owned.ContainsKey([int]$windowProcess)){throw 'Refused a window outside the verified live browser process tree'}
}
function Find-OwnedDialogs {
 Refresh-OwnedProcesses
 $script:found=[System.Collections.Generic.List[IntPtr]]::new()
 $callback=[CMEPickerWindows+EnumCallback]{param([IntPtr]$window,[IntPtr]$context)
  [uint32]$windowProcess=0
  [void][CMEPickerWindows]::GetWindowThreadProcessId($window,[ref]$windowProcess)
  if($script:owned.ContainsKey([int]$windowProcess)){
   $class=[System.Text.StringBuilder]::new(256);[void][CMEPickerWindows]::GetClassName($window,$class,256)
   if($class.ToString() -eq '#32770'){$script:found.Add($window)}
  }
  return $true
 }
 [void][CMEPickerWindows]::EnumWindows($callback,[IntPtr]::Zero)
 return $script:found.ToArray()
}
function Find-Control($Root,[string]$Type,[string[]]$Ids,[string]$NamePattern) {
 $controlType=[System.Windows.Automation.ControlType]::$Type
 $condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,$controlType)
 $items=$Root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
 foreach($item in $items){
  $info=$item.Current
  if($script:owned.ContainsKey([int]$info.ProcessId) -and $info.IsEnabled -and ($Ids -contains $info.AutomationId -or $info.Name -match $NamePattern)){return $item}
 }
 return $null
}
function Find-NativeChild([IntPtr]$Root,[int]$ControlId,[string]$ClassPattern) {
 $script:nativeChild=[IntPtr]::Zero
 $callback=[CMEPickerWindows+EnumCallback]{param([IntPtr]$window,[IntPtr]$context)
  [uint32]$windowProcess=0;[void][CMEPickerWindows]::GetWindowThreadProcessId($window,[ref]$windowProcess)
  if($script:owned.ContainsKey([int]$windowProcess) -and ($ControlId -lt 0 -or [CMEPickerWindows]::GetDlgCtrlID($window) -eq $ControlId)){
   $class=[System.Text.StringBuilder]::new(256);[void][CMEPickerWindows]::GetClassName($window,$class,256)
   if($class.ToString() -match $ClassPattern){$script:nativeChild=$window;return $false}
  }
  return $true
 }
 [void][CMEPickerWindows]::EnumChildWindows($Root,$callback,[IntPtr]::Zero)
 return $script:nativeChild
}
function Get-NativeClass([IntPtr]$Window) {
 $class=[System.Text.StringBuilder]::new(256);[void][CMEPickerWindows]::GetClassName($Window,$class,256);return $class.ToString()
}
function Assert-PickerHandles {
 Refresh-OwnedProcesses
 if(-not $script:owned.ContainsKey($pickerProcessId) -or $script:owned[$pickerProcessId].startFileTime -ne $pickerStart){throw 'Picker process identity changed before a targeted message'}
 foreach($window in @($handle,$filenameRoot,$textHandle,$openButton)){
  if(-not [CMEPickerWindows]::IsWindow($window)){throw 'Owned picker control no longer exists'}
  [uint32]$windowProcess=0;[void][CMEPickerWindows]::GetWindowThreadProcessId($window,[ref]$windowProcess)
  if($windowProcess -ne $pickerProcessId){throw 'Refused a control outside the exact verified picker process'}
 }
 if((Get-NativeClass $handle) -ne '#32770'){throw 'Picker dialog class changed'}
 if(-not [CMEPickerWindows]::IsChild($handle,$filenameRoot) -or -not [CMEPickerWindows]::IsChild($handle,$openButton)){throw 'Refused a filename/Open handle outside this exact owned dialog'}
 if($textHandle -ne $filenameRoot -and -not [CMEPickerWindows]::IsChild($filenameRoot,$textHandle)){throw 'Filename edit is outside the verified filename control'}
 if([CMEPickerWindows]::GetDlgCtrlID($filenameRoot) -ne 1148 -or (Get-NativeClass $filenameRoot) -notmatch '^(ComboBox|ComboBoxEx32|Edit)$'){throw 'Filename control identity changed'}
 if((Get-NativeClass $textHandle) -notmatch '^(ComboBox|ComboBoxEx32|Edit)$'){throw 'Filename edit class changed'}
 if([CMEPickerWindows]::GetDlgCtrlID($openButton) -ne 1 -or (Get-NativeClass $openButton) -ne 'Button'){throw 'Open button identity changed'}
}
function Invoke-TargetedPickerFallback {
 # These HWNDs are selected afresh by fixed native control ID and class. This
 # route runs only when the real UIA attempt reports an unsupported pattern.
 $filenameRoot=Find-NativeChild $handle 1148 '^(ComboBox|ComboBoxEx32|Edit)$'
 $openButton=Find-NativeChild $handle 1 '^Button$'
 if($filenameRoot -eq [IntPtr]::Zero -or $openButton -eq [IntPtr]::Zero){throw 'Exact native filename/Open controls unavailable for targeted fallback'}
 $textHandle=Find-NativeChild $filenameRoot -1 '^Edit$'
 if($textHandle -eq [IntPtr]::Zero){$textHandle=$filenameRoot}
 [uint32]$nativePickerProcessId=0;[void][CMEPickerWindows]::GetWindowThreadProcessId($handle,[ref]$nativePickerProcessId)
 $pickerProcessId=[int]$nativePickerProcessId;$pickerStart=$script:owned[$pickerProcessId].startFileTime
 Assert-PickerHandles
 $report.win32Fallback=[ordered]@{pointerBits=([IntPtr]::Size*8);messageTimeoutMs=2000;targetedHandlesOnly=$true;
  filenameRoot=[ordered]@{handle=$filenameRoot.ToInt64();controlId=1148;className=(Get-NativeClass $filenameRoot)};
  filenameText=[ordered]@{handle=$textHandle.ToInt64();controlId=[CMEPickerWindows]::GetDlgCtrlID($textHandle);className=(Get-NativeClass $textHandle)};
  openButton=[ordered]@{handle=$openButton.ToInt64();controlId=1;className=(Get-NativeClass $openButton)}}
 [UIntPtr]$messageResult=[UIntPtr]::Zero
 # SMTO_ABORTIFHUNG | SMTO_ERRORONEXIT; neither activation nor global input.
 $sent=[CMEPickerWindows]::SendText($textHandle,0x000C,[UIntPtr]::Zero,$Fixture,0x22,2000,[ref]$messageResult)
 if($sent -eq [IntPtr]::Zero -or $messageResult -eq [UIntPtr]::Zero){throw 'Targeted filename WM_SETTEXT failed or timed out'}
 $report.actions+='owned filename SendMessageTimeoutW(WM_SETTEXT, exact fixture)'
 Assert-PickerHandles
 $buffer=[System.Text.StringBuilder]::new($Fixture.Length+2)
 $read=[CMEPickerWindows]::ReadText($textHandle,0x000D,[UIntPtr]::new([uint64]$buffer.Capacity),$buffer,0x22,2000,[ref]$messageResult)
 $matches=$read -ne [IntPtr]::Zero -and $buffer.ToString() -ceq $Fixture
 $report.win32Fallback.readbackEqualsExactFixture=$matches
 if(-not $matches){throw 'Targeted filename readback did not equal the exact retained fixture'}
 $report.actions+='owned filename WM_GETTEXT readback equals exact fixture'
 Assert-PickerHandles
 # IDOK/BN_CLICKED sent from this verified Open button to this same dialog.
 # The real Windows file dialog performs its ordinary path validation.
 $accepted=[CMEPickerWindows]::SendRaw($handle,0x0111,[UIntPtr]::new([uint32]1),$openButton,0x02,2000,[ref]$messageResult)
 $report.win32Fallback.commandCallReportedSuccess=$accepted -ne [IntPtr]::Zero
 if($accepted -eq [IntPtr]::Zero -and [CMEPickerWindows]::IsWindow($handle)){throw 'Owned dialog WM_COMMAND IDOK failed or timed out'}
 $report.actions+='owned dialog SendMessageTimeoutW(WM_COMMAND IDOK, verified Open button HWND)'
 $report.selectionMethod='guarded HWND WM_SETTEXT / WM_GETTEXT / WM_COMMAND IDOK after unsupported UIA pattern'
}
try {
 if([IntPtr]::Size -ne 8){throw 'Picker worker requires 64-bit HWND signatures'}
 $deadline=[DateTime]::UtcNow.AddSeconds(45)
 while([DateTime]::UtcNow -lt $deadline){
  if(Test-Path -LiteralPath $StopFile){throw 'Probe ended before an owned file picker appeared'}
  foreach($handle in Find-OwnedDialogs){
   Assert-OwnedWindow $handle
   $candidate=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
   if(-not $script:owned.ContainsKey([int]$candidate.Current.ProcessId)){throw 'UIA root process mismatch'}
   $metadata=@();$seen=@{}
   foreach($control in $candidate.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)){
    if($script:owned.ContainsKey([int]$control.Current.ProcessId)){
     $id=$control.Current.AutomationId;$kind=$control.Current.ControlType.ProgrammaticName;$identity=$id+'|'+$kind
     if(-not $seen.ContainsKey($identity)){$seen[$identity]=$true;$metadata+=@{automationId=$id;controlType=$kind}}
    }
   }
   $report.ownedDialogs=@(@{processId=$candidate.Current.ProcessId;className=$candidate.Current.ClassName;controls=$metadata})
   $chain=@();$ancestor=[int]$candidate.Current.ProcessId
   while($true){$entry=$script:owned[$ancestor];$chain+=@($entry);if($ancestor -eq $BrowserProcessId){break};$ancestor=[int]$entry.parentProcessId}
   $report.ownershipChain=$chain
   $file=Find-Control $candidate 'Edit' @('1148','1001') '^File name:?' 
   $open=Find-Control $candidate 'Button' @('1') '^(Open|&Open)$'
   if($null -eq $file){$file=Find-Control $candidate 'ComboBox' @('1148') '^File name:?'}
   if($null -eq $open){$open=Find-Control $candidate 'SplitButton' @('1') '^(Open|&Open)$'}
   if($null -eq $file){
    $fileHandle=Find-NativeChild $handle 1148 '^(ComboBox|ComboBoxEx32|Edit)$'
    if($fileHandle -ne [IntPtr]::Zero){Assert-OwnedWindow $fileHandle;$file=[System.Windows.Automation.AutomationElement]::FromHandle($fileHandle)}
   }
   if($null -eq $open){
    $openHandle=Find-NativeChild $handle 1 '^Button$'
    if($openHandle -ne [IntPtr]::Zero){Assert-OwnedWindow $openHandle;$open=[System.Windows.Automation.AutomationElement]::FromHandle($openHandle)}
   }
   $report.phase='owned dialog inspected'
   $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $Receipt -Encoding utf8
   if($null -ne $file -and $null -ne $open){$dialog=$candidate;break}
  }
  if($null -ne $dialog){break}
  Start-Sleep -Milliseconds 250
 }
 if($null -eq $dialog){throw 'No filename/Open controls found in an owned native dialog within 45 seconds'}
 $report.dialog=[ordered]@{handle=$handle.ToInt64();processId=$dialog.Current.ProcessId;className=$dialog.Current.ClassName}
 $chain=@();$ancestor=[int]$dialog.Current.ProcessId
 while($true){$entry=$script:owned[$ancestor];$chain+=@($entry);if($ancestor -eq $BrowserProcessId){break};$ancestor=[int]$entry.parentProcessId}
 $report.ownershipChain=$chain
 $report.filenameControl=[ordered]@{automationId=$file.Current.AutomationId;controlType=$file.Current.ControlType.ProgrammaticName;processId=$file.Current.ProcessId}
 $report.openControl=[ordered]@{automationId=$open.Current.AutomationId;controlType=$open.Current.ControlType.ProgrammaticName;processId=$open.Current.ProcessId}
 try {
  Assert-OwnedWindow $handle
  $value=$file.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  if($value.Current.IsReadOnly){throw 'Owned filename control is read-only'}
  $value.SetValue($Fixture)
  if($value.Current.Value -ne $Fixture){throw 'Filename ValuePattern readback mismatch'}
  $report.actions+='ValuePattern.SetValue(expected fixture)'
  Assert-OwnedWindow $handle
  $invoke=$open.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke();$report.actions+='Open.InvokePattern.Invoke()'
  $report.selectionMethod='UIAutomation ValuePattern and InvokePattern'
 } catch {
  if($_.Exception.Message -notmatch 'Unsupported Pattern'){throw}
  $report.unsupportedUIAPattern=$_.Exception.Message
  Invoke-TargetedPickerFallback
 }
 $closeDeadline=[DateTime]::UtcNow.AddSeconds(10)
 while([CMEPickerWindows]::IsWindow($handle) -and [DateTime]::UtcNow -lt $closeDeadline){Start-Sleep -Milliseconds 100}
 $report.dialogClosed= -not [CMEPickerWindows]::IsWindow($handle)
 if(-not $report.dialogClosed){throw 'Owned file picker remained open after Open invocation'}
 $report.selected=$true
} catch {
 $report.error=$_.Exception.Message
 # A failed attempt may cancel only this exact still-owned dialog.
 if($null -ne $dialog){try{Assert-OwnedWindow $handle;$cancel=Find-Control $dialog 'Button' @('2') '^(Cancel|&Cancel)$';if($cancel){$cancel.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();$report.actions+='owned Cancel.InvokePattern.Invoke()'}}catch{$report.cancelError=$_.Exception.Message}}
} finally {
 $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $Receipt -Encoding utf8
}
if(-not $report.selected){exit 1}
'''


def process_start_filetime(process_id):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x1000, False, process_id)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        times = [wintypes.FILETIME() for _ in range(4)]
        if not kernel.GetProcessTimes(handle, *(ctypes.byref(value) for value in times)):
            raise ctypes.WinError(ctypes.get_last_error())
        return (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime
    finally:
        kernel.CloseHandle(handle)


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--output', type=Path, required=True)
    options, remaining = parser.parse_known_args()
    if '--headed-hidden' not in remaining or '--interactive' in remaining or '--diagnostic-vanilla' in remaining:
        raise SystemExit('This actual Windows picker wrapper requires --headed-hidden with the fresh Sine profile')
    if os.name != 'nt' or ctypes.sizeof(ctypes.c_void_p) != 8 or not FIXTURE.is_file() or not POWERSHELL.is_file():
        raise SystemExit('Required retained fixture or Windows PowerShell runtime unavailable')
    output = Path(os.path.abspath(options.output))
    scratch = PACKAGE / '.backup-scratch/native'
    output.relative_to(scratch)
    receipt = output.with_name(output.stem + '.picker-worker.json')
    if output.exists() or receipt.exists():
        raise SystemExit('Refusing to overwrite prior picker evidence')
    token = uuid.uuid4().hex
    worker_source = scratch / ('picker-worker-' + token + '.ps1')
    stop_file = scratch / ('picker-worker-' + token + '.stop')
    scratch.mkdir(parents=True, exist_ok=True)
    worker_source.write_text(WORKER, encoding='utf-8')
    spec = importlib.util.spec_from_file_location('cme_native_sine_probe', PACKAGE / 'tools/native-sine-probe.py')
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    original = probe.Marionette.command
    state = {'worker':None, 'verified':False, 'pending':None}

    def command(client, name, params=None):
        if name == 'WebDriver:ExecuteAsyncScript':
            if not state['verified']:
                raise RuntimeError('Refused picker worker before exact-profile verification')
            if state['worker'] is not None:
                raise RuntimeError('Picker wrapper permits one reviewed async probe')
            process_id = state['pending']['pid']
            created = process_start_filetime(process_id)
            state['worker'] = subprocess.Popen([
                str(POWERSHELL), '-NoLogo', '-NoProfile', '-NonInteractive', '-File', str(worker_source),
                '-BrowserProcessId', str(process_id), '-ExpectedStartFileTime', str(created),
                '-Fixture', str(FIXTURE), '-Receipt', str(receipt), '-StopFile', str(stop_file),
            ], creationflags=subprocess.CREATE_NO_WINDOW, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        result = original(client, name, params)
        if name == 'WebDriver:NewSession':
            capabilities = result['capabilities']
            profile = Path(capabilities['moz:profile'])
            profile.relative_to(scratch)
            if profile.name != 'profile' or not profile.parent.name.startswith('run-') or capabilities.get('moz:headless') is not False:
                raise RuntimeError('Refused nonfresh or headless browser identity')
            state['pending'] = {'pid':int(capabilities['moz:processID']), 'profile':str(profile)}
        elif name == 'WebDriver:ExecuteScript' and state['pending']:
            expected = state['pending']['profile']
            actual = result.get('value', result) if isinstance(result, dict) else result
            if (params.get('args') == [expected] and 'Unexpected profile; refused' in params.get('script', '')
                    and isinstance(actual, str) and actual.lower() == expected.lower()):
                state['verified'] = True
                print(json.dumps({'phase':'verified disposable headed browser','profile':expected,'browserProcessId':state['pending']['pid']}),flush=True)
        return result

    probe.Marionette.command = command
    sys.argv = [str(PACKAGE / 'tools/native-sine-probe.py'), *remaining, '--output', str(output)]
    status = 1
    try:
        status = probe.main()
    finally:
        worker = state['worker']
        if worker is not None:
            if worker.poll() is None:
                stop_file.write_text('own reviewed probe ended', encoding='utf-8')
            try:
                worker_output = worker.communicate(timeout=12)[0].decode('utf-8', 'replace')
            except subprocess.TimeoutExpired:
                worker.terminate()
                worker_output = worker.communicate(timeout=5)[0].decode('utf-8', 'replace')
            automation = json.loads(receipt.read_text(encoding='utf-8-sig')) if receipt.is_file() else {'selected':False, 'error':'No worker receipt'}
            automation.update(workerExitCode=worker.returncode,workerSource=str(worker_source))
            if worker_output.strip():
                automation['workerOutput'] = worker_output[-4000:]
        else:
            automation = {'selected':False, 'error':'Worker not started before guarded browser test ended'}
        if output.is_file():
            report = json.loads(output.read_text(encoding='utf-8'))
            report['nativeFilePickerAutomation'] = automation
            proved = automation.get('selected') is True and report.get('checksPassed') is True and status == 0
            report['actualOSPickerRouteProved'] = proved
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'report':str(output),'actualOSPickerRouteProved':proved,'workerSelected':automation.get('selected')}))
            if not proved:
                status = 1
    return status


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
