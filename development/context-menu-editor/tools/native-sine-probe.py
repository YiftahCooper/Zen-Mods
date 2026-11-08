"""Run reviewed chrome probes in a new, disposable headless Zen + pinned Sine.

Never attaches to an existing browser. Each run has a unique profile, a free
Marionette port in 2875-2879, and an exact profile guard before probe code can run. Only the
child process started here is shut down. Upstream source and run output belong
in .backup-scratch/native. Pass --launch after disposable-profile authorization.
"""
from __future__ import annotations

import argparse
import base64
import configparser
import hashlib
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import threading
import uuid

ZEN = Path(r"C:\Program Files\Zen Browser\zen.exe")
PACKAGE = Path(__file__).resolve().parents[1]
# The published runtime folder that build.mjs produces from this development folder.
RUNTIME = PACKAGE.parents[1] / 'context-menu-editor'
# Disposable instances use only this small, fixed Marionette port range.
MARIONETTE_PORTS = range(2875, 2880)


def pick_port():
    """First port in the fixed range that nothing listens on and that can be bound."""
    for port in MARIONETTE_PORTS:
        with socket.socket() as guard:
            if guard.connect_ex(('127.0.0.1', port)) == 0:
                continue
        try:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
        except OSError:
            continue
        return port
    raise RuntimeError('No free Marionette port in 2875-2879; no browser launched')


def local_mods_workspace(explicit=None):
    """Folder that holds the sibling local mod checkouts (for example 'Better Pins')."""
    if explicit:
        return Path(os.path.abspath(explicit))
    if os.environ.get('CME_LOCAL_MODS_WORKSPACE'):
        return Path(os.path.abspath(os.environ['CME_LOCAL_MODS_WORKSPACE']))
    for folder in PACKAGE.parents:
        if (folder / 'Better Pins').is_dir() and (folder / 'Zen-Icons').is_dir():
            return folder
    raise FileNotFoundError('Local mod workspace not found; pass --workspace')
SINE_COMMIT = "fb0bd4ca6af888f10648e126947f7d1f82228433"

def local_mod_sources(workspace):
    """Current local runtime candidates only; never copy profiles or caches."""
    return [
        (workspace/'Better Pins', ('scripts','chrome.css','preferences.json','theme.json')),
        (workspace/'Better Zen Folders Sine Mod/.worktrees/better-zen-folders-implementation', ('scripts','chrome.css','preferences.json','theme.json')),
        (workspace/'Zen-Site-Appearance-Toggle', ('sine/JS','chrome','preferences.json','theme.json')),
        (workspace/'Search-Engine-Select', ('search-engine-select-runtime.uc.js','style.css','preferences.json','theme.json')),
        (workspace/'Zen-Mods/glance-controls', ('copy-url.uc.js','button-order.uc.js','chrome.css','preferences.json','theme.json')),
        (workspace/'zen-even-better-new-tab-button', ('newtab-layout.uc.mjs','userChrome.css','theme.json')),
        (workspace/'Zen-Icons/dist/sine/zen-icons', None),
    ]

def copy_local_mods(mods, installed, workspace, editor_first=True):
    receipts=[]
    for index,(source,paths) in enumerate(local_mod_sources(workspace)):
        manifest=json.loads((source/'theme.json').read_text(encoding='utf-8'))
        mod_id=manifest['id']
        if not mod_id or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-' for c in mod_id):
            raise ValueError('Invalid local mod identity')
        target=mods/mod_id;target.mkdir()
        if paths is None:
            inventory=json.loads((source/'package-inventory.json').read_text(encoding='utf-8'))
            paths=tuple(inventory['files'])
        copied={}
        for name in paths:
            path=source/name
            if '..' in Path(name).parts or Path(name).is_absolute():raise ValueError('Unsafe runtime path')
            files=sorted(path.rglob('*')) if path.is_dir() else [path]
            for file in files:
                if not file.is_file():continue
                relative=file.relative_to(source)
                if file.is_symlink():raise ValueError('Runtime symlinks are unsupported')
                destination=target/relative;destination.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(file,destination)
                digest=hashlib.sha256(file.read_bytes()).hexdigest()
                if hashlib.sha256(destination.read_bytes()).hexdigest()!=digest:raise ValueError('Local mod copy mismatch')
                copied[relative.as_posix()]=digest
        for name in (*manifest.get('scripts',{}), manifest.get('preferences'), manifest.get('style',{}).get('chrome')):
            if name and not (target/name).is_file():raise FileNotFoundError('Missing local runtime: '+mod_id+'/'+name)
        manifest.update(enabled=True,**{'no-updates':True})
        for script in manifest.get('scripts',{}).values():script['loadOrder']=20+index
        installed[mod_id]=manifest
        receipts.append({'id':mod_id,'name':manifest['name'],'version':manifest['version'],'source':str(source),
            'files':len(copied),'copyVerified':True,'runtimeHashes':{name:digest for name,digest in copied.items() if name in manifest.get('scripts',{}) or name=='runtime.sys.mjs'},
            'treeSha256':hashlib.sha256(json.dumps(copied,sort_keys=True).encode()).hexdigest()})
    installed['context-menu-editor']['scripts']['context-menu-editor.uc.js']['loadOrder']=5 if editor_first else 90
    return receipts


class Marionette:
    """Standard-library protocol v3 transport; no selenium or profile discovery."""
    def __init__(self, sock):
        self.sock = sock
        self.sequence = 0
        self.greeting = self.receive()
        if self.greeting.get("marionetteProtocol") != 3:
            raise RuntimeError(f"Unsupported Marionette greeting: {self.greeting!r}")

    def exact(self, count):
        result = bytearray()
        while len(result) < count:
            part = self.sock.recv(count - len(result))
            if not part:
                raise EOFError("Marionette connection closed")
            result.extend(part)
        return bytes(result)

    def receive(self):
        prefix = bytearray()
        while True:
            char = self.exact(1)
            if char == b":":
                break
            if not char.isdigit() or len(prefix) >= 10:
                raise RuntimeError("Malformed Marionette frame length")
            prefix.extend(char)
        count = int(prefix)
        if count > 32 * 1024 * 1024:
            raise RuntimeError("Oversized Marionette frame")
        return json.loads(self.exact(count))

    def command(self, name, params=None):
        self.sequence += 1
        payload = json.dumps([0, self.sequence, name, params or {}], ensure_ascii=False).encode()
        self.sock.sendall(str(len(payload)).encode("ascii") + b":" + payload)
        reply = self.receive()
        if not isinstance(reply, list) or reply[:2] != [1, self.sequence]:
            raise RuntimeError(f"Unexpected Marionette response: {reply!r}")
        if reply[2]:
            raise RuntimeError(f"{name}: {json.dumps(reply[2], ensure_ascii=False)}")
        return reply[3]


def close_client(client, profile_verified):
    """An unverified endpoint is disconnected, never asked to quit."""
    if client is None:
        return
    try:
        if profile_verified:
            client.command('Marionette:Quit', {'flags':['eForceQuit']})
    except Exception:
        pass
    finally:
        client.sock.close()


BOOTSTRAP = r"""
const expectedProfile=arguments[0],sourceURI=arguments[1],done=arguments[arguments.length-1];
(async()=>{
 const actualProfile=Services.dirsvc.get('ProfD',Ci.nsIFile).path.replace(/^\\\\\?\\/,'');
 if(actualProfile.toLowerCase()!==expectedProfile.toLowerCase())throw new Error('Unexpected profile; probe refused');
 const browser=Services.wm.getMostRecentWindow('navigator:browser');
 if(!browser?.gBrowser)throw new Error('No isolated browser window');
 const pause=ms=>new Promise(resolve=>browser.setTimeout(resolve,ms));
 const waitFor=async(test,label,timeout=20000)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=test();if(value)return value;await pause(100);}
  throw new Error('Timed out: '+label);
 };
 const rect=el=>{if(!el)return null;const r=el.getBoundingClientRect();return Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(k=>[k,r[k]]));};
 const manager=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
 const {event:nativeEvent}=ChromeUtils.importESModule('chrome://remote/content/shared/webdriver/Event.sys.mjs');
 const result=await(async ctx=>{ /* REVIEWED_PROBE_BODY */ })({browser,Services,pause,waitFor,rect,manager,nativeEvent,expectedProfile,sourceURI});
 return{ok:true,result};
})().then(done,error=>done({ok:false,error:String(error),stack:error.stack}));
"""


def prepare_profile(profile, source, sine_source, port, vanilla=False, disable_media_sanity=False,
                    define_word_source=None, define_word_first=False, dictionary_fixture=False, with_local_mods=False,
                    workspace=None):
    prefs = {
        'marionette.port': port, 'sine.allow-unsafe-js': True,
        'sine.auto-updates': False, 'sine.engine.auto-update': False,
        'browser.shell.checkDefaultBrowser': False, 'browser.startup.page': 0,
        'browser.startup.homepage': 'about:blank',
        'browser.startup.homepage_override.mstone': 'ignore',
        'browser.aboutwelcome.enabled': False, 'datareporting.policy.dataSubmissionEnabled': False,
        # ZenStartup.mjs uses this separate flag; otherwise its visible first-run
        # overlay hides Configure even when the background settings DOM is ready.
        'zen.welcome-screen.seen': True,
        'toolkit.telemetry.enabled': False, 'app.update.auto': False,
    }
    # Fresh profiles otherwise play Zen's full-window update sweep, whose
    # animation can remain over the tab hit target in a hidden test window.
    # Mark only this installed build seen; leave animation behavior intact.
    app_ini = ZEN.parent / 'application.ini'
    if app_ini.is_file():
        app = configparser.ConfigParser(interpolation=None)
        app.read(app_ini, encoding='utf-8')
        for field, pref in [('BuildID', 'zen.updates.last-build-id'), ('Version', 'zen.updates.last-version')]:
            if app.has_option('App', field):
                prefs[pref] = app.get('App', field)
    if disable_media_sanity:
        # Installed Gecko's SanityTest.sys.mjs confirms this fresh-profile-only
        # switch. It isolates hardware codec startup, unrelated to menu tests.
        prefs['media.sanity-test.disabled'] = True
    if with_local_mods:
        prefs.update({'better-pins.consent-version':1,'better-zen-folders.folder-url-pins-consent-version':1,
            'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url':False})
    (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in prefs.items()), encoding='utf-8')
    if vanilla:
        return
    chrome = profile / 'chrome'
    js = chrome / 'JS'
    shutil.copytree(sine_source / 'src', js)
    shutil.copytree(sine_source / 'locales', js / 'locales')
    engine = json.loads((sine_source / 'engine.json').read_text(encoding='utf-8'))
    engine['version'] = engine['updates'][0]['version']
    (js / 'engine.json').write_text(json.dumps(engine), encoding='utf-8')
    utilities = chrome / 'utils'
    utilities.mkdir()
    (utilities / 'chrome.manifest').write_text(
        'content userscripts ../JS/\ncontent locales ../JS/locales/\ncontent sine ../sine-mods/\n', encoding='utf-8')
    mods = chrome / 'sine-mods'
    candidate = mods / 'context-menu-editor'
    candidate.mkdir(parents=True)
    for name in ('context-menu-editor.uc.js', 'style.css', 'theme.json', 'preferences.json'):
        shutil.copy2(source / name, candidate / name)
    # Assets remain exactly the package's files; no copied caches/source dependency tree.
    shutil.copytree(source / 'assets', candidate / 'assets')
    manifest = json.loads((source / 'theme.json').read_text(encoding='utf-8'))
    manifest.update(enabled=True, **{'no-updates': True})
    installed={manifest['id']:manifest}
    if define_word_source:
        foreign_manifest=json.loads((define_word_source/'theme.json').read_text(encoding='utf-8'))
        if foreign_manifest['id']!='define-word':
            raise ValueError('The optional foreign source is not Define Word')
        foreign=mods/'define-word';foreign.mkdir()
        for name in ('define-word.uc.js','theme.json','preferences.json','style.css'):
            shutil.copy2(define_word_source/name,foreign/name)
        for name in ('src','assets'):
            shutil.copytree(define_word_source/name,foreign/name)
        foreign_manifest.update(enabled=True,**{'no-updates':True})
        manifest['scripts']['context-menu-editor.uc.js']['loadOrder']=20 if define_word_first else 10
        foreign_manifest['scripts']['define-word.uc.js']['loadOrder']=10 if define_word_first else 20
        installed['define-word']=foreign_manifest
    if dictionary_fixture:
        fixture=mods/'cme-native-io';fixture.mkdir()
        body=(PACKAGE/'tests/native/dictionary-fixture.js').read_text(encoding='utf-8')
        (fixture/'fixture.uc.js').write_text(body.replace('/* EXPECTED_PROFILE */',json.dumps(str(profile))),encoding='utf-8')
        installed['cme-native-io']={'id':'cme-native-io','name':'Menu discovery fixture','version':'1',
            'enabled':True,'no-updates':True,'supportsUnload':False,
            'scripts':{'fixture.uc.js':{'include':['chrome://browser/content/browser.xhtml'],'loadOrder':1}}}
    receipts=copy_local_mods(mods,installed,local_mods_workspace(workspace),not define_word_first) if with_local_mods else []
    (mods / 'mods.json').write_text(json.dumps(installed), encoding='utf-8')
    styles='\n'.join('@import url("chrome://sine/content/'+mod['id']+'/'+mod['style']['chrome']+'");' for mod in installed.values() if mod.get('style',{}).get('chrome'))
    (mods / 'chrome.css').write_text(styles, encoding='utf-8')
    (mods / 'content.css').write_text('', encoding='utf-8')
    return receipts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=RUNTIME, help='Runtime folder to install (default: the built context-menu-editor/)')
    parser.add_argument('--workspace', type=Path, help='Folder holding the local mod checkouts used by --with-local-mods')
    parser.add_argument('--define-word-source', type=Path, help='Define Word runtime folder (default: define-word/ next to the runtime)')
    parser.add_argument('--sine-source', type=Path)
    parser.add_argument('--script', required=True, type=Path, help='Reviewed async function body receiving ctx')
    parser.add_argument('--output', type=Path, help='New report path; default inside unique scratch run')
    parser.add_argument('--screenshot', type=Path, help='Optional new PNG path for native browser capture')
    parser.add_argument('--launch', action='store_true')
    parser.add_argument('--diagnostic-vanilla', action='store_true', help='Fresh profile without Sine, to isolate startup failures')
    parser.add_argument('--headed-hidden', action='store_true', help='Use a hidden startup window when headless startup fails')
    parser.add_argument('--interactive', action='store_true', help='Show a disposable browser and leave it open for hands-on testing')
    parser.add_argument('--with-define-word', action='store_true', help='Also load the unchanged sibling Define Word candidate')
    parser.add_argument('--define-word-first', action='store_true', help='Load Define Word before the editor in the disposable profile')
    parser.add_argument('--with-local-mods', action='store_true', help='Also test the current seven local runtime candidates, copied byte-for-byte')
    parser.add_argument('--dictionary-fixture', action='store_true', help='Use a local dictionary response fixture before Define Word loads')
    parser.add_argument('--disable-media-sanity', action='store_true', help='Disable Gecko hardware media startup test in this fresh profile only')
    parser.add_argument('--extended-profile-path', action='store_true', help='Use the Windows extended spelling for the same fresh profile path')
    parser.add_argument('--content-page', type=Path, help='Local synthetic fixture page to navigate before chrome probe')
    parser.add_argument('--content-http', action='store_true', help='Serve the given fixture on a fresh loopback HTTP endpoint for real website-context tests')
    parser.add_argument('--select-text', help='Exact fixture paragraph text to select')
    parser.add_argument('--open-content-menu', action='store_true', help='Open the real page menu at the selected fixture paragraph')
    args = parser.parse_args()
    if not args.launch:
        parser.error('Pass --launch after authorization to run disposable Zen tests')
    if args.interactive and args.headed_hidden:
        parser.error('Choose either interactive or hidden headed mode')
    if args.dictionary_fixture and not args.with_define_word:
        parser.error('The dictionary fixture requires --with-define-word')
    if args.content_http and not args.content_page:parser.error('--content-http requires --content-page')
    # Windows' final-path canonicalization can fail on a readable checkout when
    # an ancestor denies directory traversal metadata. Use normalized absolute
    # paths and explicit existence checks; no destructive operation uses them.
    source = Path(os.path.abspath(args.source))
    scratch = PACKAGE / '.backup-scratch' / 'native'
    sine_source = Path(os.path.abspath(args.sine_source or scratch / 'upstream' / ('Sine-' + SINE_COMMIT)))
    script = args.script.read_text(encoding='utf-8')
    for name in ('context-menu-editor.uc.js', 'theme.json', 'preferences.json', 'style.css'):
        if not (source / name).is_file():
            parser.error('Missing package file: '+name)
    if not ZEN.is_file():
        parser.error('Installed Zen executable not found')
    run_dir = scratch / ('run-' + uuid.uuid4().hex)
    profile = run_dir / 'profile'
    profile.mkdir(parents=True, exist_ok=False)
    output = Path(os.path.abspath(args.output)) if args.output else run_dir / 'report.json'
    if output.exists() or (args.screenshot and args.screenshot.exists()):
        parser.error('Refusing to overwrite prior evidence')
    # Select a free port in the fixed range without attaching to anything listening.
    try:
        port = pick_port()
    except RuntimeError as error:
        parser.error(str(error))
    define_word=Path(os.path.abspath(args.define_word_source or source.parent/'define-word')) if args.with_define_word else None
    local_receipts=prepare_profile(profile, source, sine_source, port, args.diagnostic_vanilla, args.disable_media_sanity,
        define_word,args.define_word_first,args.dictionary_fixture,args.with_local_mods,args.workspace)
    headless=not (args.headed_hidden or args.interactive)
    profile_arg='\\\\?\\'+str(profile) if args.extended_profile_path and os.name=='nt' else str(profile)
    argv = [str(ZEN), *(['--headless'] if headless else []), '--no-remote', '--profile', profile_arg,
            '--marionette', '--remote-allow-system-access', 'about:blank']
    report = {'source':str(source), 'profile':str(profile), 'sineCommit':SINE_COMMIT,
        'port':port, 'argv':argv, 'probeSha256':hashlib.sha256(script.encode()).hexdigest(),
        'packageHashes':{name:hashlib.sha256((source/name).read_bytes()).hexdigest()
            for name in ('context-menu-editor.uc.js','style.css','theme.json','preferences.json')},
        'vanillaDiagnostic':args.diagnostic_vanilla,'headless':headless,'interactive':args.interactive,
        'defineWord':None if not define_word else {'source':str(define_word),'first':args.define_word_first,
            'runtimeSha256':hashlib.sha256((define_word/'define-word.uc.js').read_bytes()).hexdigest(),
            'dictionaryFixture':args.dictionary_fixture},
        'mediaSanityDisabled':args.disable_media_sanity,'localMods':local_receipts or [],
        'evidenceScope':'isolated Zen/Gecko; no everyday-profile acceptance'}
    process = client = http_fixture = None
    profile_verified = False
    status = 1
    try:
        with (run_dir / 'browser.log').open('wb') as log:
            # Gecko 159 requires this for Marionette chrome-context access.
            env = dict(os.environ, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS='1')
            if headless:
                env.update(MOZ_HEADLESS='1', MOZ_HEADLESS_WIDTH='1280', MOZ_HEADLESS_HEIGHT='1000')
            else:
                env.pop('MOZ_HEADLESS',None)
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                if not args.interactive:
                    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startupinfo.wShowWindow = subprocess.SW_HIDE
            process = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT, env=env,
                startupinfo=startupinfo, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            report['pid'] = process.pid
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f'Own Zen child exited during startup: {process.returncode}')
                try:
                    sock = socket.create_connection(('127.0.0.1', port), timeout=1)
                    sock.settimeout(100)
                    client = Marionette(sock)
                    break
                except (ConnectionRefusedError, TimeoutError):
                    time.sleep(.2)
            if client is None:
                raise TimeoutError('Own Zen child did not start Marionette')
            report['session'] = client.command('WebDriver:NewSession', {'capabilities':{'alwaysMatch':{}}})
            client.command('Marionette:SetContext', {'value':'chrome'})
            client.command('WebDriver:SetTimeouts', {'script':90000})
            client.command('WebDriver:ExecuteScript', {'script':"const actual=Services.dirsvc.get('ProfD',Ci.nsIFile).path.replace(/^\\\\\\\\\\?\\\\/,'');if(actual.toLowerCase()!==arguments[0].toLowerCase())throw new Error('Unexpected profile; refused');return actual;",'args':[str(profile)]})
            profile_verified = True
            if args.content_page:
                page=Path(os.path.abspath(args.content_page))
                report['fixturePage']={'path':str(page),'sha256':hashlib.sha256(page.read_bytes()).hexdigest()}
                fixture_url=page.as_uri()
                if args.content_http:
                    body=page.read_bytes()
                    class FixtureHandler(http.server.BaseHTTPRequestHandler):
                        def do_GET(self):
                            if self.path not in ('/','/sample-page.html'):
                                self.send_error(404);return
                            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
                        def log_message(self,*_args):pass
                    http_fixture=http.server.ThreadingHTTPServer(('127.0.0.1',0),FixtureHandler)
                    threading.Thread(target=http_fixture.serve_forever,daemon=True).start()
                    fixture_url='http://127.0.0.1:'+str(http_fixture.server_port)+'/sample-page.html'
                    report['fixturePage']['url']=fixture_url
                client.command('WebDriver:ExecuteScript', {'script':"const w=Services.wm.getMostRecentWindow('navigator:browser');w.gBrowser.selectedTab=w.gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});",'args':[]})
                client.command('Marionette:SetContext',{'value':'content'})
                handles=client.command('WebDriver:GetWindowHandles')
                handles=handles.get('value',[]) if isinstance(handles,dict) else handles
                if not handles:
                    raise RuntimeError('No fixture tab handle')
                client.command('WebDriver:SwitchToWindow',{'handle':handles[-1]})
                client.command('WebDriver:Navigate',{'url':fixture_url})
                _dl=time.time()+15
                while time.time()<_dl:
                    _u=client.command('WebDriver:GetCurrentURL');_u=_u.get('value',_u) if isinstance(_u,dict) else _u
                    if _u==fixture_url and client.command('WebDriver:ExecuteScript',{'script':'return document.readyState','args':[]}).get('value')=='complete':break
                    time.sleep(0.25)
                if args.select_text:
                    selected=client.command('WebDriver:ExecuteScript',{'script':"const el=[...document.querySelectorAll('p')].find(p=>p.textContent.trim()===arguments[0]);if(!el)throw new Error('Fixture paragraph not found');el.scrollIntoView({block:'center'});window.focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);const b=el.getBoundingClientRect();return {text:getSelection().toString(),x:Math.round(b.x+20),y:Math.round(b.y+b.height/2)};",'args':[args.select_text]})
                    selected=selected.get('value',selected) if isinstance(selected,dict) else selected
                    report['selection']=selected
                    if args.open_content_menu:
                        client.command('WebDriver:PerformActions',{'actions':[{'type':'pointer','id':'cme-fixture-mouse','parameters':{'pointerType':'mouse'},'actions':[
                            {'type':'pointerMove','duration':0,'origin':'viewport','x':selected['x'],'y':selected['y']},
                            {'type':'pointerDown','button':2},{'type':'pointerUp','button':2}]}]})
                        client.command('WebDriver:ReleaseActions')
                client.command('Marionette:SetContext',{'value':'chrome'})
            bootstrap=BOOTSTRAP.replace("const manager=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;",'const manager=null;') if args.diagnostic_vanilla else BOOTSTRAP
            result = client.command('WebDriver:ExecuteAsyncScript', {'script':bootstrap.replace('/* REVIEWED_PROBE_BODY */',script),
                'args':[str(profile),PACKAGE.as_uri()+'/'], 'newSandbox':True, 'sandbox':'system'})
            report['probe'] = result.get('value',result) if isinstance(result,dict) else result
            status = 0 if report['probe'].get('ok') else 1
            checks = report['probe'].get('result',{}).get('checks',{})
            if checks:
                report['checksPassed'] = all(value is True for value in checks.values())
                if not report['checksPassed']:
                    status = 1
            if args.screenshot and status == 0:
                capture = client.command('WebDriver:TakeScreenshot', {})
                png = capture.get('value',capture) if isinstance(capture,dict) else capture
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                args.screenshot.write_bytes(base64.b64decode(png))
                report['screenshot'] = str(Path(os.path.abspath(args.screenshot)))
            if args.interactive and status==0:
                print('Disposable test browser is ready. Configure is open; the sample page is in the other tab.',flush=True)
                print('This browser uses only: '+str(profile),flush=True)
                print('Close this test browser when finished. Leave this launcher running until then.',flush=True)
                report['manualBrowserReady']=True
                output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                while process.poll() is None:
                    time.sleep(.5)
    except Exception as error:
        status = 1
        report['error'] = f'{type(error).__name__}: {error}'
    finally:
        close_client(client, profile_verified)
        if http_fixture:
            http_fixture.shutdown();http_fixture.server_close()
        if process:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=10)
            report['processExitCode'] = process.returncode
        report['browserLog'] = str(run_dir / 'browser.log')
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'report':str(output),'status':status,'profile':str(profile)}))
    return status


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
