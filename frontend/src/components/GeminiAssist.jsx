import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useCatalog } from "../context/CatalogContext";
import { post } from "../lib/api";
import Icon from "./Icon";
import styles from "./GeminiAssist.module.css";

const EXAMPLES = {
  office: "a quiet aluminum 75% for writing, under $150",
  gaming: "compact with magnetic switches, as cheap as possible",
};

// A shortcut past the filter cards: describe the keyboard in a sentence.
// Gemini returns filters, which are handed to the finder through onFilters
// so the visitor can still change them.
export default function GeminiAssist({ useCase, onFilters }) {
  const { geminiReady } = useCatalog();

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function describe(event) {
    event.preventDefault();
    if (!prompt.trim()) return;

    setBusy(true);
    setError("");
    try {
      const answer = await post("/api/preferences", { prompt, use_case: useCase });
      setResult(answer);
      onFilters(answer.filters);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.assist} aria-label="Let Gemini pick the filters">
      <form className={styles.bar} onSubmit={describe}>
        <span className={styles.spark}>
          <Icon name="spark" size={18} />
        </span>

        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={`or just describe it: “${EXAMPLES[useCase] ?? EXAMPLES.office}”`}
          aria-label="Describe the keyboard you want"
          maxLength={400}
          disabled={!geminiReady || busy}
        />

        <button
          type="submit"
          className="button small"
          disabled={!geminiReady || busy || !prompt.trim()}
        >
          {busy ? "thinking…" : "set filters"}
        </button>
      </form>

      {!geminiReady && (
        <p className={styles.hint}>
          Gemini is off. Add GEMINI_API_KEY to the backend's .env file to describe a keyboard. The
          filters below work without it.
        </p>
      )}

      <AnimatePresence mode="wait">
        {error && (
          <motion.p
            key="error"
            className="notice"
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}

        {!error && result && (
          <motion.div
            key="result"
            className={styles.result}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <p>{result.explanation}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
