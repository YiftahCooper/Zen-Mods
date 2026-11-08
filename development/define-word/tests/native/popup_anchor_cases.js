// Native popup bounds against supplied screen-CSS selection rectangles.
const {window:w,popup,pause,snapshot,setSavedSize}=ctx;
const selectedRect={x:600,y:300,width:80,height:20};
const result={scope:'Real native popup geometry against synthetic selection screen rectangles',cases:[]};
for(const kind of ['short','long','large-saved']){
  popup.close();await pause(80);
  setSavedSize(kind==='large-saved'?{width:800,height:800}:null);
  const fixture=JSON.parse(JSON.stringify(ctx.fixture));
  if(kind==='long')fixture.outcome.definition.senses=Array.from({length:20},(_,i)=>({text:`Definition ${i+1}. `+'A longer definition tests constrained native popup content. '.repeat(8),examples:[]}));
  popup.render(fixture);popup.show(selectedRect);await pause(180);
  const geometry=snapshot(kind);
  result.cases.push({kind,selectedRect:{...selectedRect},geometry,
    noOverlap:geometry.outer.bottom<=selectedRect.y||geometry.outer.top>=selectedRect.y+selectedRect.height,
    onScreen:geometry.outer.left>=0&&geometry.outer.top>=0&&geometry.outer.right<=w.innerWidth&&geometry.outer.bottom<=w.innerHeight,
    scroll:{height:w.document.querySelector('#define-word-panel .dw-card').scrollHeight,client:w.document.querySelector('#define-word-panel .dw-card').clientHeight}});
}
result.checks=Object.fromEntries(result.cases.map(item=>[item.kind,item.noOverlap&&item.onScreen]));
return result;
