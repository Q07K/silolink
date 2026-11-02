import { describe, expect, it } from "vitest";
import { durationUnion, recordsInPeriod } from "./metrics";
import type { RecordItem } from "./types";

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
