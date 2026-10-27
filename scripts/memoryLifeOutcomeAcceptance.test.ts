import assert from "node:assert/strict";
import {acceptLifeEpisode,applyLifeContinuation} from "../src/domain/memory/characterContinuity";
const scope={characterId:"a",relationId:"r",userIdentityId:"u",conversationId:"c"};
const plan=acceptLifeEpisode({summary:"准备分类旧书",status:"planned",activity:{goal:"分类旧书",kind:"hobby",steps:["分类旧书","摆放书籍"]}},scope,100,"plan",[])!;
assert.equal(acceptLifeEpisode({summary:"分类旧书失败了",status:"completed"},scope,200,"new-failure",[]),undefined,"a brand-new failed episode cannot be labeled completed either");
for(const summary of ["分类旧书失败了","分类旧书没有完成","分类旧书没成功","没能分类旧书","这次失败了"]){for(const reviewed of [false,true])assert.equal(applyLifeContinuation([plan],{previousEpisodeId:plan.id,summary,status:"progressed",stepIndex:0},scope,200,"bad",[],[],reviewed).length,1,summary);}
assert.equal(applyLifeContinuation([plan],{previousEpisodeId:plan.id,summary:"分类旧书已经完成，摆放书籍失败了",status:"progressed",stepIndex:0},scope,200,"first",[],[],true).length,2,"a separately reviewed completed step is not confused with another step's failure");
const cancelled=applyLifeContinuation([plan],{previousEpisodeId:plan.id,summary:"分类旧书失败了，取消本次计划",status:"cancelled"},scope,200,"cancelled",[]);assert.equal(cancelled.length,2);assert.equal(cancelled[1].status,"cancelled");assert.equal(cancelled[1].activity?.progress,0);
console.log("PASS L06 explicit current-step failure never advances, even under erroneous semantic approval; cancellation remains distinct and other-step failure does not erase a completed current step");
