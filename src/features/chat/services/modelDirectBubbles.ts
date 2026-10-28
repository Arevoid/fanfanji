/** Model-direct replies retain punctuation and prose. Split only at blank
 * paragraph boundaries; never cut sentences, fenced code, tables or lists. */
export function splitModelDirectBubbles(text: string): string[] {
  const blocks: string[] = [];
  let lines: string[] = [], fence: {mark:string;length:number} | undefined;
  const flush = () => { const value=lines.join("\n").trim(); if(value)blocks.push(value); lines=[]; };
  for (const line of text.replace(/\r\n?/gu,"\n").split("\n")) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) {
      lines.push(line);
      if(marker && marker[1][0]===fence.mark && marker[1].length>=fence.length && !marker[2].trim())fence=undefined;
      continue;
    }
    if(marker){fence={mark:marker[1][0],length:marker[1].length};lines.push(line);continue;}
    if(!line.trim()){flush();continue;}
    lines.push(line);
  }
  flush();
  const list = (value:string) => /^[\t ]*(?:[-+*]|\d+[.)、])\s+/mu.test(value);
  const result: string[] = [];
  for (const block of blocks) {
    // Markdown permits blank lines between list items. Keep those items in a
    // single bubble, rather than turning each numbered step into a message.
    if (result.length && list(result[result.length-1]) && list(block)) result[result.length-1]+="\n\n"+block;
    else result.push(block);
  }
  return result;
}
