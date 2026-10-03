import {sanitizeSelectionAnchor} from '../src/selection.sys.mjs?v=0.3.1';

export class DefineWordChild extends JSWindowActorChild {
  async receiveMessage(message) {
    if(message.name!=='DefineWord:GetSelection') return null;
    const element=this.document.activeElement;
    if(element?.localName==='input' && element.type==='password') return null;
    let rawText='',bounds=null;
    if(element && ['input','textarea'].includes(element.localName) && typeof element.selectionStart==='number') {
      rawText=element.value.slice(element.selectionStart,Math.min(element.selectionEnd,element.selectionStart+2048));
      if(rawText)try{bounds=element.getBoundingClientRect();}catch{}
    } else {
      const selection=this.contentWindow.getSelection();
      rawText=selection?.toString().slice(0,2048) || '';
      if(rawText && selection.rangeCount && !selection.isCollapsed)try{bounds=selection.getRangeAt(0).getBoundingClientRect();}catch{}
    }
    let anchor=null;
    if(bounds)try{
      // Gecko converts frame-local client coordinates through frame transforms,
      // browser zoom and the screen scale to the chrome popup's CSS units.
      anchor=sanitizeSelectionAnchor(this.contentWindow.windowUtils.toScreenRectInCSSUnits(bounds.x,bounds.y,bounds.width,bounds.height));
    }catch{}
    return {rawText,contextId:this.browsingContext.id,innerWindowId:this.manager.innerWindowId,anchor};
  }
}
export {DefineWordChild as DefineWordV031Child};
