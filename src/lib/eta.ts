const AVG_CITY_SPEED_KMH = 25;
const PREP_BUFFER_MINUTES = 8;

export function estimateArrivalMinutes(distanceKm: number): number {
  const travelMinutes = (distanceKm / AVG_CITY_SPEED_KMH) * 60;
  return Math.max(1, Math.round(travelMinutes + PREP_BUFFER_MINUTES));
}
