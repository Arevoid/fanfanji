/** Opt-in: node scripts/verifyAppointmentInvitationUi.cjs BASE PLAYWRIGHT_MODULE OUTPUT */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.argv[3]?path.resolve(process.argv[3]):'playwright');
const base=process.argv[2]||'http://127.0.0.1:3102',output=path.resolve(process.argv[4]||'appointment-ui-result.json');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'}),page=await context.newPage();let paidRequests=0;
await page.route('**/*',route=>{const url=new URL(route.request().url());if(route.request().method()==='POST'){paidRequests++;return route.abort();}if(url.origin!==new URL(base).origin)return route.abort();return route.continue();});
await page.goto(base);await page.waitForFunction(()=>document.querySelector('#root')?.children.length>0);
async function install(){await page.evaluate(async()=>{
 const React=(await import('/node_modules/.vite/deps/react.js')).default,{createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const {OfflineInvitationCard}=await import('/src/features/chat/components/OfflineInvitationCard.tsx');
 const repository=await import('/src/core/storage/repositories/scheduleRepository.ts');
 const {formatAppointmentLocalTime}=await import('/src/domain/schedule/appointmentConfirmation.ts');
 const {projectAppointmentsToScheduleEntries}=await import('/src/domain/schedule/scheduleProjection.ts');
 document.querySelector('#root').style.display='none';const mount=document.createElement('div');document.body.appendChild(mount);
 const data={store:{schemaVersion:1,appointments:[]},attempts:0,writes:0,fail:0,throwOnce:false,sequence:0};let setCurrent;
 function Fixture(){const [current,set]=React.useState(undefined);setCurrent=set;return current?React.createElement(OfflineInvitationCard,{key:current.id,appointment:current,onSave:updated=>{
   data.attempts++;if(data.throwOnce){data.throwOnce=false;throw Error('synthetic write failure');}if(data.fail){data.fail--;return false;}
   const mutation=repository.upsertAppointment(data.store,updated);if(!mutation.success||!repository.saveScheduleStore(mutation.store).success)return false;
   data.store=mutation.store;data.writes++;set(undefined);return true;
 },onNotice:message=>{data.notice=message;}}):React.createElement('p',null,'已处理');}
 createRoot(mount).render(React.createElement(Fixture));
 window.invitationFixture={reset:(kind='missing')=>{
  const now=Date.now(),future=now+3*86400000;data.future=future;data.attempts=0;data.writes=0;data.fail=0;data.throwOnce=false;
  const proposal={id:'p',proposedBy:'character',proposedAt:now,timePrecision:'undetermined',activity:'咖啡和散步',traveler:'both',status:'active',sourceMessageIds:['source']};
  if(kind==='exact'||kind==='approximate'){proposal.startAt=future;proposal.timePrecision=kind==='exact'?'exact':'afternoon';}
  if(kind==='elapsed'){proposal.startAt=now-60000;proposal.timePrecision='exact';}
  const appointment={id:'a-'+(++data.sequence),schemaVersion:1,relationId:'r',characterId:'c',userIdentityId:'u',title:'咖啡和散步',initiator:'character',mode:kind==='immediate'?'immediate':'scheduled',status:'awaiting_user',proposals:[proposal],currentProposalId:'p',sourceMessageIds:['source'],createdAt:now,updatedAt:now};
  data.store={schemaVersion:1,appointments:[appointment]};repository.saveScheduleStore(data.store);setCurrent(appointment);
 },state:()=>({...data,stored:repository.loadScheduleStore().value,entries:projectAppointmentsToScheduleEntries(data.store.appointments)}),
 fail:throws=>{data.fail=throws?0:1;data.throwOnce=throws;},time:()=>formatAppointmentLocalTime(data.future),
 change:()=>{const current=data.store.appointments[0],updated={...current,updatedAt:current.updatedAt+1,proposals:current.proposals.map(p=>({...p,location:'已重新协商的地点'}))};data.store={...data.store,appointments:[updated]};repository.saveScheduleStore(data.store);setCurrent(updated);}};
 });await page.waitForFunction(()=>window.invitationFixture);}
await install();
const reset=async(kind='missing')=>{await page.evaluate(kind=>window.invitationFixture.reset(kind),kind);await page.getByRole('button',{name:'接受',exact:true}).waitFor();};
const state=()=>page.evaluate(()=>window.invitationFixture.state());
const fill=async()=>{await page.getByLabel('见面时间',{exact:true}).fill(await page.evaluate(()=>window.invitationFixture.time()));await page.getByLabel('见面地点（选填）',{exact:true}).fill('湖边咖啡馆');};
await reset();assert.equal(await page.getByRole('button',{name:'接受',exact:true}).isEnabled(),true);
await page.getByRole('button',{name:'接受',exact:true}).click();await page.getByRole('dialog',{name:'确认见面时间'}).waitFor();assert.equal((await state()).writes,0);
for(const viewport of [{width:390,height:844},{width:375,height:667},{width:844,height:390}]){
 await page.setViewportSize(viewport);const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1);
 assert.ok(Math.abs(bounds.x+bounds.width/2-viewport.width/2)<3);assert.ok(Math.abs(bounds.y+bounds.height/2-viewport.height/2)<3);
 const footer=await page.getByRole('button',{name:'确认接受',exact:true}).boundingBox();assert.ok(footer&&footer.y+footer.height<=viewport.height);
 await page.screenshot({path:output.replace(/\.json$/u,`-${viewport.width}x${viewport.height}.png`)});
}
await page.setViewportSize({width:390,height:844});await fill();await page.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await state()).writes,0);assert.equal((await state()).entries.length,0);
await page.getByRole('button',{name:'接受',exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});assert.equal((await state()).writes,0);
await page.getByRole('button',{name:'接受',exact:true}).click();await fill();await page.evaluate(()=>window.invitationFixture.fail(false));await page.getByRole('button',{name:'确认接受',exact:true}).click();
await page.getByRole('alert').filter({hasText:'保存失败'}).waitFor();assert.equal((await state()).writes,0);assert.equal(await page.getByLabel('见面地点（选填）').inputValue(),'湖边咖啡馆');
await page.getByRole('button',{name:'确认接受',exact:true}).evaluate(button=>{button.click();button.click();});
let s=await state();assert.equal(s.writes,1);assert.equal(s.entries.length,1);assert.equal(s.stored.appointments.length,1);assert.equal(s.stored.appointments[0].status,'confirmed');assert.equal(s.stored.appointments[0].mode,'scheduled');assert.equal(s.stored.appointments[0].proposals[0].status,'superseded');
await page.reload();const persisted=await page.evaluate(async()=>{const repo=await import('/src/core/storage/repositories/scheduleRepository.ts');return repo.loadScheduleStore();});assert.equal(persisted.valid,true);assert.equal(persisted.value.appointments[0].status,'confirmed');
await install();await reset();await page.getByRole('button',{name:'接受',exact:true}).click();await fill();await page.evaluate(()=>window.invitationFixture.change());await page.getByRole('alert').filter({hasText:'邀约已更新'}).waitFor();assert.equal(await page.getByRole('button',{name:'确认接受',exact:true}).isDisabled(),true);assert.equal((await state()).writes,0);await page.getByRole('button',{name:'取消',exact:true}).click();
await reset('exact');const expected=(await state()).future;await page.getByRole('button',{name:'接受',exact:true}).click();s=await state();assert.equal(s.writes,1);assert.equal(s.entries[0].startAt,expected);assert.equal(await page.getByRole('dialog').count(),0);
await reset('immediate');await page.getByRole('button',{name:'接受',exact:true}).click();s=await state();assert.equal(s.writes,1);assert.equal(s.entries[0].timePrecision,'exact');assert.equal(await page.getByRole('dialog').count(),0);
for(const kind of ['approximate','elapsed']){await reset(kind);await page.getByRole('button',{name:'接受',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal((await state()).writes,0);await page.getByRole('button',{name:'取消',exact:true}).click();}
await reset();await page.getByRole('button',{name:'拒绝',exact:true}).click();s=await state();assert.equal(s.stored.appointments[0].status,'declined');assert.equal(s.entries.length,0);
assert.equal(paidRequests,0);
const result={status:'passed',syntheticOnly:true,realProfileOpened:false,paidRequests,checks:['legacy missing-time accept opens picker','phone/small-phone/landscape centered dialog and fixed footer','cancel and Escape produce no calendar write','failed save retains input and retries','double click writes once','confirmed schedule persists across reload','stale proposal cannot confirm','exact time preserved','immediate confirmation remains immediate','approximate and elapsed times require selection','decline produces no calendar event'],scope:'actual production card, domain policies, repository and calendar projection in a fresh browser context; AppChat integration also checked by regression'};
fs.writeFileSync(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
