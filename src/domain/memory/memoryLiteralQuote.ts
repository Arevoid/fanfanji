const normalize=(text:string)=>text.replace(/\r\n?/gu,"\n").replace(/[ \t\u00a0]+/gu," ").trim();
/** Restore a provider's formatting-only full quote to the original bytes.
 * Never repair words, conditions, speakers or negations. */
export function restoreFullMemoryQuote(original:string,candidate:unknown):string|undefined{
 if(typeof candidate!=="string"||!candidate.trim())return undefined;
 const a=normalize(original),b=normalize(candidate);
 return a===b||a.replace(/(?<!\.)[。.]$/u,"")===b.replace(/(?<!\.)[。.]$/u,"")?original:undefined;
}
