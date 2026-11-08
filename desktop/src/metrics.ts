import type { RecordItem, Snapshot, Task } from "./types";

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
export function inPeriod(
  date: string | null | undefined,
  timezone: string,
  period: "daily" | "weekly",
  now = new Date(),
): boolean {
  if (!date || !Number.isFinite(Date.parse(date))) return false;
  const key = dateKey(new Date(date), timezone);
  const from = dateKey(new Date(now.getTime() - (period === "weekly" ? 6 : 0) * 86_400_000), timezone);
  return key >= from && key <= dateKey(now, timezone);
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

export interface UsageWeek {
  start: string;
  requests: number;
  vague: number;
  repeated: number;
}
export interface UsageOverview {
  weeks: UsageWeek[];
  heat: number[][];
  recent: number;
  providers: [string, number][];
  projects: [string, number][];
  milestones: { week: number; date: string; text: string }[];
}
export const HEAT_HOURS = ["6–9시", "9–12시", "12–15시", "15–18시", "18–21시", "21–24시", "0–3시", "3–6시"];
const DAY = 86_400_000;
/** "11/2" for a UTC-midnight day number or an ISO date. */
export const shortDate = (day: number | string) => {
  const d = new Date(day);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};
const noteLabels: Record<string, string> = { learning: "학습 메모", rule: "규칙", decision: "결정", research: "조사" };

function localParts(date: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return { day, weekday, hour: Number(parts.hour) };
}

/** Eight Monday-start weeks of human requests, a 4-week weekday × hour grid, and the notes/reviews that happened along the way. */
export function usageOverview(s: Snapshot, now = new Date()): UsageOverview {
  const timezone = s.workspace.settings.timezone;
  const today = localParts(now, timezone);
  const thisWeek = today.day - today.weekday * DAY;
  const firstWeek = thisWeek - 7 * 7 * DAY;
  const weekOf = (date: Date) => {
    const p = localParts(date, timezone);
    return Math.floor((p.day - p.weekday * DAY - firstWeek) / (7 * DAY));
  };
  const weeks: UsageWeek[] = Array.from({ length: 8 }, (_, i) => ({
    start: new Date(firstWeek + i * 7 * DAY).toISOString().slice(0, 10), requests: 0, vague: 0, repeated: 0,
  }));
  const vague = new Set(s.analysis.ambiguousExpressions.map((e) => e.recordId));
  const repeated = new Set(s.analysis.repeatedRequests.flatMap((r) => r.recordIds));
  const byId = new Map(s.records.map((r) => [r.id, r]));
  const ids = s.analysis.requestIds ?? s.records.filter((r) => r.role === "user").map((r) => r.id);
  const heat = Array.from({ length: 7 }, () => Array<number>(HEAT_HOURS.length).fill(0));
  const providers = new Map<string, number>();
  const projects = new Map<string, number>();
  let recent = 0;
  for (const id of ids) {
    const record = byId.get(id);
    const at = record?.occurredAt ? new Date(record.occurredAt) : null;
    if (!record || !at || !Number.isFinite(at.getTime()) || at > now) continue;
    const week = weeks[weekOf(at)];
    if (week) {
      week.requests += 1;
      if (vague.has(id)) week.vague += 1;
      if (repeated.has(id)) week.repeated += 1;
    }
    const p = localParts(at, timezone);
    if (today.day - p.day < 28 * DAY) {
      recent += 1;
      heat[p.weekday][Math.floor(((p.hour + 18) % 24) / 3)] += 1;
      providers.set(record.source.provider, (providers.get(record.source.provider) ?? 0) + 1);
      projects.set(record.projectId, (projects.get(record.projectId) ?? 0) + 1);
    }
  }
  const events = [
    ...s.workspace.notes.filter((n) => noteLabels[n.kind]).map((n) => ({ at: n.createdAt, text: `${noteLabels[n.kind]} 추가 · ${n.title}` })),
    ...(s.workspace.discoveries ?? []).filter((d) => d.status === "accepted").map((d) => ({ at: d.updatedAt, text: `발견 확인 · ${d.title}` })),
  ];
  const milestones = events
    .map((e) => ({ ...e, date: new Date(e.at) }))
    .filter((e) => Number.isFinite(e.date.getTime()) && e.date <= now && weeks[weekOf(e.date)])
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => ({ week: weekOf(e.date), date: shortDate(localParts(e.date, timezone).day), text: e.text }))
    .slice(-4);
  const sorted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return { weeks, heat, recent, providers: sorted(providers), projects: sorted(projects), milestones };
}
