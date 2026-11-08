// Panel coordinates use screen CSS pixels, matching Gecko's selection conversion.
export function createPopupPositioner(window,{panel,shell,header,isOpen}){
  let anchor=null,manual=false,drag=null,disposed=false,lastPosition=null;
  const valid=r=>r&&['x','y','width','height'].every(k=>Number.isFinite(r[k]))&&r.width>=0&&r.height>0;
  function bounds(){
    const x=Number.isFinite(window.mozInnerScreenX)?window.mozInnerScreenX:0,y=Number.isFinite(window.mozInnerScreenY)?window.mozInnerScreenY:0;
    return {x:x+12,y:y+12,right:x+window.innerWidth-12,bottom:y+window.innerHeight-12};
  }
  function size(){
    // Gecko can retain the old popup widget bounds during a window resize even
    // after the HTML shell has been constrained. Place the current content,
    // including fixed chrome insets, rather than the previous native size.
    const content=shell.getBoundingClientRect();
    if(content.width>0&&content.height>0){
      let width=content.width,height=content.height;
      for(const node of [panel,panel.panelContent].filter(Boolean)){
        const css=window.getComputedStyle(node),px=name=>parseFloat(css[name])||0;
        width+=px('paddingLeft')+px('paddingRight')+px('borderLeftWidth')+px('borderRightWidth');
        height+=px('paddingTop')+px('paddingBottom')+px('borderTopWidth')+px('borderBottomWidth');
      }
      return {width,height};
    }
    const r=panel.getOuterScreenRect?.()||panel.getBoundingClientRect();
    return {width:r.width||parseFloat(shell.style.width)||480,height:r.height||parseFloat(shell.style.height)||300};
  }
  function clamp(x,y){const b=bounds(),s=size();return {x:Math.round(Math.max(b.x,Math.min(x,b.right-s.width))),y:Math.round(Math.max(b.y,Math.min(y,b.bottom-s.height)))};}
  function target(){
    if(manual&&lastPosition)return clamp(lastPosition.x,lastPosition.y);
    const b=bounds(),s=size();
    if(anchor){
      const below=anchor.y+anchor.height+8,above=anchor.y-s.height-8;
      return clamp(anchor.x+anchor.width/2-s.width/2,below+s.height<=b.bottom?below:above>=b.y?above:below);
    }
    const browser=window.gBrowser?.selectedBrowser?.getBoundingClientRect?.();
    return clamp(b.x+(browser?.left||0)+4,b.y+(browser?.top||0)+4);
  }
  function fit(){if(disposed||!isOpen()||drag)return;const next=target();if(!lastPosition||next.x!==lastPosition.x||next.y!==lastPosition.y){lastPosition=next;panel.moveTo?.(next.x,next.y);}}
  function stop(event){if(drag?.id!==undefined&&event?.pointerId!==undefined&&event.pointerId!==drag.id)return;const old=drag;drag=null;header.removeAttribute('data-dragging');window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop);if(old?.id!==undefined){try{header.releasePointerCapture?.(old.id);}catch{}}}
  function move(event){if(!drag||disposed||(drag.id!==undefined&&event.pointerId!==drag.id))return;event.preventDefault();manual=true;lastPosition=clamp(drag.x+event.screenX-drag.pointerX,drag.y+event.screenY-drag.pointerY);panel.moveTo?.(lastPosition.x,lastPosition.y);}
  function start(event){
    if(disposed||drag||!isOpen()||event.button!==0||event.isPrimary===false||event.target.closest('button,select,input,a'))return;
    event.preventDefault();stop();const rect=panel.getOuterScreenRect?.(),point=rect?{x:rect.x,y:rect.y}:lastPosition||target();
    drag={x:point.x,y:point.y,pointerX:event.screenX,pointerY:event.screenY,id:event.pointerId};header.setAttribute('data-dragging','');
    try{header.setPointerCapture?.(event.pointerId);}catch{}
    const mouse=event.type==='mousedown';window.addEventListener(mouse?'mousemove':'pointermove',move,{passive:false});window.addEventListener(mouse?'mouseup':'pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop);
  }
  function keyboard(event){
    if(event.target!==header||!isOpen())return;
    if(event.key==='Escape'){stop();return;}
    const step=event.shiftKey?50:20,d={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[event.key];
    if(!d)return;event.preventDefault();manual=true;const p=lastPosition||target();lastPosition=clamp(p.x+d[0],p.y+d[1]);panel.moveTo?.(lastPosition.x,lastPosition.y);
  }
  header.addEventListener('pointerdown',start);header.addEventListener('mousedown',start);header.addEventListener('lostpointercapture',stop);header.addEventListener('keydown',keyboard);panel.addEventListener('popupshown',fit);window.addEventListener('resize',fit);
  const observer=window.ResizeObserver?new window.ResizeObserver(fit):null;observer?.observe(shell);
  return {
    open(value){stop();anchor=valid(value)?value:null;manual=false;lastPosition=null;const p=target();if(panel.openPopupAtScreen)panel.openPopupAtScreen(p.x,p.y,false);else panel.openPopup(window.gBrowser.selectedBrowser,'overlap',16,16,false,false);fit();},
    setPosition(x,y){manual=true;lastPosition=clamp(x,y);panel.moveTo?.(lastPosition.x,lastPosition.y);},
    fit,stop,destroy(){if(disposed)return;stop();disposed=true;observer?.disconnect();header.removeEventListener('pointerdown',start);header.removeEventListener('mousedown',start);header.removeEventListener('lostpointercapture',stop);header.removeEventListener('keydown',keyboard);panel.removeEventListener('popupshown',fit);window.removeEventListener('resize',fit);},
  };
}
