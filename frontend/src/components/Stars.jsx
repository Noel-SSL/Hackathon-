import { Star } from "lucide-react";

import styles from "./Stars.module.css";

// Each star fills independently, including fractional customer averages.
export default function Stars({ rating, count, showEmpty = false }) {
  const rated =
    typeof rating === "number" && Number.isFinite(rating) && rating >= 0 && rating <= 5;
  if (!rated && !showEmpty) return null;

  const label = rated
    ? count
      ? `${rating} out of 5 from ${count} ${count === 1 ? "rating" : "ratings"}`
      : `${rating} out of 5`
    : count === 0
      ? "No customer reviews yet"
      : "Customer ratings are not available";

  return (
    <span className={styles.stars} role="img" aria-label={label}>
      <span className={styles.row} aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className={styles.star} key={index}>
            <Star className={styles.empty} size={14} strokeWidth={1.7} />
            {rated && (
              <span
                className={styles.filled}
                style={{ width: `${Math.max(0, Math.min(1, rating - index)) * 100}%` }}
              >
                <Star size={14} strokeWidth={1.7} fill="currentColor" />
              </span>
            )}
          </span>
        ))}
      </span>
      {rated ? (
        <>
          <span className={styles.number}>{rating.toFixed(1)}</span>
          {count ? <span className={styles.count}>({count.toLocaleString()})</span> : null}
        </>
      ) : (
        <span className={styles.count}>{count === 0 ? "no reviews yet" : "not rated yet"}</span>
      )}
    </span>
  );
}
