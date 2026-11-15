import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import ProductImage from "../components/ProductImage";
import { useCatalog } from "../context/CatalogContext";
import { money, post, request, safeUrl, withQuery } from "../lib/api";
import styles from "./descPage.module.css";
export default function DescPage() {
  const { keyboardId } = useParams();
  const [params] = useSearchParams();
  const { health } = useCatalog();
  const [state, setState] = useState({
    loading: true,
    keyboard: null,
    error: "",
  });
  const [retry, setRetry] = useState(0);
  const [insights, setInsights] = useState({
    loading: false,
    data: null,
    error: "",
  });
  const assistantRequest = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, keyboard: null, error: "" });
    setInsights({ loading: false, data: null, error: "" });
    request(`/api/keyboards/${encodeURIComponent(keyboardId)}`, {
      signal: controller.signal,
    })
      .then((data) =>
        setState({ loading: false, keyboard: data.keyboard, error: "" }),
      )
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ loading: false, keyboard: null, error: error.message });
      });
    return () => {
      controller.abort();
      assistantRequest.current?.abort();
    };
  }, [keyboardId, retry]);
  async function explain() {
    const controller = new AbortController();
    assistantRequest.current = controller;
    setInsights({ loading: true, data: null, error: "" });
    try {
      const data = await post(
        `/api/keyboards/${keyboardId}/insights`,
        {
          preferences: params.get("preferences") || "",
          use_case: params.get("use") || "",
        },
        controller.signal,
      );
      if (!controller.signal.aborted)
        setInsights({ loading: false, data, error: "" });
    } catch (error) {
      if (!controller.signal.aborted)
        setInsights({ loading: false, data: null, error: error.message });
    }
  }
  const keyboard = state.keyboard;
  if (state.loading)
    return (
      <main id="main" className="page-shell">
        <div className="loading" role="status">
          A closer look at your keyboard…
        </div>
      </main>
    );
  if (state.error)
    return (
      <main id="main" className="page-shell">
        <Link className="text-link" to={withQuery("/results", params)}>
          <Icon name="back" size={16} /> Back to results
        </Link>
        <div className="notice error" role="alert">
          {state.error}
          <button onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      </main>
    );
  const shopUrl = safeUrl(keyboard.source_url);
  const specs = [
    ["Layout", keyboard.size],
    ["Case material", keyboard.built_material],
    ["Brand / store", keyboard.brand || keyboard.shop],
    ["Connectivity", keyboard.connectivity],
    ["Assembly", keyboard.assembly],
    ["Switch technology", keyboard.switch_type],
    [
      "Hot-swappable",
      keyboard.hot_swappable == null
        ? null
        : keyboard.hot_swappable
          ? "Yes"
          : "No",
    ],
    [
      "Weight",
      keyboard.weight_g
        ? `${keyboard.weight_g} g${keyboard.weight_source === "shipping" ? " (shipping weight)" : ""}`
        : null,
    ],
  ];
  return (
    <main id="main" className="page-shell">
      <Link className="text-link" to={withQuery("/results", params)}>
        <Icon name="back" size={16} /> Back to your matches
      </Link>
      <div className={styles.hero}>
        <div className={styles.gallery}>
          <span className={styles.galleryLabel}>A CLOSER LOOK</span>
          <ProductImage
            key={keyboard.id}
            keyboard={keyboard}
            className={styles.productImage}
            eager
          />
          <span className={styles.galleryCaption}>
            Product image from {keyboard.shop}
          </span>
        </div>
        <div className={styles.overview}>
          <p className="eyebrow">
            {keyboard.brand || keyboard.shop} / {keyboard.size || "Keyboard"}
          </p>
          <h1>{keyboard.keyboard_name}</h1>
          <div className={styles.tags}>
            {keyboard.size && <span className="pill">{keyboard.size}</span>}
            {keyboard.built_material && (
              <span className="pill">{keyboard.built_material}</span>
            )}
            {keyboard.assembly && (
              <span className="pill">{keyboard.assembly}</span>
            )}
          </div>
          <div className={styles.price}>
            {money(keyboard.price, keyboard.currency)}
            {keyboard.price_max > keyboard.price && (
              <span> – {money(keyboard.price_max, keyboard.currency)}</span>
            )}
          </div>
          <span
            className={
              keyboard.available ? styles.available : styles.unavailable
            }
          >
            {keyboard.available
              ? "Listed as available"
              : "Listed as unavailable"}
          </span>
          <p className={styles.description}>
            Your setup deserves a closer look. Explore the listed specifications
            below, then visit the seller to choose your configuration.
          </p>
          {shopUrl ? (
            <a
              className="button"
              href={shopUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View at {keyboard.shop} <Icon name="external" size={16} />
            </a>
          ) : (
            <p className="notice">
              A retailer link isn’t available for this keyboard.
            </p>
          )}
          <p className={styles.priceNote}>
            Prices vary by configuration. Confirm current price, availability,
            and included parts with the retailer.
          </p>
          {keyboard.brand_source === "store" && (
            <p className={styles.priceNote}>
              The catalog lists the retailer; the manufacturer wasn’t specified
              separately.
            </p>
          )}
        </div>
      </div>
      <div className={styles.content}>
        <section className={styles.specs} aria-labelledby="spec-title">
          <p className="eyebrow">The details that matter</p>
          <h2 id="spec-title">Under the keycaps.</h2>
          <dl>
            {specs.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "Not listed"}</dd>
              </div>
            ))}
          </dl>
          <h3>Listed switch options</h3>
          {keyboard.switches?.length ? (
            <div className={styles.switches}>
              {keyboard.switches.map((name, i) => (
                <span className="pill" key={`${name}-${i}`}>
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.muted}>
              Switch options aren’t listed. Check whether this configuration
              includes switches.
            </p>
          )}
        </section>
        <div className={styles.side}>
          <section className={styles.insights} aria-labelledby="insight-title">
            <span className="assistant-label">
              <Icon name="spark" size={17} /> A little help from Gemini
            </span>
            <h2 id="insight-title">What does it mean for you?</h2>
            <p>
              Turn the specifications into a clearer picture of the strengths,
              tradeoffs, and details worth checking.
            </p>
            {insights.data ? (
              <div className={styles.insightResult} role="status">
                <p>{insights.data.summary}</p>
                <h3>Worth a look</h3>
                <ul>
                  {insights.data.pros.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
                <h3>Keep in mind</h3>
                <ul>
                  {insights.data.cons.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
                <small>
                  Based on catalog specifications, not customer reviews.
                </small>
              </div>
            ) : (
              <>
                <button
                  className="button secondary"
                  disabled={!health?.gemini_available || insights.loading}
                  onClick={explain}
                >
                  <Icon name="spark" size={16} />
                  {insights.loading
                    ? "Reading the details…"
                    : "Explain this keyboard"}
                </button>
                {!health?.gemini_available && (
                  <p className={styles.aiHint}>
                    The assistant is currently unavailable. The specifications
                    are still here to explore.
                  </p>
                )}
              </>
            )}
            {insights.error && (
              <p className="notice error" role="alert">
                {insights.error}
              </p>
            )}
          </section>
          <section className={styles.reviews} aria-labelledby="reviews-title">
            <span className={styles.reviewIcon} aria-hidden="true">
              ✦
            </span>
            <h2 id="reviews-title">The word from other desks.</h2>
            <p>
              Customer reviews aren’t in our catalog yet. When verified review
              text is available, this is where you’ll find the recurring praises
              and tradeoffs.
            </p>
            {shopUrl && (
              <a
                className="text-link"
                href={shopUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Check the retailer for reviews{" "}
                <Icon name="external" size={13} />
              </a>
            )}
          </section>
        </div>
      </div>
      <div className={styles.source}>
        <span>
          Listing collected{" "}
          {keyboard.scraped_at && !Number.isNaN(Date.parse(keyboard.scraped_at))
            ? new Date(keyboard.scraped_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "at an unknown date"}{" "}
          · Source: {keyboard.shop}
        </span>
        <Link className="text-link" to={withQuery("/filters", params)}>
          Looking for a different feel? <Icon size={15} />
        </Link>
      </div>
    </main>
  );
}
