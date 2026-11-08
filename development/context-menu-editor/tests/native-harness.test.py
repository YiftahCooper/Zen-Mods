"""Endpoint mismatch cleanup is tested without starting a browser."""
from pathlib import Path
import importlib.util
import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout
import io

source=Path(__file__).absolute().parents[1]/'tools/native-sine-probe.py'
spec=importlib.util.spec_from_file_location('native_probe',source)
probe=importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class Socket:
    def __init__(self):self.closed=False
    def close(self):self.closed=True

class Client:
    def __init__(self):self.sock=Socket();self.commands=[]
    def command(self,*args):self.commands.append(args)

class IdentityCleanupTests(unittest.TestCase):
    def test_fresh_profile_marks_installed_build_seen_without_disabling_animations(self):
        root=source.parents[1];scratch=root/'.backup-scratch/native-harness-tests';scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            base=Path(temporary);sine=base/'sine';profile=base/'profile';profile.mkdir()
            (sine/'src').mkdir(parents=True);(sine/'locales').mkdir()
            (sine/'engine.json').write_text(json.dumps({'updates':[{'version':'fixture'}]}))
            (base/'application.ini').write_text('[App]\nVersion=1.23.3b\nBuildID=20261016101044\n')
            with patch.object(probe,'ZEN',base/'zen.exe'):
                probe.prepare_profile(profile,probe.RUNTIME,sine,65500)
            text=(profile/'user.js').read_text(encoding='utf-8')
            self.assertIn('user_pref("zen.updates.last-build-id", "20261016101044");',text)
            self.assertIn('user_pref("zen.updates.last-version", "1.23.3b");',text)
            self.assertNotIn('prefersReducedMotion',text)

    def test_late_transport_failure_cannot_return_success_after_passing_probe(self):
        root=source.parents[1];scratch=root/'.backup-scratch/native-harness-tests';scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            base=Path(temporary).resolve();self.assertTrue(base.is_relative_to(scratch.resolve()))
            for name in ('context-menu-editor.uc.js','theme.json','preferences.json','style.css','fake-zen.exe','probe.js'):(base/name).write_text('{}',encoding='utf-8')
            output=base/'result.json'
            class FakeSocket:
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def bind(self,*args):pass
                def getsockname(self):return ('127.0.0.1',65500)
                def connect_ex(self,*args):return 1
                def settimeout(self,*args):pass
                def close(self):pass
            class FakeClient:
                def __init__(self,*args):self.sock=FakeSocket()
                def command(self,name,params):
                    if name=='WebDriver:TakeScreenshot':raise RuntimeError('native screenshot transport failed')
                    if name=='WebDriver:ExecuteAsyncScript':return {'ok':True,'result':{'checks':{'browserReady':True}}}
                    return {}
            class FakeProcess:
                pid=12345;returncode=None
                def poll(self):return None
                def wait(self,**args):self.returncode=0;return 0
            argv=['native-sine-probe.py','--launch','--source',str(base),'--script',str(base/'probe.js'),'--output',str(output),'--screenshot',str(base/'capture.png')]
            with patch.object(probe.sys,'argv',argv),patch.object(probe,'ZEN',base/'fake-zen.exe'),patch.object(probe,'prepare_profile',return_value=[]),patch.object(probe.socket,'socket',return_value=FakeSocket()),patch.object(probe.socket,'create_connection',return_value=FakeSocket()),patch.object(probe,'Marionette',FakeClient),patch.object(probe.subprocess,'Popen',return_value=FakeProcess()),redirect_stdout(io.StringIO()):
                status=probe.main()
            report=json.loads(output.read_text(encoding='utf-8'))
            self.assertIn('native screenshot transport failed',report['error'])
            self.assertNotEqual(status,0,'a later transport exception must override a previously successful probe')

    def test_suite_refuses_zero_exit_without_a_complete_success_receipt(self):
        suite_spec=importlib.util.spec_from_file_location('native_suite',source.parent/'run-native-tests.py');suite=importlib.util.module_from_spec(suite_spec);suite_spec.loader.exec_module(suite)
        scratch=source.parents[1]/'.backup-scratch/native-harness-tests';scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            base=Path(temporary).resolve();self.assertTrue(base.is_relative_to(scratch.resolve()))
            def incomplete_receipt(command,**kwargs):
                path=Path(command[command.index('--output')+1]);path.write_text(json.dumps({'probe':{'ok':True,'result':{'checks':{}}}}),encoding='utf-8')
                return subprocess.CompletedProcess(command,0)
            with patch.object(suite,'ROOT',base),patch.object(suite.subprocess,'run',side_effect=incomplete_receipt),redirect_stdout(io.StringIO()):status=suite.main()
            summary=json.loads(next((base/'.backup-scratch/native').glob('normal-session-*/result.json')).read_text(encoding='utf-8'))
            self.assertNotEqual(status,0,'a zero subprocess exit alone is not a passing native stage')
            self.assertFalse(summary['allPassed'])
            self.assertEqual(len(summary['checks']),1,'stop at the first invalid receipt')

    def test_optional_foreign_mod_keeps_runtime_bytes_and_explicit_load_order(self):
        root=source.parents[1]
        scratch=root/'.backup-scratch/native-harness-tests'
        scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as temporary:
            base=Path(temporary); sine=base/'sine'; foreign=base/'foreign'
            (sine/'src').mkdir(parents=True);(sine/'locales').mkdir()
            (sine/'engine.json').write_text(json.dumps({'updates':[{'version':'fixture'}]}))
            foreign.mkdir();(foreign/'src').mkdir();(foreign/'assets').mkdir()
            (foreign/'theme.json').write_text(json.dumps({'id':'define-word','scripts':{'define-word.uc.js':{'include':['chrome://browser/content/browser.xhtml']}}}))
            (foreign/'define-word.uc.js').write_text('// original foreign runtime\n')
            (foreign/'style.css').write_text('/* foreign style */')
            (foreign/'preferences.json').write_text('[]')
            for first in (False,True):
                profile=base/('first' if first else 'last');profile.mkdir()
                probe.prepare_profile(profile,probe.RUNTIME,sine,65500,define_word_source=foreign,define_word_first=first)
                mods=profile/'chrome/sine-mods'
                self.assertEqual((mods/'define-word/define-word.uc.js').read_bytes(),(foreign/'define-word.uc.js').read_bytes())
                installed=json.loads((mods/'mods.json').read_text())
                dw=installed['define-word']['scripts']['define-word.uc.js']['loadOrder']
                editor=installed['context-menu-editor']['scripts']['context-menu-editor.uc.js']['loadOrder']
                self.assertEqual(dw<editor,first)
                self.assertTrue(installed['define-word']['no-updates'])

    def test_bootstrap_accepts_same_extended_profile_and_rejects_other_profile(self):
        # Execute the real bootstrap guard in JavaScript, without a browser.
        # The path spelling must not change identity, and a different profile
        # must be refused before any fixture or browser-window operation.
        guard=probe.BOOTSTRAP.split(' const actualProfile=',1)[1].split(' const browser=',1)[0]
        guard=' const actualProfile='+guard
        expected=r'C:\scratch\own-profile'
        actuals=[expected,expected.upper(),'\\\\?\\'+expected,r'C:\scratch\other-profile']
        script='''const guard=new Function('Services','Ci','expectedProfile',process.argv[1]);
const actuals=JSON.parse(process.argv[2]),expected=process.argv[3];
console.log(JSON.stringify(actuals.map(path=>{
 try{guard({dirsvc:{get:()=>({path})}},{nsIFile:{}},expected);return true;}
 catch{return false;}
})));'''
        result=subprocess.run(['node','-e',script,guard,json.dumps(actuals),expected],capture_output=True,text=True,check=True)
        self.assertEqual(json.loads(result.stdout),[True,True,True,False])

    def test_unverified_endpoint_is_not_shutdown(self):
        client=Client();probe.close_client(client,False)
        self.assertEqual(client.commands,[])
        self.assertTrue(client.sock.closed)

    def test_verified_disposable_endpoint_can_shutdown(self):
        client=Client();probe.close_client(client,True)
        self.assertEqual(client.commands,[('Marionette:Quit',{'flags':['eForceQuit']})])
        self.assertTrue(client.sock.closed)

if __name__=='__main__':unittest.main()
