// Exact tab-command identifiers only. No extension/toolbar pin labels or
// internal preference/API names are rewritten.
export function installTerminology(host){
 const changed=new Map();
 const apply=()=>{
   for(const node of host.document.querySelectorAll('[data-l10n-id="zen-toggle-pin-tab-shortcut"], [command="cmd_zenTogglePinTab"]')){
     if(changed.has(node))continue;
     const original={l10n:node.getAttribute('data-l10n-id'),label:node.getAttribute('label'),text:node.textContent};
     changed.set(node,original);node.removeAttribute('data-l10n-id');
     if(node.localName==='key'){node.setAttribute('aria-label','Toggle URL Pin');continue;}
     if(node.hasAttribute('label'))node.setAttribute('label','Toggle URL Pin');else node.textContent='Toggle URL Pin';
   }
 };
 apply();const observer=new host.MutationObserver(apply);observer.observe(host.document.documentElement,{subtree:true,childList:true});
 return ()=>{observer.disconnect();for(const[n,old]of changed){if(old.l10n)n.setAttribute('data-l10n-id',old.l10n);if(old.label!==null&&n.getAttribute('label')==='Toggle URL Pin')n.setAttribute('label',old.label);if(n.textContent==='Toggle URL Pin')n.textContent=old.text;}};
}
