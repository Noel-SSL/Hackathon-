import { AnimatePresence, motion } from "motion/react";

import { choose, clearFilter, describeChoice, hasChoice, isSelected } from "../lib/filters";
import Icon from "./Icon";
import PartArt from "./PartArt";
import styles from "./FilterCard.module.css";

export default function FilterCard({ filter, selection, onChange, note }) {
  const chosen = hasChoice(filter, selection);
  const matchesPreset = filter.options.some((option) => isSelected(filter, option, selection));

  return (
    <article className={`${styles.card} ${chosen ? styles.chosen : ""}`}>
      <div className={styles.art}>
        <PartArt part={filter.id} />

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
      </div>

      <header className={styles.header}>
        <h2>{filter.title}</h2>
        <p>{chosen ? describeChoice(filter, selection) : filter.blurb}</p>
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
              onClick={() => onChange(choose(filter, option, selection))}
            >
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
