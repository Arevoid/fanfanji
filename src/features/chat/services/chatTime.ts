export const getScheduledContactTime = (charMsgs: any[], _settingsName: string) => {
  if (!charMsgs || charMsgs.length === 0) return null;

  // Scan recent messages from the end (last 15 messages)
  const recentMsgs = charMsgs.slice(-15);
  for (let i = recentMsgs.length - 1; i >= 0; i--) {
    const msg = recentMsgs[i];
    if (msg.isOffline || msg.isNarration) continue;

    const content = msg.content || "";

    // Check various patterns
    const generalSoonRegex = /(等会|待会|等一下|稍后|稍後|等会儿|待會|一会儿|一會儿|待会儿|待會兒)/;
    const halfHourRegex = /(半小时|半個小时|半个小时|半h|半小時)/;
    const oneHourRegex = /(一小时|一个小时|一個小時|一小時)/;
    const twoHoursRegex = /(两小时|两个小时|兩個小時|兩小時)/;

    // Check for "20分后", "20分後", "20分钟后" etc.
    const numericRegex = /(\d+(?:\.\d+)?)\s*(分钟|分|小时|h|m|mins?|hours?|分|後|后|小時)(后|後|之后|之內|内)?/i;

    let minutes = 0;
    let found = false;
    let matchedText = "";

    if (numericRegex.test(content)) {
      const match = content.match(numericRegex);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = match[2].toLowerCase();

        // Ensure there is some indicator that it's a future relative time
        const hasFutureIndicator = content.includes("后") || content.includes("後") || content.includes("内") || content.includes("內") || /后|後|内|內|after|in/i.test(match[3] || "") || /联系|联络|聊|见|说|来|找/i.test(content);

        if (hasFutureIndicator) {
          if (unit.includes("小时") || unit.includes("小时") || unit.includes("hour") || unit === "h") {
            minutes = num * 60;
          } else {
            minutes = num;
          }
          found = true;
          matchedText = match[0];
        }
      }
    }

    if (!found && halfHourRegex.test(content)) {
      minutes = 30;
      found = true;
      matchedText = content.match(halfHourRegex)?.[0] || "";
    } else if (!found && oneHourRegex.test(content)) {
      minutes = 60;
      found = true;
      matchedText = content.match(oneHourRegex)?.[0] || "";
    } else if (!found && twoHoursRegex.test(content)) {
      minutes = 120;
      found = true;
      matchedText = content.match(twoHoursRegex)?.[0] || "";
    } else if (!found && generalSoonRegex.test(content)) {
      minutes = 15;
      found = true;
      matchedText = content.match(generalSoonRegex)?.[0] || "";
    }

    if (found && minutes > 0) {
      return {
        msgId: msg.id,
        timestamp: msg.timestamp,
        triggerTime: msg.timestamp + minutes * 60 * 1000,
        durationMinutes: minutes,
        text: matchedText,
      };
    }
  }
  return null;
};

export const formatWeChatTimestamp = (timestamp: number): string => {
  const now = new Date();
  const date = new Date(timestamp);

  const currentYear = now.getFullYear();
  const msgYear = date.getFullYear();

  // Hours and minutes formatted with leading zero
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  // Calculate midnights for today and yesterday
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayMidnight = todayMidnight - 24 * 60 * 60 * 1000;
  const sevenDaysAgoMidnight = todayMidnight - 7 * 24 * 60 * 60 * 1000;

  if (timestamp >= todayMidnight) {
    // Today: only HH:mm
    return timeStr;
  } else if (timestamp >= yesterdayMidnight) {
    // Yesterday: 昨天 HH:mm
    return `昨天 ${timeStr}`;
  } else if (timestamp >= sevenDaysAgoMidnight) {
    // 1~7 days: 星期X HH:mm
    const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    const dayOfWeek = days[date.getDay()];
    return `${dayOfWeek} ${timeStr}`;
  } else if (msgYear === currentYear) {
    // Same year, more than 7 days: X月X日 HH:mm
    return `${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
  } else {
    // Cross year: YYYY年X月X日 HH:mm
    return `${msgYear}年${date.getMonth() + 1}月${date.getDate()}日 ${timeStr}`;
  }
};
