import { CheckCheck, Clock, AlertCircle } from "lucide-react";

// Display helpers shared by the admin complaint list and ticket pages.

export const STATUS_BADGE: Record<string, string> = {
  OPEN:        "badge badge-danger",
  IN_PROGRESS: "badge badge-warning",
  RESOLVED:    "badge badge-success",
};

export const PRIORITY_BADGE: Record<string, string> = {
  URGENT: "badge badge-danger",
  HIGH:   "badge badge-warning",
  NORMAL: "badge badge-gray",
  LOW:    "badge badge-gray",
};

export const STATUS_ICON: Record<string, React.ElementType> = {
  OPEN:        AlertCircle,
  IN_PROGRESS: Clock,
  RESOLVED:    CheckCheck,
};

/** "3d 4h", "5h", "12m" — how long ago `iso` was. */
export function ageOf(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
