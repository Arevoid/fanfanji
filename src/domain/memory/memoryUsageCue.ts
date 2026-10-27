export function memoryUsageCue(channel="conversation"):string{
 if(channel==="diary")return "本人的近期日记已使用此事，不代表已告诉用户；本篇避免重复记录。";
 if(channel.startsWith("offline:"))return "本故事近期已呈现此资料，不代表任何角色在现实中说过；需要时可接续。";
 if(channel.startsWith("group:"))return "当前群的近期实际回复已涉及此事，避免主动重复；群内追问可接续，不扩大知情范围。";
 if(channel.startsWith("public:"))return "近期公开内容已使用此资料，避免重复发布；不代表在私聊中告知。";
 return "近期实际回复已涉及此事，避免主动重复；用户追问时可继续使用。";
}
