import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FilterArt } from "../components/KeyboardArt";
import Icon from "../components/Icon";
import { useCatalog } from "../context/CatalogContext";
import { filterKeys, post, withQuery } from "../lib/api";
import styles from "./filterPage.module.css";

function SelectFilter({ name, label, options = [], params, update, disabled }) {
  const value = params.get(name) || "";
  return (
    <select
      id={name}
      name={name}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => update(name, e.target.value)}
    >
      <option value="">Any / help me choose</option>
      {value && !options.includes(value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
function FilterCard({ number, kind, title, note, children }) {
  return (
    <section className={styles.card} aria-labelledby={`card-${kind}`}>
      <div className={styles.cardTop}>
        <span>{number}</span>
        <span>YOUR PREFERENCE</span>
      </div>
      <FilterArt kind={kind} className={styles.illustration} />
      <h2 id={`card-${kind}`}>{title}</h2>
      <p className={styles.note}>{note}</p>
      {children}
    </section>
  );
}
export default function FilterPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { facets, health, loading, error, retry } = useCatalog();
  const [prompt, setPrompt] = useState(params.get("preferences") || "");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [formError, setFormError] = useState("");
  const assistantRequest = useRef(null);
  useEffect(() => () => assistantRequest.current?.abort(), []);
  const useCase = params.get("use") || "";
  const hasBudget = Boolean(params.get("min_price") || params.get("max_price"));
  function update(name, value) {
    setFormError("");
    const next = new URLSearchParams(window.location.search);
    value ? next.set(name, value) : next.delete(name);
    setParams(next, { replace: true });
  }
  async function interpret() {
    const controller = new AbortController();
    assistantRequest.current = controller;
    setBusy(true);
    setAiError("");
    setExplanation("");
    try {
      const data = await post(
        "/api/preferences",
        { prompt: prompt.trim(), use_case: useCase },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(data.filters)) {
            if (filterKeys.includes(key) && value === false) {
              next.delete(key);
              continue;
            }
            if (
              filterKeys.includes(key) &&
              value != null &&
              value !== false &&
              value !== ""
            )
              next.set(key, value === true ? "1" : String(value));
          }
          next.set("preferences", prompt.trim());
          return next;
        },
        { replace: true },
      );
      setExplanation(data.explanation);
    } catch (error) {
      if (!controller.signal.aborted) setAiError(error.message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    const min = params.get("min_price");
    const max = params.get("max_price");
    if (min && max && Number(min) > Number(max)) {
      setFormError(
        "Your minimum price should be lower than your maximum price.",
      );
      return;
    }
    const next = new URLSearchParams(params);
    prompt.trim()
      ? next.set("preferences", prompt.trim())
      : next.delete("preferences");
    navigate(withQuery("/results", next));
  }
  function reset() {
    const next = new URLSearchParams();
    if (useCase) next.set("use", useCase);
    setParams(next, { replace: true });
    setPrompt("");
    setExplanation("");
    setAiError("");
    setFormError("");
  }
  return (
    <main id="main" className="page-shell">
      <div className={styles.steps}>
        <Link to="/">01 &nbsp; Discover</Link>
        <span className={styles.active}>02 &nbsp; Make it yours</span>
        <span>03 &nbsp; Find your fit</span>
      </div>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">A few details make all the difference</p>
          <h1 className="page-title">Let’s find your kind of keys.</h1>
          <p className="page-intro">
            Pick what you love. Skip what you’re not sure about.
            <br />
            There’s no wrong place to start.
          </p>
        </div>
        <div className={styles.mode} aria-label="Primary use">
          {[
            ["office", "Work & everyday"],
            ["gaming", "Gaming & play"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-pressed={useCase === value}
              disabled={busy}
              onClick={() => update("use", useCase === value ? "" : value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <section className={styles.assistant} aria-labelledby="assistant-title">
        <div className={styles.assistantIcon}>
          <Icon name="spark" size={25} />
        </div>
        <div className={styles.assistantBody}>
          <div className={styles.assistantTitle}>
            <h2 id="assistant-title">Not sure where to start? Just tell us.</h2>
            <span className="pill">Powered by Gemini</span>
          </div>
          <p>
            “A compact keyboard under $100 for late-night coding and a little
            gaming.”
          </p>
          <label className={styles.srOnly} htmlFor="preferences">
            Describe your ideal keyboard
          </label>
          <div className={styles.promptRow}>
            <textarea
              id="preferences"
              placeholder="Your desk, your budget, your perfect typing feel…"
              value={prompt}
              maxLength={1000}
              disabled={busy}
              rows={2}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              className="button"
              type="button"
              onClick={interpret}
              disabled={busy || !health?.gemini_available || !prompt.trim()}
            >
              <Icon name="spark" size={16} />
              {busy ? "Finding your preferences…" : "Help me choose"}
            </button>
          </div>
          {!loading && !health?.gemini_available && (
            <p className={styles.assistantHint}>
              The preference assistant is currently unavailable. You can still
              explore with the filters below.
            </p>
          )}
          {explanation && (
            <p className={styles.feedback} role="status">
              <Icon name="check" size={16} />
              {explanation} You can adjust these suggestions below.
            </p>
          )}
          {aiError && (
            <p className={styles.feedback} role="alert">
              {aiError}
            </p>
          )}
        </div>
      </section>
      {["q", "connectivity", "assembly", "switch_type", "hot_swap"].some(
        (key) => params.get(key),
      ) && (
        <div
          className={styles.extraFilters}
          aria-label="Additional preferences"
        >
          {[
            ["q", "Name"],
            ["connectivity", "Connection"],
            ["assembly", "Assembly"],
            ["switch_type", "Switch technology"],
            ["hot_swap", "Hot-swappable"],
          ]
            .filter(([key]) => params.get(key))
            .map(([key, label]) => (
              <button
                type="button"
                key={key}
                disabled={busy}
                onClick={() => update(key, "")}
                aria-label={`Remove ${label} preference`}
              >
                {label}
                {key === "hot_swap" ? "" : `: ${params.get(key)}`}{" "}
                <Icon name="close" size={12} />
              </button>
            ))}
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          We couldn’t load the keyboard catalog. {error}
          <button onClick={retry}>Try again</button>
        </div>
      )}
      {loading && (
        <p className="notice" role="status">
          Loading your keyboard options…
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset
          className={styles.fieldset}
          disabled={busy || loading || Boolean(error)}
        >
          <legend className={styles.srOnly}>Keyboard preferences</legend>
          <div className={styles.grid}>
            <FilterCard
              number="01"
              kind="budget"
              title="Make room in your budget."
              note="A little flexibility, or a firm limit. Your call."
            >
              <div className={styles.prices}>
                <label>
                  From
                  <input
                    type="number"
                    name="min_price"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={params.get("min_price") || ""}
                    onChange={(e) => update("min_price", e.target.value)}
                  />
                </label>
                <span>—</span>
                <label>
                  Up to
                  <input
                    type="number"
                    name="max_price"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                    value={params.get("max_price") || ""}
                    onChange={(e) => update("max_price", e.target.value)}
                  />
                </label>
              </div>
              <label className={styles.smallLabel} htmlFor="currency">
                Currency
                <select
                  id="currency"
                  required={hasBudget}
                  value={params.get("currency") || ""}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  <option value="">
                    {hasBudget ? "Choose a currency" : "Any currency"}
                  </option>
                  {(facets?.currencies || []).map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </label>
              <span className={styles.hint}>
                Prices stay in their listed currency.
              </span>
            </FilterCard>
            <FilterCard
              number="02"
              kind="layout"
              title="Find your footprint."
              note="More room for your mouse, or every key at hand."
            >
              <SelectFilter
                name="size"
                label="Keyboard layout"
                options={facets?.sizes}
                params={params}
                update={update}
              />
              <span className={styles.hint}>
                60–75%: compact · TKL: no number pad · full-size: all keys
              </span>
            </FilterCard>
            <FilterCard
              number="03"
              kind="switch"
              title="It’s all in the feel."
              note="Every press has a personality. Find yours."
            >
              <SelectFilter
                name="switch"
                label="Switch option"
                options={facets?.switches}
                params={params}
                update={update}
              />
              <details className={styles.switchHelp}>
                <summary>New to switches?</summary>
                <p>
                  Linear feels smooth. Tactile has a bump. Clicky adds a
                  distinct click. Noise also depends on the case and keycaps.
                  These options are the switches named in actual listings.
                </p>
              </details>
            </FilterCard>
            <FilterCard
              number="04"
              kind="material"
              title="Built your way."
              note="The case gives your keyboard its foundation."
            >
              <SelectFilter
                name="material"
                label="Case material"
                options={facets?.materials}
                params={params}
                update={update}
              />
              <span className={styles.hint}>
                Case material, rather than keycaps or the plate.
              </span>
            </FilterCard>
            <FilterCard
              number="05"
              kind="brand"
              title="A familiar favorite?"
              note="Stick with a favorite, or meet something new."
            >
              <SelectFilter
                name="brand"
                label="Brand or store"
                options={facets?.brands}
                params={params}
                update={update}
              />
              <span className={styles.hint}>
                Brand, or the retailer when the brand isn’t listed.
              </span>
            </FilterCard>
            <FilterCard
              number="06"
              kind="rating"
              title="A second opinion."
              note="A little reassurance from other keyboard people."
            >
              <label className={styles.srOnly} htmlFor="rating">
                Customer rating
              </label>
              <select id="rating" disabled>
                <option>Customer ratings coming soon</option>
              </select>
              <span className={styles.hint}>
                Our current catalog doesn’t include verified ratings or reviews.
              </span>
            </FilterCard>
          </div>
        </fieldset>
        <div className={styles.bottom}>
          <label className={styles.stock}>
            <input
              type="checkbox"
              disabled={busy}
              checked={params.get("in_stock") === "1"}
              onChange={(e) => update("in_stock", e.target.checked ? "1" : "")}
            />{" "}
            Show available keyboards only
          </label>
          <div className={styles.actions}>
            <button
              className={styles.reset}
              type="button"
              disabled={busy}
              onClick={reset}
            >
              Reset preferences
            </button>
            <button
              className="button"
              type="submit"
              disabled={busy || loading || Boolean(error)}
            >
              Find my keyboards <Icon size={18} />
            </button>
          </div>
        </div>
        {formError && (
          <p className="notice error" role="alert">
            {formError}
          </p>
        )}
      </form>
      <p className={styles.footnote}>
        Work or play is a starting point, not a box. Your preferences do the
        choosing.
      </p>
    </main>
  );
}
