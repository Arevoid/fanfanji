/** New, fixed cases. Run the Git reference first, then current code with the same provider configuration. */
export const frozenProviderVersion="2026-10-16-v1";
export const frozenProviderExtractions=[
 {id:"E01",operation:"change",previous:"我只养了一只橘猫，它叫芝麻。",source:"我家唯一的橘猫从现在起叫糯米，芝麻这个名字以后不用了。",query:"我家那只橘猫现在叫什么？",answer:"糯米"},
 {id:"E02",operation:"correction",previous:"我只养了一只橘猫，它叫芝麻。",source:"纠正一下，上次我说橘猫叫芝麻是记错了，它一直叫糯米。",query:"我家那只橘猫实际叫什么？",answer:"糯米"},
 {id:"E03",operation:"independent",previous:"我只养了一只橘猫，它叫芝麻。",source:"原来的橘猫还是叫芝麻，最近新来的小狗叫糯米。",query:"原来的那只橘猫叫什么？",answer:"芝麻"},
] as const;
export const frozenProviderReplies=[
 {id:"B01",query:"外面突然打雷了，吓我一跳。",statement:"用户害怕打雷，希望紧张时有人陪伴",kind:"fact",temporalStatus:"present",expected:"陪|怕|紧张|吓|安心|没事|缓",forbidden:"记忆库|User assertions|我记得你",metric:"naturalness"},
 {id:"B02",query:"十七乘以十三是多少？",statement:"用户害怕打雷，希望紧张时有人陪伴",kind:"fact",temporalStatus:"present",expected:"221|二百二十一",forbidden:"打雷|害怕",metric:"irrelevance"},
 {id:"B03",query:"我们约好的明天去天文馆，已经去过了吗？",statement:"我们约好明天去天文馆，目前只是计划，尚未出发",kind:"plan",temporalStatus:"future",expected:"还没|没有|未|明天|计划|约好",forbidden:"已经去过了|我们去过了|参观过了",metric:"temporal_judgment"},
] as const;
