import { useState } from "react";
import { Button } from "./components";

const LIMIT = 40;

/** Edits the delegation phrase dictionary: switch built-in phrases off and add the user's own. */
export function DelegationPhrases({ defaults, added, removed, onChange }: {
  defaults: string[];
  added: string[];
  removed: string[];
  onChange: (added: string[], removed: string[]) => void;
}) {
  const [phrase, setPhrase] = useState("");
  const next = phrase.trim();
  const known = defaults.includes(next) || added.includes(next);
  const add = () => {
    if (!next || next.length > LIMIT || known) return;
    onChange([...added, next], removed);
    setPhrase("");
  };
  return (
    <>
      <div className="form-row">
        <div>
          <strong>기본 위임 표현</strong>
          <p className="small muted">요청에 이 표현이 있으면 기준을 맡긴 요청 후보로 보여 줍니다. 요청에 #넓게 또는 #탐색을 적으면 그 요청은 뺍니다.</p>
        </div>
      </div>
      {defaults.map((p) => {
        const off = removed.includes(p);
        return (
          <div className="checkline" key={p}>
            <span>{p}{off && <small>빼 둠</small>}</span>
            <Button quiet aria-label={`${p} ${off ? "다시 쓰기" : "빼기"}`}
              onClick={() => onChange(added, off ? removed.filter((x) => x !== p) : [...removed, p])}>
              {off ? "다시 쓰기" : "빼기"}
            </Button>
          </div>
        );
      })}
      <div className="form-row spaced">
        <div><strong>추가한 표현</strong></div>
      </div>
      {added.length ? added.map((p) => (
        <div className="checkline" key={p}>
          <span>{p}</span>
          <Button quiet aria-label={`${p} 삭제`} onClick={() => onChange(added.filter((x) => x !== p), removed)}>삭제</Button>
        </div>
      )) : <p className="small muted">아직 추가한 표현이 없습니다.</p>}
      <div className="inline spaced">
        <label className="form-field">
          <span>표현 추가</span>
          <input value={phrase} maxLength={LIMIT} onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        </label>
        <Button disabled={!next || known} onClick={add}>추가</Button>
      </div>
    </>
  );
}
