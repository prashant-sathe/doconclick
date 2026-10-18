import { validateSlotInput, type ClinicSlotLike } from "@/lib/clinicAvailability";
import { isOwnUploadUrl } from "@/lib/s3";

const MAX_NAME = 120;
const MAX_ADDRESS = 300;

export type ClinicFields = {
  name: string | null;
  address: string;
  photoUrl: string | null;
  lat: number;
  lng: number;
  sortOrder: number | undefined;
  slots: ClinicSlotLike[];
};

// Validates the clinic form body shared by POST /api/doctors/me/clinics and
// PATCH /api/doctors/me/clinics/:id: address + a real map location, hours
// (see validateSlotInput) and a photo that we uploaded ourselves
// (POST /api/doctors/me/clinics/photo stores them under doctor-docs/).
// `currentPhotoUrl` (editing): the clinic's existing photo is accepted as-is,
// so a legacy one doesn't block saving other changes.
export function validateClinicInput(
  body: Record<string, unknown>,
  currentPhotoUrl: string | null = null
): { clinic: ClinicFields } | { error: string } {
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!address) return { error: "Address and location are required." };
  if (address.length > MAX_ADDRESS) return { error: `Keep the address under ${MAX_ADDRESS} characters.` };
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (body.lat == null || body.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { error: "Address and location are required." };
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  if (name && name.length > MAX_NAME) return { error: `Keep the clinic name under ${MAX_NAME} characters.` };

  let photoUrl: string | null = null;
  if (body.photoUrl != null && body.photoUrl !== "") {
    if (typeof body.photoUrl !== "string" || (body.photoUrl !== currentPhotoUrl && !isOwnUploadUrl(body.photoUrl, "doctor-docs"))) {
      return { error: "Upload the clinic photo from this page — external image links aren't allowed." };
    }
    photoUrl = body.photoUrl;
  }

  let sortOrder: number | undefined;
  if (body.sortOrder !== undefined) {
    sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000) return { error: "Invalid sort order." };
  }

  const slots = validateSlotInput(body.slots);
  if ("error" in slots) return slots;
  return { clinic: { name, address, photoUrl, lat, lng, sortOrder, slots: slots.slots } };
}
