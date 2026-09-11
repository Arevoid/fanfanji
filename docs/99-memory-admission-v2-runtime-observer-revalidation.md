# Stage 4D-11O-R3D — Minimal Runtime Observer Revalidation (blocked)

## Result

本阶段在发送任何聊天消息、创建 Window、触发 extraction 或读取/修改 fixture 之前停止。

Stop code: `R3D_INSTANCE_ALIGNMENT_FAILED`

- Starting HEAD: `f8ee95491680e66a7d04548874c102997df285a4`
- Refactor branch: `refactor/v2-architecture`
- Original stable HEAD: `f515f7408cfe19da145f15a8ddffceae06e608d`
- Readiness: not reached

## Safe observations

The dev server process was running `server.ts` from the refactor worktree. A direct source read from the dev server contained the R3C `installDevApi(force = false)` rebind implementation, `instanceOrdinal`, and the test refresh hook. Therefore the checked-out source and dev server source include the R3C fix.

The actual page at `http://127.0.0.2:3000/` did not expose either `window.__fanfanjiMemoryAdmissionLongEvidence` or `window.__fanfanjiMemoryEvidenceTrace`. The helper ordinal and trace count were therefore unavailable. A fresh diagnostic tab and a page reload produced the same result. No helper/runtime instance equality can be proven, so no runtime action was allowed.

Development logs show that the page registered a Service Worker for `http://127.0.0.2:3000/`. The current `main.tsx` local-development unregister path recognizes `localhost` and `127.0.0.1`, not `127.0.0.2`; this makes stale cached development modules a plausible environment cause for the missing globals. This is an environment diagnosis only, not a production-code change or a claim that fixture data should be cleared.

## Not executed

The following were deliberately not performed: fixture inspection/reset, campaign readback, accumulation, fresh Window, trigger turn, Direct Reply, automatic extraction, `extractNow()`, observer/manual append, Collector export, artifact/reviewer/closure, campaign recompute, or governed reload. No user messages, provider requests, Memory writes, markers, or artifacts were created by R3D.

No R3D HMR window-state comparison or helper/observer/append ordinal comparison is available because alignment failed before Window creation. No R3D trace stages, record count, candidate classification, logical/physical accounting, or post-campaign values can be reported.

## Recovery boundary

R3D requires an environment-level way to load the current dev modules on the existing isolated origin without deleting or resetting the fixture. The next attempt should first establish that the page exposes the current helper and trace API and that helper/runtime ordinals match. Only then may a fresh governed Window and one new trigger be considered. Do not clear the existing fixture, replay R3B, or switch credentials as part of this recovery.

The deterministic R3C test suite had already passed at the preceding commit (`598/598`, lint/build/dependency gate green). R3D introduced no production-code changes and did not rerun the suite after the alignment stop.
