// Persist dimensions only; selected words and popup positions are never stored.
export function createPopupResizer(window,{panel,shell,handle,handles=[handle],isOpen,readSize,onSizeChange,onPositionChange}){
  let drag=null,manual=null,disposed=false,anchor=null,automatic=true;
  function geometry(){
    const content=shell.getBoundingClientRect();
    // A hidden native panel keeps its widget size but hides its content slot.
    // Subtracting these rectangles manufactures a growing "frame" on reopen.
    // Only fixed CSS insets are chrome; content exclusively owns dimensions.
    let frameWidth=0,frameHeight=0;
    for(const node of [panel,panel.panelContent].filter(Boolean)){
      const css=window.getComputedStyle(node),px=name=>parseFloat(css[name])||0;
      frameWidth+=px('paddingLeft')+px('paddingRight')+px('borderLeftWidth')+px('borderRightWidth');
      frameHeight+=px('paddingTop')+px('paddingBottom')+px('borderTopWidth')+px('borderBottomWidth');
    }
    return {content,frameWidth,frameHeight};
  }
  function constrainHeight(){
    const origin=window.mozInnerScreenY||0;
    const available=anchor?Math.max(anchor.y-origin-20,origin+window.innerHeight-anchor.y-anchor.height-20):window.innerHeight-32;
    // Automatic sizing must keep its selection clearance as the viewport
    // changes. Deliberate resizing can use the full viewport until reset.
    const limit=automatic?Math.min(window.innerHeight-32,available-geometry().frameHeight):window.innerHeight-32;
    shell.style.maxHeight=`${Math.max(1,limit)}px`;
  }
  function apply(width,height,preparing=false,at=null){
    if(disposed)return;
    const {content,frameWidth,frameHeight}=geometry();
    const left=at?.left??content.left,top=at?.top??content.top;
    const maxWidth=Math.max(1,Math.min(window.innerWidth-48,preparing?Infinity:window.innerWidth-Math.max(0,left)-frameWidth-12));
    const maxHeight=Math.max(1,Math.min(window.innerHeight-32,parseFloat(shell.style.maxHeight)||Infinity,preparing?Infinity:window.innerHeight-Math.max(0,top)-frameHeight-12));
    manual={width:Math.round(Math.min(maxWidth,Math.max(1,width))),height:Math.round(Math.min(maxHeight,Math.max(1,height)))};
    shell.dataset.resized='';shell.style.width=`${manual.width}px`;shell.style.height=`${manual.height}px`;
    // Let Gecko fit its native popup to the HTML shell. sizeTo() sets a second,
    // persistent width/height that can diverge from the content's constraints.
  }
  function stop(event){
    if(drag?.pointerId!==undefined&&event?.pointerId!==undefined&&event.pointerId!==drag.pointerId)return;
    const previous=drag;drag=null;
    for(const type of ['pointermove','mousemove'])window.removeEventListener(type,move);
    for(const type of ['pointerup','mouseup','pointercancel','blur'])window.removeEventListener(type,stop);
    if(previous?.pointerId!==undefined){try{previous.handle.releasePointerCapture?.(previous.pointerId);}catch{}}
    if(previous?.changed&&manual)onSizeChange?.({...manual});
  }
  function move(event){
    if(!drag||disposed||(drag.pointerId!==undefined&&event.pointerId!==drag.pointerId))return;
    event.preventDefault();
    // Screen coordinates stay stable when a north/west resize moves the widget.
    const dx=(drag.screen?event.screenX:event.clientX)-drag.x,dy=(drag.screen?event.screenY:event.clientY)-drag.y;
    const west=drag.edge.includes('w'),north=drag.edge.includes('n');
    const horizontal=west||drag.edge.includes('e'),vertical=north||drag.edge.includes('s');
    if(!drag.changed&&(!horizontal||dx===0)&&(!vertical||dy===0))return;
    if(!drag.changed){
      // Pin the grabbed dimensions before lifting the selection-space cap.
      // A click without movement must leave automatic sizing untouched.
      shell.style.width=`${drag.width}px`;shell.style.height=`${drag.height}px`;shell.dataset.resized='';
      automatic=false;constrainHeight();
    }
    drag.changed=true;
    // Minimums apply only to the dimension the user changes. Restoring or
    // fitting a short result must not grow its untouched dimension.
    let width=horizontal?Math.max(320,drag.width+(west?-dx:dx)):drag.width,height=vertical?Math.max(200,drag.height+(north?-dy:dy)):drag.height;
    if(west)width=Math.max(320,Math.min(width,drag.width+drag.left-12));
    if(north)height=Math.max(200,Math.min(height,drag.height+drag.top-12));
    const left=west?drag.left+drag.width-width:drag.left,top=north?drag.top+drag.height-height:drag.top;
    apply(width,height,false,{left,top});
    onPositionChange?.(drag.screenLeft+(west?drag.width-manual.width:0),drag.screenTop+(north?drag.height-manual.height:0));
  }
  function start(event){
    if(disposed||drag||!isOpen()||event.button!==0||event.isPrimary===false)return;
    event.preventDefault();const {content}=geometry(),outer=panel.getOuterScreenRect?.();
    const screen=!!outer,target=event.currentTarget;
    drag={x:screen?event.screenX:event.clientX,y:screen?event.screenY:event.clientY,screen,width:content.width,height:content.height,left:content.left,top:content.top,
      screenLeft:outer?.x??(window.mozInnerScreenX||0)+content.left,screenTop:outer?.y??(window.mozInnerScreenY||0)+content.top,edge:target.dataset.resizeEdge||'se',handle:target,pointerId:event.pointerId};
    target.setAttribute('data-pointer-focus','');target.focus();try{target.setPointerCapture?.(event.pointerId);}catch{}
    const mouse=event.type==='mousedown';window.addEventListener(mouse?'mousemove':'pointermove',move,{passive:false});window.addEventListener(mouse?'mouseup':'pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
  }
  function clear(){manual=null;shell.removeAttribute('data-resized');shell.style.removeProperty('width');shell.style.removeProperty('height');panel.removeAttribute('width');panel.removeAttribute('height');panel.style.removeProperty('width');panel.style.removeProperty('height');}
  function reset(){stop();clear();automatic=true;constrainHeight();onSizeChange?.(null);}
  function prepare(value){
    panel.removeAttribute('width');panel.removeAttribute('height');panel.style.removeProperty('width');panel.style.removeProperty('height');
    anchor=value&&Number.isFinite(value.y)&&Number.isFinite(value.height)&&value.height>0?{y:value.y,height:value.height}:null;
    automatic=true;constrainHeight();
    const saved=readSize?readSize():manual;
    if(saved&&Number.isFinite(saved.width)&&Number.isFinite(saved.height)&&saved.width>=200&&saved.height>=120&&saved.width<=10000&&saved.height<=10000)apply(saved.width,Math.min(saved.height,parseFloat(shell.style.maxHeight)),true);else clear();
  }
  function keyboard(event){
    event.currentTarget.removeAttribute('data-pointer-focus');if(disposed||!isOpen())return;
    if(event.key==='Home'){event.preventDefault();reset();return;}
    if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();stop();return;}
    const step=event.shiftKey?50:20,delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
    if(!delta)return;event.preventDefault();const {content}=geometry();automatic=false;constrainHeight();apply(delta[0]?Math.max(320,content.width+delta[0]):content.width,delta[1]?Math.max(200,content.height+delta[1]):content.height);onSizeChange?.({...manual});
  }
  function fit(){if(manual&&isOpen()&&!drag)apply(manual.width,manual.height);}
  // A closed popup measures nothing here; prepare() recomputes the limit on open.
  const windowResized=event=>{if(event.target===window&&isOpen()){constrainHeight();fit();}};
  function keyboardFocus(event){event.currentTarget.removeAttribute('data-pointer-focus');}
  for(const item of handles){item.addEventListener('blur',keyboardFocus);item.addEventListener('pointerdown',start);item.addEventListener('mousedown',start);item.addEventListener('lostpointercapture',stop);item.addEventListener('keydown',keyboard);item.addEventListener('dblclick',reset);}
  panel.addEventListener('popupshown',fit);window.addEventListener('resize',windowResized);
  return {prepare,stop,destroy(){if(disposed)return;stop();disposed=true;for(const item of handles){item.removeEventListener('blur',keyboardFocus);item.removeEventListener('pointerdown',start);item.removeEventListener('mousedown',start);item.removeEventListener('lostpointercapture',stop);item.removeEventListener('keydown',keyboard);item.removeEventListener('dblclick',reset);}panel.removeEventListener('popupshown',fit);window.removeEventListener('resize',windowResized);}};
}
