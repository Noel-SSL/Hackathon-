import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useCatalog } from "../context/CatalogContext";
import { post } from "../lib/api";
import Icon from "./Icon";
import styles from "./GeminiRanker.module.css";

// Sends the keyboards on screen to Gemini and gets back an order, with one
// reason and one tradeoff for each. The cards then move into that order.
export default function GeminiRanker({ keyboards, useCase, ranking, onRanked }) {
  const { geminiReady } = useCatalog();
  const [preferences, setPreferences] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function rank(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const answer = await post("/api/recommendations", {
        preferences,
        use_case: useCase,
        keyboard_ids: keyboards.map((keyboard) => keyboard.id),
      });
      onRanked(answer);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.ranker}>
      <form onSubmit={rank}>
        <span className={styles.spark}>
          <Icon name="spark" size={18} />
        </span>

        <input
          value={preferences}
          onChange={(event) => setPreferences(event.target.value)}
          placeholder="what matters most to you? e.g. “I type all day and travel a lot”"
          aria-label="What matters most to you"
          maxLength={400}
          disabled={!geminiReady || busy}
        />

        <button type="submit" className="button small" disabled={!geminiReady || busy}>
          {busy ? "ranking…" : `rank ${keyboards.length} with gemini`}
        </button>
      </form>

      {!geminiReady && (
        <p className={styles.off}>
          Gemini is off. Add GEMINI_API_KEY to the backend to rank results.
        </p>
      )}

      <AnimatePresence>
        {(error || ranking) && (
          <motion.p
            className={error ? "notice" : styles.summary}
            role={error ? "alert" : undefined}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {error || ranking.summary}
          </motion.p>
        )}
      </AnimatePresence>
    </section>
  );
}
