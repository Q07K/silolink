import { describe, expect, it } from "vitest";
import { durationUnion, recordsInPeriod, usageOverview } from "./metrics";
import { emptySnapshot } from "./test-fixture";
import type { RecordItem, Snapshot } from "./types";

describe("실제 기간과 중복 시간", () => {
  it("겹치는 사람 작업 구간을 두 번 더하지 않는다", () => {
    expect(
      durationUnion([
        [0, 30_000],
        [20_000, 50_000],
        [60_000, 70_000],
      ]),
    ).toBe(60_000);
  });
  it("한국 날짜 경계와 시각 누락을 구별한다", () => {
    const records = [
      { id: "today", occurredAt: "2026-11-01T16:00:00Z" },
      { id: "yesterday", occurredAt: "2026-11-01T14:00:00Z" },
      { id: "unknown", occurredAt: null },
    ] as RecordItem[];
    expect(
      recordsInPeriod(
        records,
        "Asia/Seoul",
        "daily",
        new Date("2026-11-02T01:00:00Z"),
      ).map((r) => r.id),
    ).toEqual(["today"]);
  });
});

describe("요약 화면의 주별 변화와 사용 패턴", () => {
  const record = (id: string, occurredAt: string, provider = "codex", role = "user") =>
    ({ id, revision: id, projectId: "p", role, text: id, occurredAt, observedAt: occurredAt, source: { provider, sessionId: "s", itemId: id } }) as RecordItem;
  const snapshot: Snapshot = {
    ...emptySnapshot,
    workspace: {
      ...emptySnapshot.workspace,
      notes: [{ id: "n", projectId: "p", kind: "rule", title: "버튼 높이", body: "", evidenceIds: [], createdAt: "2026-10-28T01:00:00Z" }],
    },
    records: [
      record("old", "2026-08-01T00:00:00Z"),
      record("lastWeek", "2026-10-26T15:30:00Z", "claude-code"),
      record("monday", "2026-11-02T00:30:00Z"),
      record("tuesdayNight", "2026-11-03T13:30:00Z"),
      record("injected", "2026-11-03T13:31:00Z"),
      record("reply", "2026-11-03T13:32:00Z", "codex", "assistant"),
    ],
    analysis: {
      ...emptySnapshot.analysis,
      requestIds: ["old", "lastWeek", "monday", "tuesdayNight"],
      ambiguousExpressions: [{ recordId: "tuesdayNight", projectId: "p", text: "", phrases: ["잘"], status: "candidate" }],
      repeatedRequests: [{ text: "", count: 2, recordIds: ["monday", "old"], projectIds: ["p"] }],
    },
  };
  const u = usageOverview(snapshot, new Date("2026-11-08T03:00:00Z"));

  it("한국 시간 월요일로 주를 나누고 사람이 보낸 요청만 센다", () => {
    expect(u.weeks.map((w) => w.start)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(u.weeks[7]).toMatchObject({ requests: 2, vague: 1, repeated: 1 });
    expect(u.weeks[6].requests).toBe(1);
    expect(u.weeks.reduce((t, w) => t + w.requests, 0)).toBe(3);
  });
  it("최근 4주 요청을 요일과 3시간 단위로 모으고 도구 비중을 낸다", () => {
    expect(u.recent).toBe(3);
    expect(u.heat[0][1]).toBe(1);
    expect(u.heat[1][5]).toBe(1);
    expect(u.heat[1][6]).toBe(1);
    expect(u.providers).toEqual([["codex", 2], ["claude-code", 1]]);
  });
  it("그동안 남긴 규칙을 해당 주의 계기로 표시한다", () => {
    expect(u.milestones).toEqual([{ week: 6, date: "10/28", text: "규칙 추가 · 버튼 높이" }]);
  });
});
