import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('Fluent bytes and browser-provided Zen references retain complete mapped artwork', async () => {
  const text = await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8').catch(()=>null);
  assert.ok(text, 'The adopted icon library must exist.');
  const data=JSON.parse(text);
  assert.equal(data.revision,'71750239d6fd114800989d91f2567cd4c47635e9');
  assert.deepEqual(data.packs.map(pack=>pack.id),['fluent','zen']);
  // CMI's 138/147 icons plus one local QR glyph per pack (Share submenu rows).
  assert.deepEqual(data.packs.map(pack=>pack.icons.length),[139,148]);
  assert.equal(Object.values(data.mappings).reduce((count,mapping)=>count+Object.keys(mapping.byId).length,0),461);
  const browserManifest=JSON.parse(await readFile(new URL('../assets/zen-browser-icons.json',import.meta.url),'utf8'));
  assert.deepEqual(await readdir(new URL('../assets/packs/',import.meta.url)),['fluent'],'No copied Zen artwork is packaged.');
  for(const pack of data.packs){
    assert.ok(pack.icons.length>=100,'The picker includes spare artwork, not only current menu assignments.');
    const byId=data.mappings[pack.id].byId;
    assert.equal(byId['context-copy'],'edit-copy');
    assert.ok(byId['context-translate-selection']);
    const ids=new Set();
    for(const icon of pack.icons){
      assert.ok(!ids.has(icon.id));ids.add(icon.id);
      if(pack.id==='zen'){
        assert.equal(icon.path,undefined);assert.equal(icon.sha256,undefined);
        if(icon.id==='qr-code'){
          // Firefox's own share-panel QR artwork, referenced from the installed browser.
          assert.equal(icon.browserPath,'chrome://browser/content/sharing/qr-code.svg');
          continue;
        }
        assert.match(icon.browserPath,/^chrome:\/\/browser\/skin\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.svg$/u);
        assert.equal(icon.browserPath,browserManifest.icons[icon.id]);
        continue;
      }
      assert.equal(icon.browserPath,undefined);
      const bytes=await readFile(new URL('../'+icon.path,import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),icon.sha256);
      const svg=bytes.toString('utf8');
      assert.match(svg,/<svg\b/);
      assert.doesNotMatch(svg,/<script\b|<foreignObject\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:)/i);
    }
    assert.equal(data.mappings[pack.id].byL10n['tab-context-share-url'],'share','Share has a fixed icon in both packs');
    // SharingUtils' ID-less Share rows (Gecko 159+) map by exact localization ID.
    assert.deepEqual(['menu-share-copy-links','menu-file-share-qrcode3','menu-share-windows'].map(id=>data.mappings[pack.id].byL10n[id]),['link','qr-code','share']);
    for(const id of [...Object.values(byId),...Object.values(data.mappings[pack.id].byL10n)])assert.ok(ids.has(id),'Mappings cannot point at missing artwork.');
  }
});

test('the local Fluent QR glyph keeps its pinned upstream identity and licence', async () => {
  const data=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));
  const qr=data.packs.find(pack=>pack.id==='fluent').icons.find(icon=>icon.id==='qr-code');
  assert.deepEqual(qr.source,{repository:'https://github.com/microsoft/fluentui-system-icons',
    revision:'e15fc0de25fab983e3e42bac8798be69a85c23bf',file:'assets/QR Code/SVG/ic_fluent_qr_code_20_regular.svg'});
  assert.equal(qr.originalSha256,'69f9c0a55a5362e7299af893426f5096156c6ad459f02642a53f5b325284b55a');
  const notice=await readFile(new URL('../licenses/FluentUI-System-Icons-MIT.txt',import.meta.url),'utf8');
  assert.match(notice,/^MIT License\n\nCopyright \(c\) 2020 Microsoft Corporation/);
});
