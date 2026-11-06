/** Match the native title contract without splitting Unicode characters. */
export function titleFromQuestion(question: string, fallback: string): string {
  let title = "";
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const character of question.trim()) {
    const size = encoder.encode(character).length;
    if (bytes + size > 240) break;
    title += character;
    bytes += size;
  }
  return title || fallback;
}
