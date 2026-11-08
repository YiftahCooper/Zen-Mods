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
  // CMI's 138/147 icons plus the local additions (3 Fluent glyphs, 7 Zen references).
  assert.deepEqual(data.localAdditions,{fluentGlyphs:['comment','highlight','qr-code'],
    zenReferences:['AI-chat','AI-summarize','comment','highlight','qr-code','sort','unloadTab']});
  assert.deepEqual(data.packs.map(pack=>pack.icons.length),[141,154]);
  assert.equal(Object.values(data.mappings).reduce((count,mapping)=>count+Object.keys(mapping.byId).length,0),560);
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
        if(data.localAdditions.zenReferences.includes(icon.id)){
          // Local references to artwork the installed browser ships (Zen skin, or
          // Firefox's own share-panel QR glyph); verified in Zen 1.24.1b.
          assert.match(icon.browserPath,/^chrome:\/\/browser\/(?:skin\/zen-icons\/(?:selectable\/)?[a-z-]+|content\/sharing\/qr-code)\.svg$/u);
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
    assert.deepEqual(['user-context-add-container2','user-context-manage-containers2'].map(id=>data.mappings[pack.id].byL10n[id]),['container-tab','manage'],'Container submenu actions keep their glyphs under the current Fluent IDs.');
    for(const id of [...Object.values(byId),...Object.values(data.mappings[pack.id].byL10n)])assert.ok(ids.has(id),'Mappings cannot point at missing artwork.');
  }
});

test('local Fluent glyphs keep their pinned upstream identity and licence', async () => {
  const data=JSON.parse(await readFile(new URL('../assets/catalog.json',import.meta.url),'utf8'));
  const fluent=data.packs.find(pack=>pack.id==='fluent').icons;
  const expected={'qr-code':['QR Code','69f9c0a55a5362e7299af893426f5096156c6ad459f02642a53f5b325284b55a'],
    comment:['Comment','553257ec69c1337652f6627c7901dec1cd263483c9f04ae669f074353c65bccb'],
    highlight:['Highlight','32a83b8b6ecfc870fd1b633dfaa0a997128f7d3fe168affec723045a29f71d0d']};
  for(const [id,[folder,original]]of Object.entries(expected)){
    const icon=fluent.find(entry=>entry.id===id);
    assert.deepEqual(icon.source,{repository:'https://github.com/microsoft/fluentui-system-icons',
      revision:'e15fc0de25fab983e3e42bac8798be69a85c23bf',file:`assets/${folder}/SVG/ic_fluent_${id.replace('-','_')}_20_regular.svg`});
    assert.equal(icon.originalSha256,original);
  }
  const notice=await readFile(new URL('../licenses/FluentUI-System-Icons-MIT.txt',import.meta.url),'utf8');
  assert.match(notice,/^MIT License\n\nCopyright \(c\) 2020 Microsoft Corporation/);
});
