import { JourneyTrackerProvider } from "@/components/JourneyTracker";
import { AppointmentFeedProvider } from "@/components/AppointmentFeed";

// Above every page in this area, so a home-visit journey keeps sharing
// location while the provider moves between screens (see JourneyTracker),
// and the header and page share one appointments poll (see AppointmentFeed).
export default function NurseLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppointmentFeedProvider roles={["NURSE"]}>
      <JourneyTrackerProvider>{children}</JourneyTrackerProvider>
    </AppointmentFeedProvider>
  );
}
