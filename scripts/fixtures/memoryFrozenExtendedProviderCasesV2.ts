import {extendedExtractions,extendedReplies} from "./memoryFrozenExtendedProviderCases";
/** Scorer correction only: "我哪会知道/没跟我提过" is an explicit unknown answer.
 * v1 fixture and its failing receipt remain immutable. Secret-forbidden gate unchanged. */
export const extendedV2Version="2026-10-17-v2";
export {extendedExtractions};
export const extendedV2Replies=extendedReplies.map(test=>test.id!=="B05"?test:{...test,expected:"不知道|不清楚|没.*告诉|没有.*告诉|不知|无法|不能|哪会知道|怎么会知道|没.*提过"});
