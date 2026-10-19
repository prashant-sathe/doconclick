import { JourneyTrackerProvider } from "@/components/JourneyTracker";

// Above every page in this area, so a home-visit journey keeps sharing
// location while the provider moves between screens (see JourneyTracker).
export default function NurseLayout({ children }: { children: React.ReactNode }) {
  return <JourneyTrackerProvider>{children}</JourneyTrackerProvider>;
}
