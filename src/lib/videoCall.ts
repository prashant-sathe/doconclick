// How long a patient/doctor waits after payment confirms before the "Join
// Video Call" button unlocks — shared by the server-side gate
// (api/appointments/[id]/video-token) and the client-side countdown, and
// kept in its own file (rather than agora.ts) since it needs to be safe to
// import from client components too.
export const VIDEO_UNLOCK_DELAY_SECONDS = 30;
