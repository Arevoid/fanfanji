import assert from "node:assert/strict";
import {createDirectReplyCandidates} from "../src/features/chat/services/directChatService";
import {createRegeneratedReplyCandidates} from "../src/features/chat/services/regenerateService";
import {parseGeminiTextWithTelemetry,parseOpenAiTextWithTelemetry} from "../src/server/textProtocolAdapters";
import {requestDirectChatTurn,generateRegeneratedChatTurn} from "../src/features/chat/controllers/chatGenerationController";
import {buildModelDirectIdentity} from "../src/domain/prompt/modelDirectIdentity";
const text="Hello! Here is a complete English paragraph with punctuation, identity and interoperability. ".repeat(6)+"\n\nA second paragraph stays in the same reply.";
const translation="你好，这是完整段落的中文译文。";
const context={characterId:"synthetic-ai",rawText:text,translationText:translation,preserveProse:true,disableBracketActions:true,keepPeriods:true,createId:(i:number)=>`test-${i}`,currentTime:()=>1};
for(const build of [createDirectReplyCandidates,createRegeneratedReplyCandidates]){
 const result=build(context);
 assert.equal(result.messages.length,1);
 assert.equal(result.messages[0].content,result.cleanedText);
 assert.ok(result.messages[0].content.includes("identity and interoperability"));
 assert.ok(result.messages[0].content.includes("\n\nA second paragraph"));
 assert.equal(result.messages[0].translation,translation);
}
const mismatched=createDirectReplyCandidates({...context,preserveProse:false});
assert.equal(mismatched.messages.length,1,"unequal language splits must not be paired by index");
assert.equal(mismatched.messages[0].translation,translation);
assert.equal(parseGeminiTextWithTelemetry(JSON.stringify({candidates:[{content:{parts:[{thought:true,text:"private reasoning"},{text:"Hello!"}]}}]})).text,"Hello!");
assert.equal(parseOpenAiTextWithTelemetry(JSON.stringify({choices:[{message:{reasoning_content:"private reasoning",content:[{type:"reasoning",text:"hidden"},{type:"text",text:"Hello!"}]}}]})).text,"Hello!");
const prompt={scenario:"direct-chat" as const,message:"你好",history:[],systemInstruction:buildModelDirectIdentity({nickname:"Claude",preferences:""})};
const requestAi=async()=>({text:JSON.stringify({reply:text,translation,innerVoice:{content:"must not appear",emotionalState:"hidden"}})});
const response=await requestDirectChatTurn({prompt,settings:{selectedModel:"gemini-test"} as any,includeInnerVoice:false,requestAi});
assert.equal(response.text,text);assert.equal(response.translation,translation);assert.equal(response.innerVoice,undefined);
const regenerated=await generateRegeneratedChatTurn({prompt:{...prompt,scenario:"regenerate"},settings:{selectedModel:"gemini-test"} as any,requestAi,candidateContext:context});
assert.equal(regenerated.candidates?.messages.length,1);assert.equal(regenerated.candidates?.messages[0].translation,translation);
console.log("PASS model-direct long prose, translation pairing, thought isolation and parsed direct/regenerated replies; synthetic provider only");
