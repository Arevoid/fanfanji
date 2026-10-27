export interface MemoryReviewFailure { candidateIds:string[]; code:string; }
/** Persist a bounded diagnostic category, never raw provider bodies or credentials. */
export function memoryReviewErrorCode(error:unknown):string {
 if(error instanceof SyntaxError)return "review_invalid_json";
 const message=error instanceof Error?error.message:"";
 const status=message.match(/(?:HTTP|status|code)[^0-9]{0,6}([45][0-9]{2})/iu)?.[1];
 if(status)return `review_http_${status}`;
 if(/timeout|timed out|超时/iu.test(message))return "review_timeout";
 if(/fetch|network|网络|连接/iu.test(message))return "review_network";
 if(/json|schema|format|格式|结构/iu.test(message))return "review_invalid_response";
 return "review_unavailable";
}
export function describeMemoryReviewFailure(code:string):string {
 const status=code.match(/^review_http_([45][0-9]{2})$/u)?.[1];
 if(status)return `复核接口 HTTP ${status}`;
 return ({review_invalid_json:"复核返回了无效 JSON",review_timeout:"复核请求超时",review_network:"复核网络连接失败",review_invalid_response:"复核返回格式不完整",review_unavailable:"复核暂不可用"} as Record<string,string>)[code]||"复核暂未完成";
}
