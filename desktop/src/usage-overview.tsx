import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "./components";
import { useWorkspace } from "./context";
import { HEAT_HOURS, shortDate, usageOverview } from "./metrics";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const TOOLS: Record<string, [string, string]> = {
  codex: ["Codex", "viz-c1"], "claude-code": ["Claude Code", "viz-c2"], claude: ["Claude Code", "viz-c2"], antigravity: ["Antigravity", "viz-c3"],
};
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function Change({ from, to, unit, since, lowerIsBetter }: { from: number; to: number; unit: string; since: string; lowerIsBetter?: boolean }) {
  const diff = to - from;
  if (!diff) return <span className="viz-delta">{since}와 같아요</span>;
  const Icon = diff > 0 ? ArrowUp : ArrowDown;
  const good = lowerIsBetter === undefined ? false : lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={good ? "viz-delta good" : "viz-delta"}>
      <Icon aria-hidden="true" />{since} {from}{unit}에서 {Math.abs(diff)}{unit === "%" ? "%p" : unit} {diff > 0 ? "늘었어요" : "줄었어요"}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 120, height = 36, max = Math.max(...values, 1), n = values.length - 1;
  const x = (i: number) => 4 + ((width - 8) * i) / n;
  const y = (v: number) => height - 5 - ((height - 10) * v) / max;
  return (
    <svg className="viz viz-spark" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="viz-line-muted" d={values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("")} />
      <circle className="viz-dot" cx={x(n)} cy={y(values[n])} r={4} />
    </svg>
  );
}

function TrendLine({ values, labels, pins }: { values: (number | null)[]; labels: string[]; pins: number[] }) {
  const width = 720, height = 240, pad = { l: 44, r: 56, t: 34, b: 30 };
  const peak = Math.max(...values.map((v) => v ?? 0));
  const step = peak > 40 ? 20 : 10;
  const max = Math.max(step * 2, Math.ceil(peak / step) * step);
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b, n = values.length - 1;
  const x = (i: number) => pad.l + (iw * i) / n;
  const y = (v: number) => pad.t + ih - (ih * v) / max;
  const points = values.flatMap((v, i) => (v === null ? [] : [[i, v] as const]));
  const line = values.map((v, i) => (v === null ? "" : `${i && values[i - 1] !== null ? "L" : "M"}${x(i)},${y(v)}`)).join("");
  const first = points[0];
  const last = points.at(-1);
  return (
    <svg className="viz" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`주별 기준 없이 맡긴 요청 비율: ${labels.map((l, i) => `${l} ${values[i] ?? "요청 없음"}${values[i] === null ? "" : "%"}`).join(", ")}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line className={t ? "viz-grid" : "viz-axis"} x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
          <text className="viz-tick" x={pad.l - 10} y={y(t)} textAnchor="end" dominantBaseline="middle">{t}%</text>
        </g>
      ))}
      {labels.map((l, i) => <text key={l} className={i === n ? "viz-tick strong" : "viz-tick"} x={x(i)} y={height - 8} textAnchor="middle">{l}</text>)}
      {pins.map((week, k) => (
        <g key={week}>
          <line className="viz-guide" x1={x(week)} x2={x(week)} y1={pad.t - 12} y2={y(values[week] ?? 0)} />
          <circle className="viz-pin" cx={x(week)} cy={pad.t - 20} r={9} />
          <text className="viz-pin-text" x={x(week)} y={pad.t - 20} textAnchor="middle" dominantBaseline="central">{k + 1}</text>
        </g>
      ))}
      {first && last && <path className="viz-area" d={`${line}L${x(last[0])},${y(0)}L${x(first[0])},${y(0)}Z`} />}
      <path className="viz-line" d={line} />
      {points.length > 1 && first && <>
        <circle className="viz-dot-muted" cx={x(first[0])} cy={y(first[1])} r={4} />
        <text className="viz-label" x={x(first[0])} y={y(first[1]) - 12} textAnchor="middle">{first[1]}%</text>
      </>}
      {last && <>
        <circle className="viz-dot" cx={x(last[0])} cy={y(last[1])} r={5} />
        <text className="viz-end" x={x(last[0]) + 12} y={y(last[1])} dominantBaseline="middle">{last[1]}%</text>
      </>}
      {values.map((v, i) => (
        <rect key={i} className="viz-hit" x={x(i) - iw / n / 2} y={pad.t} width={iw / n} height={ih}>
          <title>{labels[i]} 주 · {v === null ? "요청 없음" : `${v}%`}</title>
        </rect>
      ))}
    </svg>
  );
}

function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(...heat.flat(), 1);
  const level = (v: number) => (v ? Math.min(5, Math.ceil((v / max) * 5)) : 0);
  const peak = heat.flat().indexOf(max);
  return (
    <figure className="viz-heat">
      <div className="viz-heat-grid" style={{ gridTemplateColumns: `28px repeat(${HEAT_HOURS.length}, minmax(0, 1fr))` }}>
        <span />
        {HEAT_HOURS.map((h) => <span key={h} className="viz-axis-label">{h.replace("시", "")}</span>)}
        {heat.map((row, r) => (
          <div className="viz-heat-row" key={DAYS[r]}>
            <span className="viz-axis-label">{DAYS[r]}</span>
            {row.map((v, c) => (
              <span key={c} className={`viz-cell h${level(v)}`} title={`${DAYS[r]} ${HEAT_HOURS[c]} · ${v}건`}>
                {r * HEAT_HOURS.length + c === peak && v ? v : ""}
              </span>
            ))}
          </div>
        ))}
      </div>
      <figcaption className="viz-scale">
        <span>적음</span>{[0, 1, 2, 3, 4, 5].map((l) => <i key={l} className={`viz-cell h${l}`} />)}<span>많음</span>
        <span className="viz-scale-note">칸 하나 = 최근 4주 동안 그 요일·시간대에 보낸 요청 수</span>
      </figcaption>
    </figure>
  );
}

function ToolShare({ providers }: { providers: [string, number][] }) {
  const total = providers.reduce((t, [, n]) => t + n, 0);
  const tool = (id: string) => TOOLS[id] ?? [id, "viz-c0"];
  return (
    <div className="viz-share">
      <div className="viz-stack" role="img" aria-label={providers.map(([p, n]) => `${tool(p)[0]} ${pct(n, total)}%`).join(", ")}>
        {providers.map(([p, n]) => <span key={p} className={tool(p)[1]} style={{ flexGrow: n }} title={`${tool(p)[0]} ${n}건 · ${pct(n, total)}%`} />)}
      </div>
      <ul className="viz-legend">
        {providers.map(([p, n]) => <li key={p}><i className={tool(p)[1]} />{tool(p)[0]}<strong>{pct(n, total)}%</strong><small>{n}건</small></li>)}
      </ul>
    </div>
  );
}

function ProjectBars({ projects }: { projects: [string, string, number][] }) {
  const max = Math.max(...projects.map(([, , n]) => n), 1);
  const total = projects.reduce((t, [, , n]) => t + n, 0);
  return (
    <ul className="viz-bars">
      {projects.map(([id, name, n]) => (
        <li key={id} title={`${name} ${n}건`}>
          <span>{name}</span>
          <span className="viz-bar-track"><i style={{ width: `${(n / max) * 100}%` }} /></span>
          <strong>{pct(n, total)}%</strong>
        </li>
      ))}
    </ul>
  );
}

/** Home summary: how the user's requests changed over eight weeks and how they use AI tools. */
export function UsageOverview() {
  const { snapshot: s, navigate } = useWorkspace();
  const u = usageOverview(s);
  const labels = u.weeks.map((w, i) => (i === u.weeks.length - 1 ? "이번 주" : shortDate(w.start)));
  const rates = u.weeks.map((w) => (w.requests ? pct(w.vague, w.requests) : null));
  const counted = u.weeks.reduce((t, w) => t + w.requests, 0);
  if (!counted) {
    return (
      <section className="panel usage-empty" aria-label="요청 변화">
        <h2>아직 볼 요청 기록이 없어요</h2>
        <p className="viz-define">프로젝트에서 AI 대화 기록을 가져오면 최근 8주 동안 요청이 어떻게 달라졌는지, 언제 어떤 도구를 쓰는지 여기에 보여요.</p>
        <Button onClick={() => navigate("projects")}>기록 수집 설정</Button>
      </section>
    );
  }
  const week = u.weeks[7];
  const lastWeek = u.weeks[6];
  const firstRate = rates.findIndex((r) => r !== null);
  const lastRate = rates.length - 1 - [...rates].reverse().findIndex((r) => r !== null);
  const pinWeeks = [...new Set(u.milestones.map((m) => m.week))];
  const names = new Map(s.workspace.projects.map((p) => [p.id, p.name]));
  const tiles = [
    ["이번 주 요청", week.requests, lastWeek.requests, u.weeks.map((w) => w.requests), undefined,
      "Codex·Claude Code 대화에서 내가 직접 입력한 요청. 도구가 끼워 넣은 글과 AI 답변은 빼요."],
    ["기준 없이 맡긴 요청", week.vague, lastWeek.vague, u.weeks.map((w) => w.vague), true,
      "기준을 맡긴 표현이 있거나 AI가 되묻고 고쳐 말한 요청 수. 일부러 넓게 맡긴 요청은 빼요."],
    ["반복한 요청", week.repeated, lastWeek.repeated, u.weeks.map((w) => w.repeated), true,
      "앞서 보낸 요청과 같거나 거의 같은 요청 수. 규칙이나 문서로 남기면 줄어요."],
  ] as const;
  return (
    <div className="usage-overview">
      <section className="panel viz-hero" aria-label="요청 변화">
        <div className="viz-hero-side">
          <p className="viz-tile-label">기준 없이 맡긴 요청</p>
          <p className="viz-hero-value">{rates[lastRate] ?? 0}<small>%</small></p>
          {firstRate !== lastRate && <Change from={rates[firstRate] ?? 0} to={rates[lastRate] ?? 0} unit="%" since={`${labels[firstRate]} 주`} lowerIsBetter />}
          <p className="viz-define">‘잘’, ‘알아서’처럼 기준을 맡긴 표현이나, AI의 되물음·정정으로 넓게 맡긴 것으로 보이는 요청의 비율이에요. 일부러 넓게 맡긴 요청은 빼요.</p>
          <p className="viz-define">{labels[lastRate]} 요청 {u.weeks[lastRate].requests}건 중 {u.weeks[lastRate].vague}건</p>
          {u.milestones.length > 0 && (
            <ol className="viz-milestones" aria-label="그동안 남긴 기록">
              {u.milestones.map((m) => <li key={`${m.date}${m.text}`}><span className="viz-pin-key">{pinWeeks.indexOf(m.week) + 1}</span>{m.date} · {m.text}</li>)}
            </ol>
          )}
        </div>
        <TrendLine values={rates} labels={labels} pins={pinWeeks} />
      </section>
      <div className="viz-tiles">
        {tiles.map(([label, value, before, values, lowerIsBetter, define]) => (
          <section className="panel viz-tile" key={label} aria-label={label}>
            <div className="viz-tile-top">
              <div><p className="viz-tile-label">{label}</p><p className="viz-tile-value">{value}<small>건</small></p></div>
              <Sparkline values={[...values]} />
            </div>
            <Change from={before} to={value} unit="건" since="지난주" lowerIsBetter={lowerIsBetter} />
            <p className="viz-define">{define}</p>
          </section>
        ))}
      </div>
      {u.recent > 0 && (
        <section className="panel" aria-label="나의 사용 패턴">
          <div className="viz-section-head"><h2>나의 사용 패턴</h2><span className="viz-define">최근 4주 · 요청 {u.recent}건</span></div>
          <div className="viz-pattern-grid">
            <div><p className="viz-sub">언제 쓰나</p><Heatmap heat={u.heat} /></div>
            <div className="viz-stack-col">
              <div><p className="viz-sub">어떤 도구로</p><ToolShare providers={u.providers} /></div>
              <div><p className="viz-sub">어느 프로젝트에서</p><ProjectBars projects={u.projects.map(([id, n]) => [id, names.get(id) ?? "연결 해제된 프로젝트", n])} /></div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
