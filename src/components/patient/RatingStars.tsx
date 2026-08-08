import { Star } from "lucide-react";

export default function RatingStars({
  avgRating,
  totalReviews,
  size = "sm",
}: {
  avgRating: number;
  totalReviews: number;
  size?: "sm" | "md";
}) {
  const starSize = size === "md" ? "w-4 h-4" : "w-3 h-3";
  const rounded = Math.round(avgRating);

  if (totalReviews === 0) {
    return <span className="text-[10px] text-slate-400">No reviews yet</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`${starSize} ${s <= rounded ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}`}
        />
      ))}
      <span className="text-[10px] text-slate-400 ml-1">
        {avgRating.toFixed(1)} ({totalReviews} review{totalReviews === 1 ? "" : "s"})
      </span>
    </div>
  );
}
