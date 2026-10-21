import { AppointmentFeedProvider } from "@/components/AppointmentFeed";

// Above every page in this area, so the header's notifications and the page
// share one appointments poll (see AppointmentFeed). Signed-out visitors (the
// public doctor profile, register) don't poll.
export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <AppointmentFeedProvider roles={["PATIENT"]}>{children}</AppointmentFeedProvider>;
}
