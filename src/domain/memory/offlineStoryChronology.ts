import type { Message } from "../../types";

export interface StoryTimePoint { messageId:string; offset:number; order:number; messageOrder:number; expression:string; calendar?:string; anchorMessageId?:string; mode:"scene"|"recollection"|"plan"; }
const validDay=(year:number,month:number,day:number)=>{
  const value=new Date(Date.UTC(year,month-1,day));
  return year>=1000&&year<=9999&&value.getUTCFullYear()===year&&value.getUTCMonth()===month-1&&value.getUTCDate()===day?value.toISOString().slice(0,10):undefined;
};
const number=(text:string)=>{const digits:Record<string,number>={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};return /^\d+$/u.test(text)?Number(text):text.includes("十")?(digits[text.split("十")[0]]||1)*10+(digits[text.split("十")[1]]||0):digits[text];};
function shift(day:string,count:number,unit:string){
  const value=new Date(`${day}T00:00:00Z`);
  if(unit==="天")value.setUTCDate(value.getUTCDate()+count);
  else {const original=value.getUTCDate();value.setUTCDate(1);if(unit==="月")value.setUTCMonth(value.getUTCMonth()+count);else value.setUTCFullYear(value.getUTCFullYear()+count);
    const last=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();value.setUTCDate(Math.min(original,last));}
  return value.toISOString().slice(0,10);
}
/** Derived from authored story text on every read: no wall-clock fallback or stale date cache. */
export function buildOfflineStoryChronology(messages:readonly Message[]):StoryTimePoint[]{
  const points:StoryTimePoint[]=[];let anchor:StoryTimePoint|undefined;
  for(const [messageOrder,message] of messages.entries()){
    if(message.recalledAt||message.isImportedContext||message.isNarration||message.id.startsWith("offline-import-"))continue;
    let recollection:StoryTimePoint|undefined;let planned:StoryTimePoint|undefined;
    const pattern=/(\d{4})[-年](\d{1,2})[-月](\d{1,2})(?:日)?|次日|第二天|([一二两三四五六七八九十\d]+)个?(天|月|年)(后|前)|昨天|明天/gu;
    for(const match of message.content.matchAll(pattern)){
      const prefix=message.content.slice(Math.max(0,match.index!-24),match.index);
      if(/回到现在|回到当下|实际|现实中/u.test(prefix)){recollection=undefined;planned=undefined;}
      const mode=/回忆|想起|回想|追忆/u.test(prefix)&&!/回到现在|回到当下/u.test(prefix)||recollection||match[6]==="前"||match[0]==="昨天"?"recollection":/计划|约定|打算|准备|预约/u.test(prefix)||planned?"plan":"scene";
      const reference=mode==="recollection"?recollection||anchor:mode==="plan"?planned||anchor:anchor;
      const explicit=match[1]?validDay(Number(match[1]),Number(match[2]),Number(match[3])):undefined;
      let calendar=explicit;
      if(!match[1]&&reference?.calendar){
        const count=match[4]?number(match[4])*(match[6]==="前"?-1:1):match[0]==="昨天"?-1:1;
        if(Number.isFinite(count)&&Math.abs(count)<=1000)calendar=shift(reference.calendar,count,match[5]||"天");
      }
      const point:StoryTimePoint={messageId:message.id,offset:match.index!,order:points.length,expression:match[0],messageOrder,mode,
        ...(calendar?{calendar}:{}),...(!match[1]&&reference?{anchorMessageId:reference.messageId}:{})};
      points.push(point);
      // Flashbacks and proposed dates never move the current scene clock.
      if(mode==="scene")anchor=point;else if(mode==="recollection")recollection=point;else planned=point;
    }
  }
  return points;
}
export function storyTimeForEvidence(points:readonly StoryTimePoint[],message:Message,quote:string,messageOrder=0):string{
  const start=message.content.indexOf(quote);if(start<0)return "剧情时间未明，不用消息或整理日期补齐";
  const before=points.filter(p=>p.messageId===message.id&&p.offset<=start).at(-1);
  const inside=points.filter(p=>p.messageId===message.id&&p.offset>=start&&p.offset<start+quote.length);
  const rows=inside.length?inside:before?[before]:points.filter(p=>p.messageOrder<messageOrder&&p.mode==="scene").slice(-1);
  return rows.length?rows.map(p=>`${p.expression}：${p.calendar||"起点未知，不换算日期"}${p.mode==="plan"?"（计划，不证明已发生）":p.mode==="recollection"?"（回忆，不改变当前场景）":""}`).join("；"):"剧情时间未明，不用消息或整理日期补齐";
}
