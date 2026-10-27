export type MemoryOrganizationFailureCode="budget"|"missing_api"|"authentication"|"quota"|"model_unavailable"|"provider_unavailable"|"timeout"|"invalid_response"|"incomplete_response"|"source_changed"|"storage"|"busy"|"unknown";
export interface MemoryOrganizationFailure {code:MemoryOrganizationFailureCode;httpStatus?:number}
export function isMemoryOrganizationFailure(input:unknown):input is MemoryOrganizationFailure{
 if(!input||typeof input!=="object"||Array.isArray(input))return false;
 const value=input as MemoryOrganizationFailure;
 return ["budget","missing_api","authentication","quota","model_unavailable","provider_unavailable","timeout","invalid_response","incomplete_response","source_changed","storage","busy","unknown"].includes(value.code)
  &&(value.httpStatus===undefined||Number.isInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599);
}
export function classifyMemoryOrganizationFailure(error:unknown):MemoryOrganizationFailure{
 const value=error&&typeof error==="object"?error as {status?:number;code?:string;message?:string}:{};
 const status=Number.isInteger(value.status)?value.status:undefined;
 const code:MemoryOrganizationFailureCode= /memory_migration_budget_limited/u.test(value.message||"")||value.code==="memory_migration_budget_limited"?"budget":status===401||status===403?"authentication":status===429?"quota":status===404?"model_unavailable":value.code==="timeout"||status===504?"timeout":value.code==="provider_invalid_response"||value.code==="provider_empty"||error instanceof SyntaxError||value.message==="invalid_structure"?"invalid_response":status&&status>=500?"provider_unavailable":/incomplete_|invalid_organization_review/u.test(value.message||"")?"incomplete_response":value.message==="stale_task"||value.message==="stale_organization_target"?"source_changed":value.message==="write_failed"?"storage":"unknown";
 return {code,...(status?{httpStatus:status}:{})};
}
export const memoryOrganizationFailureText=(failure?:MemoryOrganizationFailure)=>{
 const labels:Record<MemoryOrganizationFailureCode,string>={budget:"后台迁移已暂停或达到今天的请求预算，可在迁移用量中调整后继续",missing_api:"尚未配置用于整理记忆的聊天 API",authentication:"整理请求的密钥验证失败",quota:"整理请求被限流或额度不足",model_unavailable:"当前整理模型不可用",provider_unavailable:"模型服务暂时没有完成整理请求",timeout:"模型整理请求超时",invalid_response:"API 已返回内容，但不是有效的记忆整理格式",incomplete_response:"模型返回的整理结果不完整",source_changed:"整理期间来源发生变化，需要重新核对",storage:"整理结果暂时无法保存",busy:"另一项整理任务仍在进行，稍后可以继续",unknown:"本批记忆未能完成整理，原文仍保留"};
 return labels[failure?.code||"unknown"]+(failure?.httpStatus?`（HTTP ${failure.httpStatus}）`:"");
};
