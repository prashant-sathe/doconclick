import type { ReactNode } from "react";

// Minimal, dependency-free renderer for the light markdown assistant replies
// tend to include (**bold**, *italic*, `code`) — everything else stays plain
// text. Pair with `whitespace-pre-wrap` on the containing element so line
// breaks and "- " bullet lines in the reply still read as separate lines.
export function renderChatText(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  return text
    .split(pattern)
    .filter((part) => part.length > 0)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="bg-slate-100 rounded px-1 py-0.5 text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
}
