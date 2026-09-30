export function normalizeTerm(rawText) {
  const original=typeof rawText==='string'?rawText.trim():'';
  if(!original) return {status:'empty'};
  if([...original].length>100) return {status:'too-long'};
  const query=original.normalize('NFC').replace(/^[\p{P}\p{Z}\s]+|[\p{P}\p{Z}\s]+$/gu,'');
  if(!query) return {status:'empty'};
  const letters=[...query].filter(c=>/\p{L}/u.test(c));
  const language=letters.length && letters.every(c=>/\p{Script=Hebrew}/u.test(c))?'he':letters.length && letters.every(c=>/\p{Script=Latin}/u.test(c))?'en':null;
  const without=query.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,'');
  return {original,query,language,withoutNiqqud:language==='he'&&without!==query?without:null};
}
