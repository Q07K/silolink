import type { RecordItem, Task } from "./types";

export function durationUnion(intervals: [number, number][]): number {
  const sorted = intervals
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((a, b) => a[0] - b[0]);
  let total = 0,
    start = 0,
    end = 0;
  sorted.forEach(([a, b], i) => {
    if (i === 0) {
      start = a;
      end = b;
    } else if (a <= end) end = Math.max(end, b);
    else {
      total += end - start;
      start = a;
      end = b;
    }
  });
  return total + end - start;
}
export function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function recordsInPeriod(
  records: RecordItem[],
  timezone: string,
  period: "daily" | "weekly",
  now = new Date(),
): RecordItem[] {
  const today = dateKey(now, timezone);
  const first = new Date(
    now.getTime() - (period === "weekly" ? 6 : 0) * 86_400_000,
  );
  const from = dateKey(first, timezone);
  return records.filter((r) => {
    if (!r.occurredAt) return false;
    const date = new Date(r.occurredAt);
    if (!Number.isFinite(date.getTime())) return false;
    const key = dateKey(date, timezone);
    return key >= from && key <= today;
  });
}
export function taskMilliseconds(task: Task, now = Date.now()): number {
  return durationUnion(
    task.spans.map((s) => [
      Date.parse(s.startedAt),
      s.endedAt ? Date.parse(s.endedAt) : now,
    ]),
  );
}
export function duration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`
    : seconds >= 60
      ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초`
      : `${seconds}초`;
}
export function when(date: string | null, timezone = "Asia/Seoul"): string {
  if (!date || !Number.isFinite(Date.parse(date))) return "시각 근거 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
