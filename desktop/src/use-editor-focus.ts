import { useEffect, useRef } from "react";

export function useEditorFocus(editing: boolean) {
  const addButton = useRef<HTMLButtonElement>(null);
  const savedRow = useRef<HTMLButtonElement>(null);
  const focusAfterClose = useRef<"add" | "saved" | null>(null);

  useEffect(() => {
    const target = focusAfterClose.current;
    if (editing || !target) return;
    focusAfterClose.current = null;
    const button = target === "saved" ? savedRow.current ?? addButton.current : addButton.current;
    button?.focus();
  }, [editing]);

  return { addButton, savedRow, focusAfterClose };
}
