import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { mutate } from "../api";
import { Actions, Badge, Button, DisclosureRow, Field, Heading, MarkdownContent, NoProject } from "../components";
import type { Note } from "../types";

const statusLabels: { [status in NonNullable<Note["status"]>]: string } = {
  open: "정리 중",
  applying: "적용 중",
  done: "정리됨",
  held: "보류",
};
import { useWorkspace } from "../context";
import { NoteExport } from "../note-export";
import { when } from "../metrics";
import { useEditorFocus } from "../use-editor-focus";

export function LearningPage() {
  const { snapshot: s, projectId, busy, perform, ask } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { addButton, savedRow, focusAfterClose } = useEditorFocus(editing);
  useEffect(() => { setEditing(false); setSelectedId(""); setTitle(""); setBody(""); }, [projectId]);
  if (!projectId) return <NoProject />;
  const notes = s.workspace.notes.filter((note) => note.projectId === projectId && note.kind === "learning");
  async function save() {
    let savedId = "";
    const ok = await perform(async () => {
      const result = await mutate({ operation: "note", projectId, kind: "learning", title, body, evidenceIds: [] });
      savedId = result.id ?? "";
    }, "학습 주제를 저장했습니다.");
    if (ok) {
      focusAfterClose.current = "saved";
      setSelectedId(savedId);
      setEditing(false);
      setTitle("");
      setBody("");
    }
  }
  const addAction = !editing && (
    <Button primary ref={addButton} onClick={() => setEditing(true)}><Plus aria-hidden="true" />학습 주제 추가</Button>
  );
  return <>
    <Heading title="학습" sub="배운 내용을 노트로 남기고 다음 작업에 활용하세요."
      action={<div className="inline"><Button onClick={() => ask("현재 요청에서 모호했던 용어의 의미 후보·정확한 개념·근거·더 나은 요청 예시와 적용 과제를 설명해줘.", "learning", s.records.filter((record) => record.role === "user" && record.projectId === projectId).slice(-20).map((record) => record.id))}>AI와 학습 주제 찾기</Button>
        {notes.length > 0 && addAction}</div>} />
    {editing && <section className="panel" aria-label="학습 주제 작성">
      <h2>학습 주제 작성</h2>
      <form className="form-stack spaced" onSubmit={(event) => { event.preventDefault(); if (!busy) void save(); }}>
        <Field label="학습 주제"><input autoFocus required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="예: API 오류 처리" /></Field>
        <Field label="배운 내용과 적용할 일"><textarea required value={body} onChange={(event) => setBody(event.target.value)} placeholder="무엇을 배웠고 어디에 적용할지 적어 주세요." /></Field>
        <Actions>
          <Button disabled={busy} onClick={() => {
            focusAfterClose.current = "add";
            setEditing(false);
          }}>취소</Button>
          <Button primary type="submit" disabled={busy}><Save aria-hidden="true" />학습 주제 저장</Button>
        </Actions>
      </form>
    </section>}
    <section className="note-list" aria-label="학습 노트 목록">
      <div className="section-heading"><h2>학습 노트</h2><span className="small muted">{notes.length}개</span></div>
      {!notes.length && !editing && <div className="empty-list">
        <p className="muted">아직 학습 노트가 없습니다. 배운 내용과 적용할 일을 남겨 보세요.</p>
        <Actions>{addAction}</Actions>
      </div>}
      {notes.map((note) => <DisclosureRow key={note.id} title={note.title} meta={when(note.createdAt)}
        status={<Badge>{statusLabels[note.status ?? "open"]}</Badge>}
        expanded={selectedId === note.id} onToggle={() => setSelectedId(selectedId === note.id ? "" : note.id)}
        buttonRef={selectedId === note.id ? savedRow : undefined}>
          <MarkdownContent text={note.body} />
          {note.originId && (s.workspace.discoveries ?? []).some((d) => d.id === note.originId) && (
            <p className="micro">발견에서 시작: {s.workspace.discoveries?.find((d) => d.id === note.originId)?.title} · 근거 원문 {note.evidenceIds.length}개</p>
          )}
          <label className="inline small">진행 상태
            <select aria-label="학습 진행 상태" disabled={busy} value={note.status ?? "open"}
              onChange={(event) => void perform(() => mutate({ operation: "noteStatus", id: note.id, status: event.target.value as NonNullable<Note["status"]> }), "학습 상태를 바꿨습니다.")}>
              {Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <Actions><Button onClick={() => ask(note.body + "\n이 내용을 내 프로젝트에 적용할 때 무엇을 더 확인해야 할까?", "learning", note.evidenceIds, {}, note.originId)}>추가 질문</Button>
            <Button primary disabled={busy || s.workspace.tasks.some((task) => task.title === note.title && task.projectId === projectId)} onClick={() => void perform(() => mutate({ operation: "addTask", projectId, title: note.title, phase: "학습 적용", originId: note.originId }), "다음 작업에 학습 적용 항목을 추가했습니다.")}>다음 작업에 적용</Button></Actions>
      </DisclosureRow>)}
    </section>
    <NoteExport kind="learning" />
  </>;
}
