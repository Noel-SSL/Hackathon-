import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, CircuitBoard, Layers, Ruler, Star, Wallet } from "lucide-react";

import { choose, clearFilter, describeChoice, hasChoice, isSelected } from "../lib/filters";
import Icon from "./Icon";
import styles from "./FilterCard.module.css";

const FILTER_ICONS = {
  size: Ruler,
  material: Layers,
  switch: CircuitBoard,
  brand: BadgeCheck,
  price: Wallet,
  rating: Star,
};

export default function FilterCard({ filter, selection, onChange, note }) {
  const FilterIcon = FILTER_ICONS[filter.id];
  const chosen = hasChoice(filter, selection);
  const matchesPreset = filter.options.some((option) => isSelected(filter, option, selection));

  return (
    <article
      className={`${styles.card} ${chosen ? styles.chosen : ""}`}
      aria-labelledby={`filter-${filter.id}`}
    >
      <header className={styles.header}>
        <div className={styles.art}>
          <FilterIcon size={24} strokeWidth={1.7} aria-hidden="true" />
        </div>

        <div className={styles.heading}>
          <h2 id={`filter-${filter.id}`}>{filter.title}</h2>
          <p>{chosen ? describeChoice(filter, selection) : filter.blurb}</p>
        </div>

        <AnimatePresence>
          {chosen && (
            <motion.span
              className={styles.badge}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
            >
              <Icon name="check" size={14} />
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      <div className={styles.options} role="group" aria-label={filter.title}>
        {filter.options.map((option) => {
          const selected = isSelected(filter, option, selection);

          return (
            <button
              key={option.label}
              type="button"
              className={`${styles.chip} ${selected ? styles.selected : ""}`}
              aria-pressed={selected}
              aria-label={
                filter.id === "rating"
                  ? `${option.value.min_rating} stars${option.value.min_rating < 5 ? " and up" : ""}`
                  : undefined
              }
              onClick={() => onChange(choose(filter, option, selection))}
            >
              {filter.id === "rating" && (
                <Star
                  className={styles.ratingIcon}
                  size={13}
                  fill="currentColor"
                  aria-hidden="true"
                />
              )}
              {option.label}
              {option.hint && <small>{option.hint}</small>}
            </button>
          );
        })}

        {/* A value Gemini picked that is not one of the presets above. */}
        {chosen && !matchesPreset && (
          <button
            type="button"
            className={`${styles.chip} ${styles.selected}`}
            aria-pressed="true"
            onClick={() => onChange(clearFilter(filter, selection))}
          >
            {describeChoice(filter, selection)}
          </button>
        )}
      </div>

      {note && <p className={styles.note}>{note}</p>}
    </article>
  );
}
