import { useState } from "react";
import { motion } from "motion/react";

import { useCatalog } from "../context/CatalogContext";
import { post } from "../lib/api";
import Icon from "./Icon";
import styles from "./SpecInsights.module.css";

// "Is this right for me?" Gemini reads the listed specs and answers for the
// office or gaming use case the visitor picked on the home page.
export default function SpecInsights({ keyboardId, useCase }) {
  const { geminiReady } = useCatalog();
  const [insights, setInsights] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function explain() {
    setBusy(true);
    setError("");
    try {
      setInsights(await post(`/api/keyboards/${keyboardId}/insights`, { use_case: useCase }));
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  if (!insights) {
    return (
      <div className={styles.prompt}>
        <button
          type="button"
          className="button ghost"
          onClick={explain}
          disabled={!geminiReady || busy}
        >
          <Icon name="spark" size={16} />
          {busy ? "reading the specs…" : `is this right for ${useCase || "me"}?`}
        </button>
        {!geminiReady && <p>Needs Gemini. Add GEMINI_API_KEY to the backend.</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <motion.section
      className={styles.insights}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className={styles.tag}>
        <Icon name="spark" size={14} /> gemini on the specs
      </p>
      <p>{insights.summary}</p>

      <div className={styles.columns}>
        <ul className={styles.pros}>
          {insights.pros.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <ul className={styles.cons}>
          {insights.cons.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
}
