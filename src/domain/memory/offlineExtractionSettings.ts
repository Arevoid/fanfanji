/** Request minimization, not content-filter evasion. Never edits source messages.
 * Only short, whole, relevant setting lines are sent; omitted material is not
 * evidence of a conflict or duplicate. Source IDs and literal text stay intact. */
export function selectOfflineExtractionSettings(settings:readonly {id:string;text:string}[],sourceText:string):{id:string;text:string}[]{
  const tokens=(text:string)=>{
    const normalized=text.normalize("NFKC").toLowerCase();
    return new Set([...(normalized.match(/[a-z0-9_]{3,}/gu)||[]),...(normalized.match(/[\p{Script=Han}]+/gu)||[])
      .flatMap(run=>Array.from({length:Math.max(0,run.length-1)},(_,i)=>run.slice(i,i+2)))].filter(token=>!["用户","角色","自己","一个"].includes(token)));
  };
  const query=tokens(sourceText);
  const instructions=/输出|回复|格式|提示词|扮演|语气|文风|排版|指令|模型|JSON|markdown|system|prompt|ignore|jailbreak/iu;
  const rows=settings.flatMap(setting=>{
    const matches=setting.text.split(/\r?\n/u).map(text=>text.trim()).filter(text=>text.length>=4&&text.length<=240&&!instructions.test(text))
      .map(text=>({text,score:[...tokens(text)].filter(token=>query.has(token)).length})).filter(row=>row.score>0).sort((a,b)=>b.score-a.score);
    return matches.length?[{id:setting.id,...matches[0]}]:[];
  }).sort((a,b)=>b.score-a.score);
  let remaining=1200;
  return rows.slice(0,6).flatMap(({id,text})=>{if(text.length>remaining)return [];remaining-=text.length;return [{id,text}];});
}
