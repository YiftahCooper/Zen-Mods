export class DefineWordChild extends JSWindowActorChild {
  async receiveMessage(message) {
    if(message.name!=='DefineWord:GetSelection') return null;
    const element=this.document.activeElement;
    if(element?.localName==='input' && element.type==='password') return null;
    let rawText='';
    if(element && ['input','textarea'].includes(element.localName) && typeof element.selectionStart==='number') {
      rawText=element.value.slice(element.selectionStart,Math.min(element.selectionEnd,element.selectionStart+2048));
    } else rawText=this.contentWindow.getSelection()?.toString().slice(0,2048) || '';
    return {rawText,contextId:this.browsingContext.id,innerWindowId:this.manager.innerWindowId,anchor:null};
  }
}
