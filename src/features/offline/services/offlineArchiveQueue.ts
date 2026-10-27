import type {OfflineStory} from "../../../types";
export type OfflineArchiveOptions={userConfirmed?:boolean;syncIntent?:"automatic_end"|"manual_settings";incrementalOnly?:boolean;backgroundProgress?:boolean};
type Executor=(story:OfflineStory,options?:OfflineArchiveOptions)=>Promise<OfflineStory>;
let executor:Executor|undefined;
let reader:((id:string)=>OfflineStory|undefined)|undefined;
export function readOfflineArchiveStory(id:string){return reader?.(id); }
export function hasOfflineArchiveReader(){return Boolean(reader); }
export function installOfflineArchiveExecutor(run:Executor,read?:(id:string)=>OfflineStory|undefined){executor=run;reader=read;return()=>{if(executor===run){executor=undefined;reader=undefined;}};}
export function requestOfflineArchive(story:OfflineStory,options:OfflineArchiveOptions={}):Promise<OfflineStory>{
 if(!executor)return Promise.reject(new Error("offline_archive_runtime_unavailable"));
 return executor(story,options);
}
const jobs=new Map<string,{promise:Promise<OfflineStory>;latest:OfflineStory;options:OfflineArchiveOptions;revision:number}>();
/** One owner per story across navigation. New user actions join the same task. No timers. */
export function enqueueOfflineArchive(story:OfflineStory,options:OfflineArchiveOptions,run:Executor):Promise<OfflineStory>{
 const existing=jobs.get(story.id);
 if(existing){if(story.updatedAt>=existing.latest.updatedAt)existing.latest=story;existing.options={...existing.options,...options,backgroundProgress:options.backgroundProgress===true};existing.revision++;return existing.promise;}
 const job={latest:story,options,revision:0,promise:undefined as unknown as Promise<OfflineStory>};
 jobs.set(story.id,job);
 job.promise=Promise.resolve().then(async()=>{
  let result=job.latest;
  for(;;){const revision=job.revision;result=await run(job.latest,job.options);
   if(result.memorySyncStatus==="failed"||result.memorySyncStatus==="partial"||revision===job.revision)return result;
   job.latest={...job.latest,syncedSourceMessageIds:result.syncedSourceMessageIds,syncedSourceMessageRevisions:result.syncedSourceMessageRevisions,lastMemorySyncAt:result.lastMemorySyncAt};
  }
 }).finally(()=>{if(jobs.get(story.id)===job)jobs.delete(story.id);});
 return job.promise;
}
