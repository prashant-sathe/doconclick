// An APPROVED nurse who changes what the admin approved her on (council
// number/state, qualification, council/degree/KYC/police documents, or a big
// move of her base location) goes back to PENDING and the admin is notified,
// so the change is re-reviewed. Small base-location corrections are allowed.
import { sendPushToAdmins } from "@/lib/firebaseAdmin";
import { haversine } from "@/lib/geo";

export const RE_REVIEW_FIELDS = ["qualification", "councilRegNo", "councilState"] as const;
/** Base-location moves up to this many km are treated as corrections. */
export const BASE_LOCATION_FREE_KM = 2;

/** True when the new base location is far enough from the old one to need re-review. */
export function baseLocationMovedFar(
  old: { lat: number | null; lng: number | null },
  next: { lat?: number | null; lng?: number | null },
): boolean {
  if (next.lat === undefined || next.lng === undefined) return false;
  if (next.lat === old.lat && next.lng === old.lng) return false;
  if (old.lat == null || old.lng == null || next.lat == null || next.lng == null) return true;
  return haversine(old.lat, old.lng, next.lat, next.lng) >= BASE_LOCATION_FREE_KM;
}

export function notifyAdminNurseReReview(name: string) {
  void sendPushToAdmins({ key: "adminNurseRegistered", values: { name }, url: "/admin/nurses" });
}
