"""Isolated headless Zen popup probe; standard-library Marionette client.

Never attaches to an existing browser. Requires --launch explicitly, creates a
unique scratch profile, and closes only the child process it starts. Use --script
for a UTF-8 JavaScript async-function body receiving `ctx` (see BOOTSTRAP).
Generated profiles/logs are disposable; retain useful JSON reports outside scratch.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import time
import uuid

ZEN = Path(r"C:\Program Files\Zen Browser\zen.exe")
SCRATCH = Path(__file__).resolve().parents[2] / ".backup-scratch" / "dw-native"
PORT = 2831


class Marionette:
    def __init__(self, sock):
        self.sock = sock
        self.sequence = 0
        self.greeting = self.receive()
        if self.greeting.get("marionetteProtocol") != 3:
            raise RuntimeError(f"Unsupported Marionette greeting: {self.greeting!r}")

    def exact(self, count):
        parts = bytearray()
        while len(parts) < count:
            part = self.sock.recv(count - len(parts))
            if not part:
                raise EOFError("Marionette connection closed")
            parts.extend(part)
        return bytes(parts)

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
        payload = json.dumps([0, self.sequence, name, params or {}], ensure_ascii=False).encode("utf-8")
        self.sock.sendall(str(len(payload)).encode("ascii") + b":" + payload)
        reply = self.receive()
        if not isinstance(reply, list) or reply[:2] != [1, self.sequence]:
            raise RuntimeError(f"Unexpected Marionette response: {reply!r}")
        if reply[2]:
            raise RuntimeError(f"{name}: {json.dumps(reply[2], ensure_ascii=False)}")
        return reply[3]


DEFAULT_FIXTURE = r"""
const {popup, snapshot, pause, window: w} = ctx;
const cycles = [];
for (let index = 0; index < 20; index++) {
  popup.render(ctx.fixture);
  popup.show({x:w.mozInnerScreenX+600,y:w.mozInnerScreenY+300,width:80,height:20});
  await pause(150);
  if(index===0){w.document.querySelector('[data-resize-edge="se"]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await pause(100);}
  cycles.push(snapshot('open-'+index));
  popup.close();
  await pause(60);
}
popup.render(ctx.fixture); popup.show(); await pause(150);
const before = snapshot('before-input');
// Gecko-generated trusted mouse input, not OS hardware input. Record whether
// the intended element receives it; lack of delivery is not a passing test.
const header = w.document.querySelector('#define-word-panel .dw-bar strong');
const edge = w.document.querySelector('#define-word-panel [data-resize-edge="se"]');
const drag = await ctx.mouseDrag(header, 45, 25);
const afterDrag = snapshot('after-drag');
const resize = await ctx.mouseDrag(edge, 50, 30);
const afterResize = snapshot('after-resize');
return {cycles, before, drag, afterDrag, resize, afterResize};
"""

BOOTSTRAP = r"""
const sourceUri = arguments[0], fixtureBody = arguments[1], expectedProfile = arguments[2];
const done = arguments[arguments.length - 1];
(async () => {
  const actualProfile=Services.dirsvc.get('ProfD',Ci.nsIFile).path;
  if(actualProfile.toLowerCase()!==expectedProfile.toLowerCase())throw new Error('Unexpected browser profile; probe refused');
  const w = Services.wm.getMostRecentWindow('navigator:browser');
  if (!w?.gBrowser) throw new Error('No isolated browser chrome window');
  const resource = Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
  resource.setSubstitution('dw-test', Services.io.newURI(sourceUri));
  const {createPopup} = ChromeUtils.importESModule('resource://dw-test/src/popup.mjs');
  const style = w.document.createElementNS('http://www.w3.org/1999/xhtml','link');
  style.rel='stylesheet'; style.href='resource://dw-test/style.css';
  w.document.documentElement.append(style);
  const pause = ms => new Promise(resolve => w.setTimeout(resolve, ms));
  await pause(200);
  let popup, savedSize = null;
  const callbacks = {onClose: options => popup.close(options), readSize:()=>savedSize,
    onSizeChange: size => {savedSize=size;}, onSearch:()=>{}, onProviderChange:()=>{}};
  popup = createPopup(w, callbacks);
  const rect = value => value ? Object.fromEntries(['x','y','width','height','top','right','bottom','left'].map(k=>[k,value[k]])) : null;
  const snapshot = label => {
    const panel=w.document.getElementById('define-word-panel');
    const shell=panel.querySelector('.dw-shell'), card=panel.querySelector('.dw-card');
    const screenRect = element => {
      const r=element.getBoundingClientRect();
      return rect(w.windowUtils.toScreenRectInCSSUnits(r.x,r.y,r.width,r.height));
    };
    return {label,state:panel.state,outer:rect(panel.getOuterScreenRect()),
      panel:rect(panel.getBoundingClientRect()),shell:rect(shell.getBoundingClientRect()),
      card:rect(card.getBoundingClientRect()),shellScreen:screenRect(shell),cardScreen:screenRect(card),
      savedSize, viewport:{width:w.innerWidth,height:w.innerHeight,x:w.mozInnerScreenX,y:w.mozInnerScreenY},
      inline:{panel:panel.getAttribute('style'),shell:shell.getAttribute('style')},
      padding:w.getComputedStyle(panel).padding,border:w.getComputedStyle(panel).borderWidth};
  };
  const {event: nativeEvent}=ChromeUtils.importESModule('chrome://remote/content/shared/webdriver/Event.sys.mjs');
  const mouseDrag = async (element,dx,dy) => {
    const panel=w.document.getElementById('define-word-panel');
    const events=[];
    const record=event=>events.push({type:event.type,trusted:event.isTrusted,
      target:event.target.id||event.target.className||event.target.localName,
      edge:event.target.dataset?.resizeEdge||null,x:event.screenX,y:event.screenY});
    for(const type of ['mousedown','mousemove','mouseup','pointerdown','pointermove','pointerup'])panel.addEventListener(type,record,true);
    let error=null,afterDown=null;
    try {
      const r=element.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      await nativeEvent.synthesizeMouseAtPoint(x,y,{type:'mousemove',buttons:0},w);
      await nativeEvent.synthesizeMouseAtPoint(x,y,{type:'mousedown',button:0,buttons:1},w);
      await pause(50);afterDown=snapshot('after-mousedown');
      await nativeEvent.synthesizeMouseAtPoint(x+dx,y+dy,{type:'mousemove',button:0,buttons:1},w);
      await pause(50);
      await nativeEvent.synthesizeMouseAtPoint(x+dx,y+dy,{type:'mouseup',button:0,buttons:0},w);
      await pause(100);
    } catch(problem) {error=String(problem);}
    finally {for(const type of ['mousedown','mousemove','mouseup','pointerdown','pointermove','pointerup'])panel.removeEventListener(type,record,true);}
    return {method:'Gecko Event.synthesizeMouseAtPoint',events,error,afterDown};
  };
  const fixture={term:{original:'computer',language:'en'},providerId:'wiktionary-en',
    providers:[{id:'wiktionary-en',label:'Wiktionary'}],textSize:14,
    outcome:{status:'ok',definition:{language:'en',headword:'computer',
      senses:[{partOfSpeech:'noun',text:'A programmable device that performs calculations.',examples:['A compact test definition.']}],
      attribution:{label:'Synthetic fixture',url:'https://en.wiktionary.org/wiki/computer'},
      sourceUrl:'https://en.wiktionary.org/wiki/computer'}}};
  try {
    const result=await (async ctx => { /* REVIEWED_FIXTURE_BODY */ })({window:w,Services,popup,fixture,snapshot,pause,mouseDrag,nativeEvent,setSavedSize:size=>{savedSize=size;}});
    return {ok:true,result};
  } finally {popup.destroy();style.remove();resource.setSubstitution('dw-test',null);}
})().then(done,error=>done({ok:false,error:String(error),stack:error.stack}));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--script', type=Path, help='Optional async JavaScript function body receiving ctx')
    parser.add_argument('--content-page', type=Path, help='Local fixture page to navigate and select before chrome probe')
    parser.add_argument('--select-text', default='computer', help='Exact fixture paragraph text to select')
    parser.add_argument('--zoom', type=float, default=1.0, help='Isolated selected browser fullZoom before selection')
    parser.add_argument('--launch', action='store_true', help='Explicitly launch a new isolated headless Zen process')
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    output = args.output.resolve()
    for required in ('src/popup.mjs', 'style.css'):
        if not (source / required).is_file():
            parser.error(f'Missing source file: {source / required}')
    if not args.launch:
        parser.error('Prepared only: pass --launch after obtaining isolated-browser authorization')
    if output.exists():
        parser.error('Output already exists; choose a new report path to preserve prior evidence')
    if not ZEN.is_file():
        parser.error(f'Zen executable not found: {ZEN}')
    # Refuse to attach if anything is already listening on the dedicated port.
    with socket.socket() as guard:
        if guard.connect_ex(('127.0.0.1', PORT)) == 0:
            parser.error(f'Port {PORT} is already occupied; no browser launched')
    fixture = args.script.read_text(encoding='utf-8') if args.script else DEFAULT_FIXTURE
    run_dir = SCRATCH.resolve() / ('run-' + uuid.uuid4().hex)
    profile = run_dir / 'profile'
    profile.mkdir(parents=True, exist_ok=False)
    preferences = {'marionette.port': PORT, 'browser.shell.checkDefaultBrowser': False,
        'browser.startup.page': 0, 'browser.startup.homepage': 'about:blank',
        'browser.startup.homepage_override.mstone': 'ignore', 'browser.aboutwelcome.enabled': False,
        'datareporting.policy.dataSubmissionEnabled': False, 'toolkit.telemetry.enabled': False}
    (profile / 'user.js').write_text('\n'.join(f'user_pref({json.dumps(k)}, {json.dumps(v)});' for k,v in preferences.items()), encoding='utf-8')
    argv = [str(ZEN), '--headless', '--no-remote', '--profile', str(profile),
            '--marionette', '--remote-allow-system-access', 'about:blank']
    report = {'source':str(source), 'profile':str(profile), 'argv':argv,
              'sourceHashes':{str(p.relative_to(source)):hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in [source/'style.css',*sorted((source/'src').rglob('*.mjs')),*([source/'define-word.uc.js'] if (source/'define-word.uc.js').exists() else [])]},
              'fixtureSha256':hashlib.sha256(fixture.encode()).hexdigest(),
              'evidenceScope':'isolated headless native Gecko; not everyday-profile acceptance'}
    process = None
    client = None
    status = 1
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with (run_dir / 'browser.log').open('wb') as browser_log:
            env = dict(os.environ, MOZ_HEADLESS='1', MOZ_HEADLESS_WIDTH='1280', MOZ_HEADLESS_HEIGHT='900')
            startupinfo = None
            if os.name == 'nt':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = subprocess.SW_HIDE
            process = subprocess.Popen(argv, stdout=browser_log, stderr=subprocess.STDOUT, env=env,
                startupinfo=startupinfo, creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
            report['pid'] = process.pid
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise RuntimeError(f'Zen exited during startup: {process.returncode}')
                try:
                    sock = socket.create_connection(('127.0.0.1', PORT), timeout=1)
                    sock.settimeout(100)
                    client = Marionette(sock)
                    break
                except (ConnectionRefusedError, TimeoutError):
                    time.sleep(0.2)
            if client is None:
                raise TimeoutError('Isolated Marionette server did not become ready')
            report['session'] = client.command('WebDriver:NewSession', {'capabilities':{'alwaysMatch':{}}})
            if args.content_page:
                page = args.content_page.resolve(strict=True)
                report['fixturePage'] = {'path':str(page),'sha256':hashlib.sha256(page.read_bytes()).hexdigest(),'zoom':args.zoom}
                # Zen's empty startup tab can expose a discarded browsing
                # context. Create a real isolated fixture tab before selecting
                # the current live handle through Marionette.
                client.command('Marionette:SetContext', {'value':'chrome'})
                client.command('WebDriver:ExecuteScript', {'script':'const w=Services.wm.getMostRecentWindow("navigator:browser");w.gBrowser.selectedTab=w.gBrowser.addTab("about:blank",{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});','args':[]})
                client.command('Marionette:SetContext', {'value':'content'})
                handles = client.command('WebDriver:GetWindowHandles')
                handles = handles.get('value', []) if isinstance(handles, dict) else handles
                if not handles:
                    raise RuntimeError('No live isolated browser tab after startup')
                client.command('WebDriver:SwitchToWindow', {'handle':handles[-1]})
                client.command('WebDriver:Navigate', {'url':page.as_uri()})
                client.command('Marionette:SetContext', {'value':'chrome'})
                client.command('WebDriver:ExecuteScript', {'script':'Services.wm.getMostRecentWindow("navigator:browser").gBrowser.selectedBrowser.fullZoom=arguments[0];','args':[args.zoom]})
                client.command('Marionette:SetContext', {'value':'content'})
                report['pageSelection'] = client.command('WebDriver:ExecuteScript', {'script':'''const target=[...document.querySelectorAll('p')].find(p=>p.textContent.trim()===arguments[0]);if(!target)throw new Error('Fixture paragraph not found');target.scrollIntoView({block:'center'});window.focus();const range=document.createRange();range.selectNodeContents(target);getSelection().removeAllRanges();getSelection().addRange(range);const r=range.getBoundingClientRect();return {text:getSelection().toString(),bounds:{x:r.x,y:r.y,width:r.width,height:r.height}};''','args':[args.select_text]})
            client.command('Marionette:SetContext', {'value':'chrome'})
            client.command('WebDriver:SetTimeouts', {'script':90000})
            result = client.command('WebDriver:ExecuteAsyncScript', {'script':BOOTSTRAP.replace('/* REVIEWED_FIXTURE_BODY */',fixture),
                'args':[source.as_uri()+'/',fixture,str(profile)], 'newSandbox':True, 'sandbox':'system'})
            report['probe'] = result.get('value',result) if isinstance(result,dict) else result
            status = 0 if report['probe'].get('ok') else 1
            checks = report['probe'].get('result', {}).get('checks') if isinstance(report['probe'].get('result'), dict) else None
            if isinstance(checks, dict) and checks:
                report['checksPassed'] = all(value is True for value in checks.values())
                if not report['checksPassed']:
                    status = 1
    except Exception as error:
        report['error'] = f'{type(error).__name__}: {error}'
    finally:
        if client:
            try:
                client.command('Marionette:Quit', {'flags':['eForceQuit']})
            except Exception:
                pass
            client.sock.close()
        if process:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=10)
            report['processExitCode'] = process.returncode
        report['browserLog'] = str(run_dir / 'browser.log')
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'report':str(output),'status':status,'profile':str(profile)}))
    return status


if __name__ == '__main__':
    raise SystemExit(main())
