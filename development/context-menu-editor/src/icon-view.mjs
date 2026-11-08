/** Fit the actual rendered glyphs, including joined emoji, into the same square
 * as image artwork. Text stays text in saved settings. */
export function appendFittedSymbol(window,target,text,size){
 const symbol=window.document.createElementNS('http://www.w3.org/1999/xhtml','span');symbol.className='cme-symbol';symbol.setAttribute('aria-hidden','true');
 symbol.dataset.cmeSymbolSize=String(size);
 symbol.style.cssText=`display:inline-block;position:relative;flex-shrink:0;width:${size}px;height:${size}px`;
 const glyph=window.document.createElementNS('http://www.w3.org/1999/xhtml','span');glyph.className='cme-symbol-glyph';glyph.textContent=text;
 glyph.style.cssText='display:block;position:absolute;left:50%;top:50%;white-space:pre;width:max-content;max-width:none;transform-origin:center';symbol.append(glyph);target.append(symbol);fitSymbol(window,symbol);
 return symbol;
}

/** Refit after a hidden settings dialog or collapsed submenu becomes visible. */
export function fitSymbol(window,symbol){
 const target=symbol.parentElement,size=Number(symbol.dataset.cmeSymbolSize),glyph=symbol.querySelector('.cme-symbol-glyph');if(!target||!size||!glyph)return;
 glyph.style.transform='translate(-50%,-50%)';
 const bounds=glyph.getBoundingClientRect(),style=window.getComputedStyle(target);
 const width=Math.min(size,(target.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0))||size),height=Math.min(size,(target.clientHeight-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0))||size);
 // Layout sizes exclude Sine's entrance animation. Measuring its temporary
 // transform would make the symbol grow past the slot when the animation ends.
 symbol.style.width=`${width}px`;symbol.style.height=`${height}px`;
 const measuredWidth=glyph.offsetWidth||bounds.width,measuredHeight=glyph.offsetHeight||bounds.height;
 if(measuredWidth>0&&measuredHeight>0)glyph.style.transform=`translate(-50%,-50%) scale(${Math.min(1,width/(measuredWidth+0.5),height/(measuredHeight+0.5))})`;
}
