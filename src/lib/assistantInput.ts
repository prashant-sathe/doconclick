// Limits on the Health Assistant conversation a client may send — shared by
// the route's schema (src/lib/schemas.ts) and the chat page, which trims the
// oldest turns to stay inside them.
export const ASSISTANT_MAX_MESSAGES = 40;
export const ASSISTANT_MAX_TOTAL_CHARS = 20000;
export const ASSISTANT_MAX_MESSAGE_CHARS = 4000;

export type AssistantMessage = { role: "user" | "assistant"; content: string };
