// Matching a server error message against messages/en-IN/errors.json:
// an entry is the English text, with `{name}` where the message varies.

const cache = new Map<string, RegExp>();

/** The regex an English catalog entry matches; `{name}`s become named groups (which may be empty — an "s" suffix often is). */
export function errorPattern(english: string): RegExp {
  let re = cache.get(english);
  if (!re) {
    const src = english
      .split(/(\{[A-Za-z][\w]*\})/)
      .map((part) => {
        const m = part.match(/^\{([A-Za-z][\w]*)\}$/);
        return m ? `(?<${m[1]}>.*?)` : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    re = new RegExp(`^${src}$`, "s");
    cache.set(english, re);
  }
  return re;
}
