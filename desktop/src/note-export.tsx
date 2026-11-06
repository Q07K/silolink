import { useEffect, useRef, useState } from "react";
import { native } from "./api";
import { useWorkspace } from "./context";
import { Actions, Button, MarkdownContent } from "./components";

const kinds: Record<string, string> = { learning: "학습", research: "조사", rule: "규칙", analysis: "분석", decision: "결정" };
export function NoteExport({ kind }: { kind?: string }) {
  const { snapshot, projectId, busy, perform } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setOpen(false); setSelected([]); setPreview(null); setSavedMessage(""); }, [projectId, kind]);
  useEffect(() => { if (open) stepTitle.current?.focus(); }, [open, preview]);
  const notes = snapshot.workspace.notes.filter((note) => note.projectId === projectId && (!kind || note.kind === kind));
  if (!notes.length) return null;
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return <div className="note-export">
    <div className="export-trigger">
      {savedMessage && <span role="status" className="small muted">{savedMessage}</span>}
      <Button ref={trigger} aria-expanded={open} onClick={() => {
        if (open) close();
        else {
          setSavedMessage("");
          setOpen(true);
        }
      }}>노트 내보내기</Button>
    </div>
    {open && <section className="panel spaced" role="region" aria-label="노트 내보내기">
      <h2 ref={stepTitle} tabIndex={-1}>{preview === null ? "내보낼 노트 선택" : "내보내기 미리보기"}</h2>
      {preview === null ? (
        <>
          <p className="small muted">선택한 노트의 내용과 출처를 Markdown 파일로 저장합니다.</p>
          {notes.map((note) => <label key={note.id} className="checkline">
            <input type="checkbox" disabled={busy} aria-label={`${note.title} 내보내기 선택`} checked={selected.includes(note.id)} onChange={(event) => {
              setSelected(event.target.checked ? [...selected, note.id] : selected.filter((id) => id !== note.id));
            }} />
            <span>{note.title}<small>{kinds[note.kind] ?? "노트"}</small></span>
          </label>)}
          <Actions>
            <Button onClick={close}>닫기</Button>
            <Button primary disabled={busy || !selected.length} onClick={() => void perform(async () => {
              const value = await native<{ markdown: string }>("preview_notes", { projectId, noteIds: selected });
              setPreview(value.markdown);
            })}>내보내기 미리보기</Button>
          </Actions>
        </>
      ) : (
        <>
          <p className="small muted">선택한 노트 {selected.length}개</p>
          <MarkdownContent text={preview} />
          <Actions>
            <Button disabled={busy} onClick={() => setPreview(null)}>선택 수정</Button>
            <Button primary disabled={busy} onClick={() => void perform(async () => {
              const result = await native<{ path: string } | null>("export_notes", { projectId, noteIds: selected });
              if (result) {
                setSavedMessage(`노트 ${selected.length}개를 Markdown 파일로 저장했습니다.`);
                setPreview(null);
                close();
              }
            })}>Markdown 파일로 저장</Button>
          </Actions>
        </>
      )}
    </section>}
  </div>;
}
