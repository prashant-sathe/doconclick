// Starts the appointment-reminder sweep once when the Next.js server boots.
// This app has no separate worker/cron process — it's one long-running
// Node server (Docker on EC2, `output: "standalone"`), so an in-process
// interval is the simplest way to get periodic background work without
// adding new deploy infrastructure. See src/lib/appointmentReminders.ts.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export async function register() {
  // Guard against the Edge runtime (this file is also loaded there) and
  // against `register()` firing more than once — `next dev`'s HMR can
  // re-invoke it without a fresh process.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const g = globalThis as unknown as { __appointmentReminderInterval?: ReturnType<typeof setInterval> };
  if (g.__appointmentReminderInterval) return;

  const { sendDueAppointmentReminders } = await import("@/lib/appointmentReminders");
  g.__appointmentReminderInterval = setInterval(() => {
    sendDueAppointmentReminders().catch((err) => {
      console.error("Appointment reminder sweep failed:", err);
    });
  }, SWEEP_INTERVAL_MS);
}
