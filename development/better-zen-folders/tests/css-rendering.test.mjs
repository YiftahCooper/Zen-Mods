import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

// Opt-in isolated headless fixture; never connects to or starts the user's Zen.
const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : "set BZF_PLAYWRIGHT_MODULE to run headless CSS regressions";
const css = await readFile(new URL("../chrome.css", import.meta.url), "utf8");

test("numeric Sine fields block invalid saves, accept custom values and restore their UI on unload", {skip}, async () => {
  const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
  await withPage(async page => {
    const result = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], {type:"text/javascript"}));
      const api = await import(url); URL.revokeObjectURL(url);
      if (!api.installNumericSettingsUi) return {missing:true};
      document.body.innerHTML = `<div id="better-zen-folders-folder-name-size"><label class="sineItemPreferenceLabel">Folder name font size (px)</label><input type="text" value="14"></div><input id="unrelated" type="text">`;
      const input = document.querySelector("input");
      const writes = [];
      // Sine's target listener must never receive invalid values.
      input.addEventListener("change", () => writes.push(input.value));
      const stop = api.installNumericSettingsUi(window, {get:()=>"14"});
      input.value="0"; input.dispatchEvent(new Event("change",{bubbles:true}));
      const invalid={writes:[...writes], error:input.getAttribute("aria-invalid"), message:document.getElementById(input.getAttribute("aria-describedby")).textContent};
      input.value="14.5";input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}));
      const valid={writes:[...writes],error:input.getAttribute("aria-invalid"),type:input.type};
      input.value="22";input.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
      const escaped=input.value;
      stop();stop();
      return {invalid,valid,escaped,typeAfter:input.type,describedAfter:input.getAttribute("aria-describedby"),unrelated:document.getElementById("unrelated").type};
    },source);
    assert.equal(result.missing, undefined, "production settings enhancer exists");
    assert.deepEqual(result.invalid.writes, []);
    assert.equal(result.invalid.error,"true");assert.match(result.invalid.message,/greater than 0/);
    assert.deepEqual(result.valid,{writes:["14.5"],error:null,type:"number"});
    assert.equal(result.escaped,"14");assert.equal(result.typeAfter,"text");
    assert.equal(result.describedAfter,null);assert.equal(result.unrelated,"text");
  });
});

test("outline-free menu glyph scales by user percentage without changing outlined or sidebar icons", {skip}, async () => {
  const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
  await withPage(async page => {
    const result = await page.evaluate(async source => {
      const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
      const {createBrowserMoveToFolderMenuAdapters}=await import(url);URL.revokeObjectURL(url);
      document.body.innerHTML=`<zen-folder zen-icons-enlarge-inner-icon><div class="tab-group-label-container"><span class="tab-group-folder-icon"><svg viewBox="0 0 27 27"><g class="icon" style="transform:scale(1.36);transform-box:fill-box;transform-origin:center"><rect x="8" y="8" width="11" height="11"/></g></svg></span></div></zen-folder><menuitem class="context-zen-move-to-folder-item"><img class="menu-icon"></menuitem>`;
      const folder=document.querySelector("zen-folder"),item=document.querySelector("menuitem");
      let size="120";
      const adapter=createBrowserMoveToFolderMenuAdapters(window,{get:()=>size});
      const states=[];
      for(const percent of ["100","120","135.5"]){
        size=percent;adapter.decorateItem(item,folder,null);
        states.push({scale:item.querySelector("svg .icon").style.scale, width:item.querySelector("svg").getBoundingClientRect().width});
      }
      folder.removeAttribute("zen-icons-enlarge-inner-icon");adapter.decorateItem(item,folder,null);
      const outlined=item.querySelector("svg .icon").style.scale;
      const sidebar=folder.querySelector(".icon").style.scale;
      adapter.clearItem(item);
      return {states,outlined,sidebar,leftovers:item.querySelectorAll("svg").length};
    },source);
    assert.deepEqual(result.states,[{scale:"1",width:32},{scale:"1.2",width:32},{scale:"1.355",width:32}]);
    assert.equal(result.outlined,"");assert.equal(result.sidebar,"");assert.equal(result.leftovers,0);
  });
});

async function withPage(run) {
  const { chromium } = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    await page.addStyleTag({ content: css });
    await run(page);
  } finally {
    await browser.close();
  }
}

test("BZF command icons keep CMI's size token, suppress duplicate paint and leave native commands alone", {skip}, async () => {
  const source=await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url),"utf8");
  await withPage(async page=>{
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
      const {setBzfCommandIcon}=await import(url);URL.revokeObjectURL(url);
      // Extracted CMI mechanism: background image for moved items / non-iconic rows.
      const style=document.createElement("style");
      style.textContent=`menupopup {--fp-contextmenu-menuitem-icon-size:19px}
        #context_zenFolderNewSubfolder {--menu-image:url(native.svg)}
        .menu-icon {display:none;width:16px;height:16px}
        menuitem:where(.menuitem-iconic,[image]) > .menu-icon {display:block}
        menuitem.sine-moved, menuitem:not(.menuitem-iconic) {background-image:var(--menu-image,none)!important}`;
      document.head.appendChild(style);
      document.body.innerHTML=`<menupopup><menuitem id="better-zen-folders-folder-colour" class="sine-moved"><img class="menu-icon"></menuitem><menuitem id="better-zen-folders-new-tab-menu" class="sine-moved"><img class="menu-icon"></menuitem><menuitem id="context_zenFolderNewSubfolder"><img class="menu-icon"></menuitem></menupopup>`;
      const native=document.getElementById("context_zenFolderNewSubfolder");
      const before=native.outerHTML,states=[];
      for(const id of ["better-zen-folders-folder-colour","better-zen-folders-new-tab-menu"]){
        const item=document.getElementById(id);
        for(const mode of ["mod","off","compatibility","mod"]){
          setBzfCommandIcon(item,"command.svg",mode);
          const icon=getComputedStyle(item.querySelector(".menu-icon"));
          states.push({id,mode,background:getComputedStyle(item).backgroundImage,width:icon.width,height:icon.height,display:icon.display});
        }
      }
      const item=document.getElementById("better-zen-folders-folder-colour");
      // Off releases BZF paint; an inherited external background must survive.
      item.parentElement.style.setProperty("--menu-image","url(external.svg)");
      setBzfCommandIcon(item,null,"off");
      const offExternal=getComputedStyle(item).backgroundImage;
      // An external native-slot source must also remain visible in Off.
      item.setAttribute("image","external-slot.svg");
      setBzfCommandIcon(item,null,"off");
      return {states,offExternal,offSlot:getComputedStyle(item.querySelector(".menu-icon")).display,
        offImage:item.getAttribute("image"),nativeUnchanged:native.outerHTML===before,nativePaint:getComputedStyle(native).backgroundImage};
    },source);
    for(const state of result.states){
      if(state.mode==="compatibility") assert.match(state.background,/command.svg/);
      else assert.equal(state.background,"none");
      if(state.mode==="mod"){
        assert.equal(state.width,"19px",state.id);assert.equal(state.height,"19px",state.id);
        assert.notEqual(state.display,"none",state.id);
      } else assert.equal(state.display,"none",state.id);
    }
    assert.equal(result.nativeUnchanged,true);assert.match(result.nativePaint,/native.svg/);
    assert.match(result.offExternal,/external.svg/);assert.notEqual(result.offSlot,"none");
    assert.equal(result.offImage,"external-slot.svg");
  });
});

test("settings enhancer follows late Sine rebuilds and applies fractional title size without altering tabs", {skip}, async()=>{
  const source=await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url),"utf8");
  await withPage(async page=>{
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
      const {installNumericSettingsUi,FolderNameSizePreferenceProjection}=await import(url);URL.revokeObjectURL(url);
      const preferences={get:()=>"14.5",subscribe:()=>()=>{}};
      const stop=installNumericSettingsUi(window,preferences);
      document.body.innerHTML=`<div id="better-zen-folders-folder-name-size"><input type="text"></div><zen-folder><div class="tab-group-label-container"><label class="tab-group-label">Folder</label></div><tab style="font-size:13px">Tab</tab></zen-folder>`;
      await new Promise(resolve=>setTimeout(resolve,0));
      const first=document.querySelector("input");
      const firstType=first.type;
      first.parentElement.remove();
      const row=document.createElement("div");row.id="better-zen-folders-folder-name-size";
      row.innerHTML='<input type="text">';document.body.appendChild(row);
      await new Promise(resolve=>setTimeout(resolve,0));
      const projection=new FolderNameSizePreferenceProjection({root:()=>document.documentElement,preferences});projection.start();
      const folderSize=getComputedStyle(document.querySelector("label")).fontSize;
      const tabSize=getComputedStyle(document.querySelector("tab")).fontSize;
      const secondType=row.querySelector("input").type;
      stop();projection.destroy();
      return {firstType,firstReleased:first.type,secondType,secondReleased:row.querySelector("input").type,folderSize,tabSize,leftovers:document.querySelectorAll('[role="alert"]').length};
    },source);
    assert.deepEqual(result,{firstType:"number",firstReleased:"text",secondType:"number",secondReleased:"text",folderSize:"14.5px",tabSize:"13px",leftovers:0});
  });
});

test("nested default guides do not inherit a parent custom colour, including after Reset", { skip }, async () => {
  await withPage(async page => {
    await page.evaluate(() => {
      // Zen defines its default folder paints on :root, not on every folder.
      document.documentElement.style.setProperty("--zen-folder-stroke", "#000000");
      document.documentElement.style.setProperty("--zen-folder-front-bgcolor", "#abcdef");
      document.documentElement.style.setProperty("--zen-folder-behind-bgcolor", "#123456");
      document.body.innerHTML = `<zen-folder id="parent" style="--better-zen-folders-custom-color:#ff0000">
        <zen-folder id="child"><zen-folder id="grandchild"></zen-folder></zen-folder>
      </zen-folder>`;
      for (const folder of document.querySelectorAll("zen-folder")) {
        folder.style.color = "var(--better-zen-folders-folder-color)";
      }
      const parent = document.getElementById("parent");
      parent.setAttribute("data-better-zen-folders-color", "#ff0000");
      parent.style.setProperty("--zen-folder-front-bgcolor", "#ff0000");
      parent.style.setProperty("--zen-folder-behind-bgcolor", "#ff0000");
    });
    const colors = () => page.evaluate(() => [...document.querySelectorAll("zen-folder")]
      .map(folder => getComputedStyle(folder).color));
    assert.deepEqual(await colors(), ["rgb(255, 0, 0)", "rgb(0, 0, 0)", "rgb(0, 0, 0)"]);
    assert.deepEqual(await page.evaluate(() => {
      const child = getComputedStyle(document.getElementById("child"));
      return ["--zen-folder-front-bgcolor", "--zen-folder-behind-bgcolor"].map(p => child.getPropertyValue(p).trim());
    }), ["#abcdef", "#123456"]);
    await page.evaluate(() => document.getElementById("child").style
      .setProperty("--better-zen-folders-custom-color", "#00ff00"));
    assert.deepEqual(await colors(), ["rgb(255, 0, 0)", "rgb(0, 255, 0)", "rgb(0, 0, 0)"]);
    await page.evaluate(() => document.getElementById("child").style
      .removeProperty("--better-zen-folders-custom-color"));
    assert.deepEqual(await colors(), ["rgb(255, 0, 0)", "rgb(0, 0, 0)", "rgb(0, 0, 0)"]);
  });
});

test("guide toggles retain pseudo-element geometry and restore paint repeatedly without icon changes", { skip }, async () => {
  await withPage(async page => {
    const actual = await page.evaluate(() => {
      const root=document.documentElement;
      root.setAttribute("zen-sidebar-expanded","true");
      root.style.setProperty("--tab-group-line-thickness","2px");
      root.style.setProperty("--zen-folder-stroke","#112233");
      document.body.innerHTML=`<zen-folder><div class="tab-group-label-container"><span class="tab-group-folder-icon">ICON</span><label class="tab-group-label" aria-expanded="true">Title</label></div><div class="tab-group-container"><div>Tab</div></div></zen-folder>`;
      const container=document.querySelector(".tab-group-container");
      return [true,false,true,false,true].map(value=>{
        root.setAttribute("better-zen-folders-show-guides",String(value));
        const s=getComputedStyle(container,"::before");
        return {content:s.content,opacity:s.opacity,width:s.borderLeftWidth,
          color:s.borderLeftColor,position:getComputedStyle(container).position,
          icon:getComputedStyle(document.querySelector(".tab-group-folder-icon")).opacity};
      });
    });
    assert.deepEqual(actual.map(x=>x.opacity),["1","0","1","0","1"]);
    for(const value of actual) {
      assert.equal(value.content,'""');assert.equal(value.position,"relative");
      assert.equal(value.width,"2px");assert.equal(value.color,"rgb(17, 34, 51)");assert.equal(value.icon,"1");
    }
  });
});

test("Gecko 155 direct menu icons receive BZF colour and clone presentation", { skip }, async () => {
  const source=await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url),"utf8");
  await withPage(async page => {
    await page.evaluate(async source => {
      const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
      const {setBzfCommandIcon}=await import(url);URL.revokeObjectURL(url);
      document.body.innerHTML = `<menuitem id="better-zen-folders-folder-colour"
        data-better-zen-folders-colour-marker="custom" style="--better-zen-folders-menu-folder-color:#ff0000">
        <img class="menu-icon"><label>Folder colour</label></menuitem>
        <menuitem class="context-zen-move-to-folder-item better-zen-folders-decorated-folder-item
          better-zen-folders-has-live-folder-icon" style="--better-zen-folders-menu-folder-color:#ff0000">
        <svg class="better-zen-folders-menu-live-folder-icon"></svg><img class="menu-icon"><label>Folder</label>
        </menuitem>`;
      setBzfCommandIcon(document.getElementById("better-zen-folders-folder-colour"),
        "chrome://browser/skin/zen-icons/selectable/palette.svg","mod");
    },source);
    const actual = await page.evaluate(() => {
      const palette = getComputedStyle(document.querySelector("#better-zen-folders-folder-colour > .menu-icon"));
      const destination = document.querySelector(".context-zen-move-to-folder-item");
      const clone = getComputedStyle(destination.querySelector("svg"));
      return {
        paletteBackground: palette.backgroundImage,
        nativeDisplay: getComputedStyle(destination.querySelector(".menu-icon")).display,
        cloneWidth: clone.width, cloneHeight: clone.height,
        clonePointerEvents: clone.pointerEvents,
      };
    });
    assert.match(actual.paletteBackground, /rgb\(255, 0, 0\)/);
    assert.equal(actual.nativeDisplay, "none");
    assert.equal(actual.cloneWidth, "32px");
    assert.equal(actual.cloneHeight, "32px");
    assert.equal(actual.clonePointerEvents, "none");
  });
});

test("disabled menu decoration aligns custom and default destinations without empty icon gutters", { skip }, async () => {
  const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
  await withPage(async page => {
    const actual = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], {type:"text/javascript"}));
      const {MoveToFolderMenuDecorator, createBrowserMoveToFolderMenuAdapters} = await import(url);
      URL.revokeObjectURL(url);
      document.body.innerHTML = `<style>
        menuitem {display:flex;padding:8px;font-size:16px}
        .menu-icon {display:none;width:16px;height:16px;margin-right:8px}
        menuitem[image] > .menu-icon {display:block}
      </style><div id="context_zenMoveToFolder">
        <menuitem class="context-zen-move-to-folder-item" image="custom.svg"><img class="menu-icon"><label>Custom</label></menuitem>
        <menuitem class="context-zen-move-to-folder-item"><img class="menu-icon"><label>Default</label></menuitem>
      </div>`;
      const items = [...document.querySelectorAll("menuitem")];
      items.forEach(item => item._group = {isZenFolder:true});
      const adapters = createBrowserMoveToFolderMenuAdapters(window, {get:()=>false,subscribe:()=>()=>{}});
      const manager = new MoveToFolderMenuDecorator(adapters);
      manager.start(); manager.onPopupShowing();
      const offsets = items.map(item => item.querySelector("label").getBoundingClientRect().left - item.getBoundingClientRect().left);
      const originals = items.map(item => item.getAttribute("image"));
      manager.destroy();
      return {offsets, originals, restored:items[0].querySelector("label").getBoundingClientRect().left - items[0].getBoundingClientRect().left};
    }, source);
    assert.deepEqual(actual.offsets, [8,8]);
    assert.deepEqual(actual.originals, ["custom.svg",null]);
    assert.equal(actual.restored, 32);
  });
});

test("real text layout isolates delayed rename from immediate blank-row clicks", { skip }, async () => {
  const source=await readFile(new URL("../scripts/better-zen-folders.uc.mjs",import.meta.url),"utf8");
  await withPage(async page=>{
    const actual=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:"text/javascript"}));
      const {FolderDoubleClickRenameManager,createBrowserFolderDoubleClickRenameAdapters}=await import(url);
      URL.revokeObjectURL(url);
      document.body.innerHTML=`<div id="tabs"><zen-folder><div class="tab-group-label-container"><label class="tab-group-label" style="display:block;width:250px;height:50px;padding:8px 0 0 32px;font:600 17px sans-serif">Sample title</label></div></zen-folder></div>`;
      const target=document.getElementById("tabs"),folder=target.querySelector("zen-folder"),label=target.querySelector("label");
      folder.isZenFolder=true;folder.labelElement=label;folder.collapsed=false;
      let renames=0,toggles=0;folder.rename=()=>renames++;
      folder.addEventListener("click",()=>{toggles++;folder.collapsed=!folder.collapsed;});
      const timers=new Set();
      const adapters=createBrowserFolderDoubleClickRenameAdapters({document,gBrowser:{tabContainer:target},getComputedStyle,
        setTimeout:cb=>{timers.add(cb);return cb;},clearTimeout:cb=>timers.delete(cb)});
      const manager=new FolderDoubleClickRenameManager(adapters);manager.start();
      const range=document.createRange();range.selectNodeContents(label);const text=range.getBoundingClientRect();
      const send=(type,detail,x,y)=>label.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,button:0,detail,clientX:x,clientY:y}));
      const x=text.left+5,y=(text.top+text.bottom)/2;
      send("click",1,x,y);const firstToggles=toggles;
      send("click",2,x,y);send("dblclick",2,x,y);
      for(const callback of timers) callback();
      const renamed={renames,toggles,collapsed:folder.collapsed};
      send("click",1,label.getBoundingClientRect().left+5,y);
      const blank={toggles,collapsed:folder.collapsed,timers:timers.size};
      manager.destroy();return {firstToggles,renamed,blank};
    },source);
    assert.deepEqual(actual,{firstToggles:0,renamed:{renames:1,toggles:0,collapsed:false},blank:{toggles:1,collapsed:true,timers:0}});
  });
});

test("real DOM menu snapshot preserves painted SVG and returns native markup on cleanup", { skip }, async () => {
  const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
  await withPage(async page => {
    const actual = await page.evaluate(async source => {
      const moduleURL = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const { createBrowserMoveToFolderMenuAdapters } = await import(moduleURL);
      URL.revokeObjectURL(moduleURL);
      document.body.innerHTML = `<zen-folder><div class="tab-group-label-container">
        <span class="tab-group-folder-icon"><svg viewBox="0 0 27 27">
          <path class="back" fill="#00ff00" d="M0 0H27V27H0Z"/>
          <g class="icon" style="transform:scale(1.2); transform-origin:center">
            <path fill="#000000" d="M8 8H19V19H8Z"/>
          </g></svg></span></div></zen-folder>
        <menuitem class="context-zen-move-to-folder-item" image="native.svg">
          <img class="menu-icon"><label>Destination</label></menuitem>`;
      const folder = document.querySelector("zen-folder");
      const item = document.querySelector("menuitem");
      const originalChildren = [...item.children];
      const adapters = createBrowserMoveToFolderMenuAdapters(window);
      adapters.decorateItem(item, folder, "#00ff00");
      const clone = item.querySelector("svg");
      const result = {
        svgCount: item.querySelectorAll("svg").length,
        hidden: clone.getAttribute("aria-hidden"), focusable: clone.getAttribute("focusable"),
        backFill: getComputedStyle(clone.querySelector(".back")).fill,
        innerFill: getComputedStyle(clone.querySelector(".icon path")).fill,
        transform: getComputedStyle(clone.querySelector(".icon")).transform,
        cloneWidth: clone.getBoundingClientRect().width,
        nativeDisplay: getComputedStyle(item.querySelector(".menu-icon")).display,
      };
      adapters.clearItem(item);
      result.restored = item.children.length === originalChildren.length
        && [...item.children].every((node, index) => node === originalChildren[index])
        && item.getAttribute("image") === "native.svg";
      return result;
    }, source);
    assert.deepEqual(actual, {
      svgCount: 1, hidden: "true", focusable: "false",
      backFill: "rgb(0, 255, 0)", innerFill: "rgb(0, 0, 0)",
      transform: "matrix(1.2, 0, 0, 1.2, 0, 0)", cloneWidth: 32,
      nativeDisplay: "none", restored: true,
    });
  });
});

test("menu snapshot makes context-painted inner SVG self-contained without changing the folder source", { skip }, async () => {
  const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
  await withPage(async page => {
    const actual = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const { createBrowserMoveToFolderMenuAdapters } = await import(url);
      URL.revokeObjectURL(url);
      const canonical = "chrome://sine/content/zen-icons-local/lucide/ear.svg";
      document.body.innerHTML = `<zen-folder><div class="tab-group-label-container"><span class="tab-group-folder-icon">
        <svg viewBox="0 0 27 27"><g class="icon"><image href="${canonical}" width="11" height="11"
        style="fill:rgb(34,197,94);stroke:rgb(34,197,94);stroke-opacity:1;fill-opacity:1"/></g></svg>
        </span></div></zen-folder><menuitem><img class="menu-icon"></menuitem>`;
      const folder = document.querySelector("zen-folder");
      const item = document.querySelector("menuitem");
      const reads = [];
      const host = {document, getComputedStyle: window.getComputedStyle.bind(window), fetch: async path => {
        reads.push(path);
        return {ok:true, text:async()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="context-stroke"><path d="M4 4H20V20H4Z"/></svg>'};
      }};
      const adapters = createBrowserMoveToFolderMenuAdapters(host);
      adapters.decorateItem(item, folder, "#22c55e");
      await new Promise(resolve => setTimeout(resolve, 0));
      const image = item.querySelector("svg image");
      const href = image.getAttribute("href");
      const original = folder.querySelector("svg image").getAttribute("href");
      adapters.clearItem(item);
      const localSource = "file:///C:/test%20profile/chrome/sine-mods/zen-icons-local/lucide/ear.svg";
      folder.querySelector("svg image").setAttribute("href", localSource);
      adapters.decorateItem(item, folder, "#22c55e");
      await new Promise(resolve => setTimeout(resolve, 0));
      const localHref = item.querySelector("svg image").getAttribute("href");
      adapters.clearItem(item);
      const emojiSource = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg"><text>emoji</text></svg>');
      folder.querySelector("svg image").setAttribute("href", emojiSource);
      adapters.decorateItem(item, folder, "#22c55e");
      await new Promise(resolve => setTimeout(resolve, 0));
      const emojiPreserved = item.querySelector("svg image").getAttribute("href") === emojiSource;
      adapters.clearItem(item);
      return {reads,href,localHref,emojiPreserved,original,leftovers:item.querySelectorAll("svg").length};
    }, source);
    assert.deepEqual(actual.reads, ["chrome://sine/content/zen-icons-local/lucide/ear.svg",
      "file:///C:/test%20profile/chrome/sine-mods/zen-icons-local/lucide/ear.svg"]);
    assert.match(actual.href, /^data:image\/svg\+xml/);
    assert.match(decodeURIComponent(actual.href), /stroke="rgb\(34, 197, 94\)"/);
    assert.doesNotMatch(decodeURIComponent(actual.href), /context-stroke/);
    assert.equal(actual.original, "chrome://sine/content/zen-icons-local/lucide/ear.svg");
    assert.equal(actual.leftovers, 0);
    assert.match(actual.localHref, /^data:image\/svg\+xml/);
    assert.equal(actual.emojiPreserved, true);
  });
});
