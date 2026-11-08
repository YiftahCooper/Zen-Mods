"""Verify Sine settings across two own headless Zen processes, one fresh profile.

The profile is always created here under package .backup-scratch/native. There
is deliberately no profile/browser argument and no attach/reuse mode; --source
only selects which runtime folder is copied into the new profile.
Only the helper's first preparation copies Sine and the package. Stage two uses
the stopped first process's on-disk profile unchanged except Marionette's port.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import uuid

PACKAGE = Path(os.path.abspath(__file__)).parents[1]
SPEC = importlib.util.spec_from_file_location('cme_restart_probe_support', PACKAGE / 'tools/native-sine-probe.py')
SUPPORT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPPORT)
FILES = ('context-menu-editor.uc.js', 'style.css', 'theme.json', 'preferences.json')
PREF = 'extension.context-menu-editor.settings'
PROFILE_GUARD = "const actual=Services.dirsvc.get('ProfD',Ci.nsIFile).path;if(actual.toLowerCase()!==arguments[0].toLowerCase())throw new Error('Unexpected profile; restart probe refused');return actual;"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def package_hashes(path):
    return {name: sha((path / name).read_bytes()) for name in FILES}


def free_port():
    # The same fixed 2875-2879 range as the probe; never attaches to a listener.
    return SUPPORT.pick_port()


class VerifiedNativeProcess:
    """Hold/wait the profile-verified browser PID, including Zen launcher relaunch.

    Zen's Marionette main PID can differ from subprocess.Popen's launcher PID.
    The handle is acquired only after the exact fresh ProfD guard succeeds, and
    its executable must be the fixed installed Zen executable before cleanup.
    """
    def __init__(self, pid):
        if os.name != 'nt':
            raise RuntimeError('This bounded helper targets the installed Windows Zen')
        self.api = ctypes.WinDLL('kernel32', use_last_error=True)
        self.api.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        self.api.OpenProcess.restype = ctypes.c_void_p
        self.api.QueryFullProcessImageNameW.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_uint32)]
        self.api.QueryFullProcessImageNameW.restype = ctypes.c_int
        self.api.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        self.api.WaitForSingleObject.restype = ctypes.c_uint32
        self.api.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
        self.api.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
        self.api.CloseHandle.argtypes = [ctypes.c_void_p]
        self.handle = self.api.OpenProcess(0x100000 | 0x1000 | 1, False, int(pid))
        if not self.handle:
            raise OSError(ctypes.get_last_error(), 'Cannot hold verified own browser process')
        size = ctypes.c_uint32(32768)
        image = ctypes.create_unicode_buffer(size.value)
        if not self.api.QueryFullProcessImageNameW(self.handle, 0, image, ctypes.byref(size)) or os.path.normcase(image.value) != os.path.normcase(str(SUPPORT.ZEN)):
            self.close()
            raise RuntimeError('Profile-verified process executable did not match fixed Zen')

    def wait(self, milliseconds):
        result = self.api.WaitForSingleObject(self.handle, milliseconds)
        if result not in (0, 258):
            raise OSError(ctypes.get_last_error(), 'Verified browser process wait failed')
        return result == 0

    def exit_code(self):
        result = ctypes.c_uint32()
        if not self.api.GetExitCodeProcess(self.handle, ctypes.byref(result)):
            raise OSError(ctypes.get_last_error(), 'Verified browser exit read failed')
        return result.value

    def terminate(self):
        if not self.api.TerminateProcess(self.handle, 1):
            raise OSError(ctypes.get_last_error(), 'Verified own browser cleanup failed')

    def close(self):
        if self.handle:
            self.api.CloseHandle(self.handle)
            self.handle = None


def run_phase(name, profile, run_dir, port, body, expected_raw=None):
    phase = {'name': name, 'port': port, 'profile': str(profile), 'probeSha256': sha(body.encode()), 'cleanup': {}}
    if expected_raw is not None:
        marker = '/* EXPECTED_SETUP_RAW */null'
        if body.count(marker) != 1:
            raise RuntimeError('Restart verification comparison marker missing or ambiguous')
        body = body.replace(marker, json.dumps(expected_raw, ensure_ascii=False))
    phase['executedProbeSha256'] = sha(body.encode())
    argv = [str(SUPPORT.ZEN), '--headless', '--no-remote', '--profile', str(profile), '--marionette', '--remote-allow-system-access', 'about:blank']
    phase['argv'] = argv
    process = client = native = None
    verified = False
    try:
        with (run_dir / (name + '-browser.log')).open('wb') as log:
            env = dict(os.environ, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS='1', MOZ_HEADLESS='1', MOZ_HEADLESS_WIDTH='1280', MOZ_HEADLESS_HEIGHT='1000')
            startup = subprocess.STARTUPINFO()
            startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startup.wShowWindow = subprocess.SW_HIDE
            process = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT, env=env, startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW)
            phase['launcherPid'] = process.pid
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError('Own Zen launcher exited during startup: ' + str(process.returncode))
                try:
                    sock = socket.create_connection(('127.0.0.1', port), timeout=1)
                    sock.settimeout(100)
                    client = SUPPORT.Marionette(sock)
                    break
                except (ConnectionRefusedError, TimeoutError):
                    time.sleep(.2)
            if client is None:
                raise TimeoutError('Own restart process did not start Marionette')
            session = client.command('WebDriver:NewSession', {'capabilities': {'alwaysMatch': {}}})
            capabilities = session.get('capabilities', session.get('value', {}).get('capabilities', {}))
            phase['environment'] = {key: capabilities.get(key) for key in ('browserName', 'browserVersion', 'platformName', 'moz:buildID', 'moz:headless', 'moz:processID', 'moz:profile')}
            client.command('Marionette:SetContext', {'value': 'chrome'})
            guarded = client.command('WebDriver:ExecuteScript', {'script': PROFILE_GUARD, 'args': [str(profile)]})
            actual = guarded.get('value', guarded) if isinstance(guarded, dict) else guarded
            if not isinstance(actual, str) or os.path.normcase(actual) != os.path.normcase(str(profile)):
                raise RuntimeError('Unexpected returned profile; endpoint will not be quit')
            verified = True
            phase['profileVerified'] = True
            native = VerifiedNativeProcess(capabilities['moz:processID'])
            phase['browserPid'] = capabilities['moz:processID']
            client.command('WebDriver:SetTimeouts', {'script': 90000})
            result = client.command('WebDriver:ExecuteAsyncScript', {'script': SUPPORT.BOOTSTRAP.replace('/* REVIEWED_PROBE_BODY */', body), 'args': [str(profile), PACKAGE.as_uri() + '/'], 'newSandbox': True, 'sandbox': 'system'})
            phase['probe'] = result.get('value', result) if isinstance(result, dict) else result
    except Exception as error:
        phase['error'] = type(error).__name__ + ': ' + str(error)
    finally:
        cleanup = phase['cleanup']
        cleanup['quitRequestedOnlyAfterProfileVerification'] = bool(client and verified)
        try:
            SUPPORT.close_client(client, verified)
        except Exception as error:
            cleanup['quitError'] = type(error).__name__ + ': ' + str(error)
        cleanup['nativeForcedTermination'] = False
        cleanup['launcherForcedTermination'] = False
        try:
            if native:
                if not native.wait(15000):
                    cleanup['nativeForcedTermination'] = True
                    native.terminate()
                    if not native.wait(10000):
                        raise TimeoutError('Verified own browser remained alive after cleanup')
                cleanup['nativeExited'] = True
                cleanup['nativeExitCode'] = native.exit_code()
            else:
                cleanup['nativeExited'] = False
        except Exception as error:
            cleanup['error'] = type(error).__name__ + ': ' + str(error)
        finally:
            if native:
                native.close()
        # A native-handle wait error must not skip cleanup of the subprocess
        # launcher that this helper itself started.
        if process:
            try:
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    cleanup['launcherForcedTermination'] = True
                    process.terminate()
                    process.wait(timeout=10)
                cleanup['launcherExited'] = True
                cleanup['launcherExitCode'] = process.returncode
            except Exception as error:
                cleanup['launcherError'] = type(error).__name__ + ': ' + str(error)
        phase['browserLog'] = str(run_dir / (name + '-browser.log'))
    phase['cleanupPassed'] = cleanup.get('nativeExited') is True and cleanup.get('launcherExited') is True and cleanup.get('nativeExitCode') == 0 and cleanup.get('launcherExitCode') == 0 and not cleanup.get('nativeForcedTermination') and not cleanup.get('launcherForcedTermination')
    return phase


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--scenario', choices=('customization', 'legacy-import'), default='customization',
                        help='Reviewed fixed probe pair (default: customization)')
    parser.add_argument('--output', type=Path, help='New report path inside package .backup-scratch')
    parser.add_argument('--source', type=Path, default=SUPPORT.RUNTIME, help='Runtime folder to install (default: the built context-menu-editor/)')
    args = parser.parse_args()
    if not args.launch:
        parser.error('Pass --launch for the authorized disposable restart test')
    if os.name != 'nt' or not SUPPORT.ZEN.is_file():
        parser.error('Installed Windows Zen executable required')
    scratch = PACKAGE / '.backup-scratch'
    run_dir = scratch / 'native' / ('restart-' + uuid.uuid4().hex)
    profile = run_dir / 'profile'
    output = Path(os.path.abspath(args.output)) if args.output else run_dir / 'report.json'
    if os.path.normcase(os.path.commonpath((str(scratch), str(output)))) != os.path.normcase(str(scratch)):
        parser.error('Restart report must remain inside package .backup-scratch')
    if output.exists():
        parser.error('Refusing to overwrite prior restart evidence')
    sine_source = scratch / 'native/upstream' / ('Sine-' + SUPPORT.SINE_COMMIT)
    runtime = Path(os.path.abspath(args.source))
    probe_prefix = 'legacy-import-' if args.scenario == 'legacy-import' else 'restart-'
    scripts = {name: (PACKAGE / 'tests/native' / (probe_prefix + name + '.js')).read_text(encoding='utf-8') for name in ('setup', 'verify')}
    report = {'scenario': args.scenario, 'source': str(runtime), 'profile': str(profile), 'sineCommit': SUPPORT.SINE_COMMIT, 'headless': True, 'mediaSanityDisabled': True, 'profileCreatedByHelper': True, 'packageHashes': package_hashes(runtime), 'probeHashes': {name: sha(body.encode()) for name, body in scripts.items()}, 'helperSha256': sha(Path(__file__).read_bytes()), 'supportSha256': sha((PACKAGE / 'tools/native-sine-probe.py').read_bytes()), 'phases': [], 'evidenceScope': 'Two distinct own headless Zen processes; one helper-created disposable profile; no everyday profile or clipboard.'}
    checks = {}
    status = 1
    try:
        profile.mkdir(parents=True, exist_ok=False)
        port = free_port()
        SUPPORT.prepare_profile(profile, runtime, sine_source, port, disable_media_sanity=True)
        copied = profile / 'chrome/sine-mods/context-menu-editor'
        checks['profileRuntimeInitiallyMatchesPackage'] = package_hashes(copied) == report['packageHashes']
        setup = run_phase('setup', profile, run_dir, port, scripts['setup'])
        report['phases'].append(setup)
        expected = setup.get('probe', {}).get('result', {}).pop('persistedRaw', None)
        setup_checks = setup.get('probe', {}).get('result', {}).get('checks', {})
        checks.update({'setup:' + key: value for key, value in setup_checks.items()})
        checks['firstProcessFullyExitedBeforeRestart'] = setup['cleanupPassed']
        if not setup.get('probe', {}).get('ok') or not setup_checks or not all(value is True for value in setup_checks.values()) or not setup['cleanupPassed'] or not isinstance(expected, str):
            raise RuntimeError('First process did not complete cleanly; second launch refused')
        report['persistedSettings'] = {'sha256': sha(expected.encode()), 'bytes': len(expected.encode()), 'prefsFileSha256AfterFirstExit': sha((profile / 'prefs.js').read_bytes())}
        # The candidate and Sine profile tree are not copied or prepared again.
        # user.js already belongs exclusively to this helper-created profile.
        port = free_port()
        with (profile / 'user.js').open('a', encoding='utf-8') as prefs:
            prefs.write('\nuser_pref("marionette.port", ' + str(port) + ');\n')
        checks['profileRuntimeUnchangedBeforeSecondProcess'] = package_hashes(copied) == report['packageHashes']
        verify = run_phase('verify', profile, run_dir, port, scripts['verify'], expected)
        report['phases'].append(verify)
        verify_checks = verify.get('probe', {}).get('result', {}).get('checks', {})
        checks.update({'verify:' + key: value for key, value in verify_checks.items()})
        checks['secondProcessExitedCleanly'] = verify['cleanupPassed']
        checks['twoDifferentNativeBrowserProcesses'] = setup.get('browserPid') != verify.get('browserPid') and bool(verify.get('browserPid'))
        checks['twoProcessesUsedSameExclusiveProfile'] = setup.get('environment', {}).get('moz:profile') == verify.get('environment', {}).get('moz:profile') == str(profile)
        checks['profileRuntimeUnchangedAfterBothProcesses'] = package_hashes(copied) == report['packageHashes']
        if not verify.get('probe', {}).get('ok') or not verify_checks:
            raise RuntimeError('Second process probe failed or returned no checks')
        status = 0 if all(value is True for value in checks.values()) else 1
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
        checks['restartProbeCompleted'] = False
    finally:
        report['checksPassed'] = status == 0 and all(value is True for value in checks.values())
        report['processExitCode'] = 0 if report['phases'] and all(phase['cleanupPassed'] for phase in report['phases']) else 1
        report['probe'] = {'ok': status == 0, 'result': {'checks': checks, 'details': {'phaseCount': len(report['phases']), 'persistedSettings': report.get('persistedSettings')}}}
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'report': str(output), 'status': status, 'profile': str(profile)}), flush=True)
    return status


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
