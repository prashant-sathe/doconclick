// Validates the admin's nurse-service form (create: name required; edit:
// any subset of fields).
export function parseNurseServiceInput(body: Record<string, unknown>, requireName: boolean):
  | { error: string }
  | { data: Record<string, string | number | boolean | null> } {
  const data: Record<string, string | number | boolean | null> = {};

  if ("name" in body || requireName) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2 || name.length > 80) return { error: "Enter a service name (2–80 characters)." };
    data.name = name;
  }
  if ("description" in body) {
    const d = String(body.description ?? "").trim();
    data.description = d ? d.slice(0, 500) : null;
  }
  if ("durationMinutes" in body) {
    const n = Number(body.durationMinutes);
    if (!Number.isInteger(n) || n < 5 || n > 24 * 60) return { error: "Duration must be between 5 minutes and 24 hours." };
    data.durationMinutes = n;
  }
  if ("suggestedPrice" in body) {
    const n = Number(body.suggestedPrice);
    if (!Number.isFinite(n) || n < 0 || n > 100000) return { error: "Suggested price must be between ₹0 and ₹1,00,000." };
    data.suggestedPrice = Math.round(n);
  }
  if ("requiresPrescription" in body) data.requiresPrescription = Boolean(body.requiresPrescription);
  if ("kind" in body) {
    if (body.kind !== "VISIT" && body.kind !== "SHIFT") return { error: "Invalid service type." };
    data.kind = body.kind;
  }
  if ("isActive" in body) data.isActive = Boolean(body.isActive);
  if ("sortOrder" in body) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n)) return { error: "Invalid order." };
    data.sortOrder = n;
  }
  if (Object.keys(data).length === 0) return { error: "Nothing to update." };
  return { data };
}
