import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AppointmentDetailSheet from "../src/components/schedule/AppointmentDetailSheet";
import ScheduleEventCard from "../src/components/schedule/ScheduleEventCard";
import type { Appointment, ScheduleEntry } from "../src/domain/schedule/scheduleTypes";
import {
  filterScheduleEntries,
  formatProposalSummary,
  formatScheduleTime,
  SCHEDULE_FILTERS,
} from "../src/features/schedule/schedulePresentation";

const startAt = new Date(2026, 7, 16, 9, 0).getTime();
const appointment: Appointment = {
  id: "appointment-a",
  schemaVersion: 1,
  relationId: "relation-a",
  characterId: "character-a",
  userIdentityId: "identity-a",
  title: "与范千见面",
  initiator: "character",
  mode: "scheduled",
  status: "confirmed",
  proposals: [
    { id: "saturday", proposedBy: "character", proposedAt: 1, startAt: new Date(2026, 7, 15, 15).getTime(), timePrecision: "afternoon", activity: "一起吃饭", location: "市中心", traveler: "character", status: "superseded", sourceMessageIds: ["m1"] },
    { id: "sunday", proposedBy: "user", proposedAt: 2, startAt, timePrecision: "morning", activity: "一起吃饭", location: "市中心", traveler: "character", transport: "乘车", status: "active", sourceMessageIds: ["m2"] },
  ],
  currentProposalId: "sunday",
  sourceMessageIds: ["m1", "m2"],
  confirmedAt: 3,
  createdAt: 1,
  updatedAt: 3,
};
const entry: ScheduleEntry = {
  id: "schedule:appointment-a",
  schemaVersion: 1,
  category: "appointment",
  appointmentId: appointment.id,
  relationId: appointment.relationId,
  characterId: appointment.characterId,
  userIdentityId: appointment.userIdentityId,
  title: appointment.title,
  status: "confirmed",
  dateKey: "2026-08-16",
  startAt,
  timePrecision: "morning",
  activity: "一起吃饭",
  location: "市中心",
  traveler: "character",
  createdAt: 1,
  updatedAt: 3,
};

assert.deepEqual(SCHEDULE_FILTERS.map((item) => item.label), ["待见面", "进行中", "历史", "全部"]);
assert.deepEqual(filterScheduleEntries([entry, { ...entry, id: "history", status: "completed" }], "upcoming").map((item) => item.id), [entry.id]);
assert.deepEqual(filterScheduleEntries([entry, { ...entry, id: "active", status: "in_progress" }], "active").map((item) => item.id), ["active"]);
assert.equal(formatScheduleTime(entry), "上午");
assert.match(formatProposalSummary(appointment.proposals[1]), /8月16日 周日 · 上午 · 一起吃饭 · 市中心 · 对方前往 · 乘车/);

const card = renderToStaticMarkup(<ScheduleEventCard entry={entry} characterName="范千" characterAvatar="avatar.png" onOpen={() => undefined} />);
assert.match(card, /与范千见面/);
assert.match(card, /已确认/);
assert.match(card, /一起吃饭 · 市中心/);

const detail = renderToStaticMarkup(<AppointmentDetailSheet appointment={appointment} entry={entry} characterName="范千" onClose={() => undefined} onOpenChat={() => undefined} />);
assert.match(detail, /约定过程/);
assert.match(detail, /范千提出/);
assert.match(detail, /你提出修改/);
assert.match(detail, /已被修改/);
assert.match(detail, /当前方案/);
assert.match(detail, /返回关联聊天/);

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const scheduleSource = readFileSync(new URL("../src/components/AppSchedule.tsx", import.meta.url), "utf8");
assert.match(appSource, /appointments=\{scheduleStore\.appointments\}/);
assert.match(appSource, /setActiveChatRelationId\(relationId\)[\s\S]*setActiveApp\("chat"\)/);
assert.match(scheduleSource, /SCHEDULE_STATUS_META\[entry\.status\]\.dotClass/);
assert.match(scheduleSource, /aria-label="日程状态筛选"/);
assert.doesNotMatch(scheduleSource, /添加日程|经期|待办/);

console.log("PASS schedule V1 filters, status visuals, appointment details, negotiation history, and chat navigation");
