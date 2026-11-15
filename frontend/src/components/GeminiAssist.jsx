import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useCatalog } from "../context/CatalogContext";
import { post } from "../lib/api";
import { prepareImage } from "../lib/image";
import Icon from "./Icon";
import styles from "./GeminiAssist.module.css";

const EXAMPLES = {
  office: "a quiet aluminum 75% for writing, under $150",
  gaming: "compact with magnetic switches, as cheap as possible",
};

// Two shortcuts past the filter cards: describe the keyboard in a sentence,
// or upload a photo. Either way Gemini returns filters, which are handed to
// the finder through onFilters so the visitor can still change them.
export default function GeminiAssist({ useCase, onFilters }) {
  const { geminiReady } = useCatalog();
  const fileInput = useRef(null);

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  async function run(kind, work) {
    setBusy(kind);
    setError("");
    try {
      const answer = await work();
      setResult(answer);
      onFilters(answer.filters);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy("");
    }
  }

  function describe(event) {
    event.preventDefault();
    if (!prompt.trim()) return;

    run("text", () => post("/api/preferences", { prompt, use_case: useCase }));
  }

  function upload(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    run("photo", async () => {
      const photo = await prepareImage(file);
      const answer = await post("/api/vision", {
        image: photo.image,
        mime_type: photo.mime_type,
        use_case: useCase,
      });
      return { ...answer, preview: photo.preview };
    });
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
          disabled={!geminiReady || Boolean(busy)}
        />

        <button
          type="button"
          className={styles.photo}
          onClick={() => fileInput.current.click()}
          disabled={!geminiReady || Boolean(busy)}
        >
          <Icon name="camera" />
          <span>{busy === "photo" ? "looking…" : "match a photo"}</span>
        </button>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={upload} />

        <button
          type="submit"
          className="button small"
          disabled={!geminiReady || Boolean(busy) || !prompt.trim()}
        >
          {busy === "text" ? "thinking…" : "set filters"}
        </button>
      </form>

      {!geminiReady && (
        <p className={styles.hint}>
          Gemini is off. Add GEMINI_API_KEY to the backend's .env file to describe a keyboard or
          match a photo. The filters below work without it.
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
            {result.preview && <img src={result.preview} alt="Your uploaded photo" />}

            <div>
              {result.observed && (
                <p className={styles.observed}>
                  gemini sees: {result.observed.layout} · {result.observed.case} ·{" "}
                  {result.observed.colors.join(", ")}
                </p>
              )}
              <p>{result.explanation}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
