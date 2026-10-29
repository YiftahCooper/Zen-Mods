import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PREFERENCE_DEFINITIONS, BetterZenFoldersPreferences, createBrowserPreferenceAdapters} from '../scripts/better-zen-folders.uc.mjs';
import {makePreferenceFixture} from './fakes.mjs';

test('drag destination colour coding defaults on and is independently toggleable',()=>{
 const f=makePreferenceFixture(),p=new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(f.host));p.start();
 try{
  assert.equal(p.get('colourCodeDragDestinations'),true);
  assert.equal(PREFERENCE_DEFINITIONS.colourCodeDragDestinations.property,'better-zen-folders.colour-code-drag-destinations');
  f.set('better-zen-folders.colour-code-drag-destinations',false);f.notify('better-zen-folders.colour-code-drag-destinations');
  assert.equal(p.get('colourCodeDragDestinations'),false);
  assert.equal(p.get('dragDestinationDelayMs'),300);
 }finally{p.destroy();}
});

test('the colour switch is under Dragging, beside the existing destination delay',async()=>{
 const rows=JSON.parse(await readFile(new URL('../preferences.json',import.meta.url)));
 const index=rows.findIndex(r=>r.property==='better-zen-folders.colour-code-drag-destinations');
 assert.ok(index>0);assert.equal(rows[index-1].property,'better-zen-folders.drag-destination-delay-ms');
 assert.equal(rows.slice(0,index).filter(r=>r.type==='separator').at(-1).label,'Dragging');
 assert.equal(rows[index].defaultValue,true);assert.equal(rows[index].type,'checkbox');
 assert.ok(rows[index].label.startsWith('Colour-Code Drag Destinations'));
});
