import styles from "./Stars.module.css";

// Five stars with a partial fill, e.g. 4.3 fills 86% of the row.
export default function Stars({ rating, count }) {
  if (rating == null) return null;

  const label = count ? `${rating} out of 5 from ${count} ratings` : `${rating} out of 5`;

  return (
    <span className={styles.stars} role="img" aria-label={label}>
      <span className={styles.row}>
        <span className={styles.empty}>★★★★★</span>
        <span className={styles.filled} style={{ width: `${(rating / 5) * 100}%` }}>
          ★★★★★
        </span>
      </span>
      <span className={styles.number}>{rating.toFixed(1)}</span>
      {count ? <span className={styles.count}>({count.toLocaleString()})</span> : null}
    </span>
  );
}
