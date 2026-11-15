import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCatalog } from "../context/CatalogContext";
import Icon from "../components/Icon";
import ProductImage from "../components/ProductImage";
import { catalogQuery, money, post, request, withQuery } from "../lib/api";
import styles from "./resultPage.module.css";

const labels = {
  q: "Search",
  size: "Layout",
  material: "Case",
  brand: "Brand / store",
  switch: "Switch",
  min_price: "From",
  max_price: "Up to",
  currency: "Currency",
  connectivity: "Connection",
  assembly: "Assembly",
  switch_type: "Switch type",
  in_stock: "Available only",
  hot_swap: "Hot-swappable",
};
export default function ResultPage() {
  const [params, setParams] = useSearchParams();
  const query = catalogQuery(params);
  const preferences = params.get("preferences") || "";
  const useCase = params.get("use") || "";
  const { health } = useCatalog();
  const [state, setState] = useState({
    loading: true,
    keyboards: [],
    error: "",
  });
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(12);
  const [ai, setAi] = useState({ loading: false, data: null, error: "" });
  const [search, setSearch] = useState(params.get("q") || "");
  const activeRequest = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current?.abort();
    setState({ loading: true, keyboards: [], error: "" });
    setVisible(12);
    setAi({ loading: false, data: null, error: "" });
    request(`/api/keyboards${query ? `?${query}` : ""}`, {
      signal: controller.signal,
    })
      .then((data) =>
        setState({ loading: false, keyboards: data.keyboards, error: "" }),
      )
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ loading: false, keyboards: [], error: error.message });
      });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [query, retry, preferences, useCase]);
  useEffect(() => {
    setSearch(params.get("q") || "");
  }, [params]);
  function change(name, value) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      value ? next.set(name, value) : next.delete(name);
      if (name === "currency" && !value) {
        next.delete("min_price");
        next.delete("max_price");
      }
      return next;
    });
  }
  async function rank() {
    const controller = new AbortController();
    activeRequest.current = controller;
    setAi({ loading: true, data: null, error: "" });
    try {
      const data = await post(
        "/api/recommendations",
        {
          preferences,
          use_case: useCase,
          keyboard_ids: state.keyboards.slice(0, 12).map((item) => item.id),
        },
        controller.signal,
      );
      if (!controller.signal.aborted)
        setAi({ loading: false, data, error: "" });
    } catch (error) {
      if (!controller.signal.aborted)
        setAi({ loading: false, data: null, error: error.message });
    }
  }
  const ranked = ai.data?.recommendations || [];
  const reasons = new Map(ranked.map((item) => [item.id, item]));
  const positions = new Map(ranked.map((item, index) => [item.id, index]));
  const products = [...state.keyboards].sort(
    (a, b) =>
      (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity),
  );
  const activeFilters = Object.entries(labels).filter(([key]) =>
    params.get(key),
  );
  const sortValue = `${params.get("sort") || "keyboard_name"}:${params.get("order") || "asc"}`;
  function sort(value) {
    const [key, order] = value.split(":");
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("sort", key);
      next.set("order", order);
      return next;
    });
  }
  return (
    <main id="main" className="page-shell">
      <Link className="text-link" to={withQuery("/filters", params)}>
        <Icon name="back" size={16} /> Back to your preferences
      </Link>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">The next chapter of your setup</p>
          <h1 className="page-title">Meet your next keyboard.</h1>
          <p className="page-intro">
            A collection shaped by what matters to you.
            <br />
            Take a closer look. Your favorite might be one click away.
          </p>
        </div>
        <Link className="button secondary" to={withQuery("/filters", params)}>
          <Icon name="sliders" size={16} /> Edit preferences
        </Link>
      </div>
      {activeFilters.length > 0 && (
        <div className={styles.filters} aria-label="Selected filters">
          {activeFilters.map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => change(key, "")}
              aria-label={`Remove ${label} filter`}
            >
              <span>
                {label}
                {["in_stock", "hot_swap"].includes(key)
                  ? ""
                  : `: ${params.get(key)}`}
              </span>
              <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}
      <section className={styles.assistant} aria-labelledby="rank-title">
        <div>
          <span className="assistant-label">
            <Icon name="spark" size={17} /> A little help from Gemini
          </span>
          <h2 id="rank-title">Good options. A more personal shortlist.</h2>
          <p>
            {preferences
              ? `Your brief: “${preferences}”`
              : "Let Gemini compare the first 12 matching keyboards and explain the fit and tradeoffs."}
          </p>
          {!health?.gemini_available && (
            <p className={styles.unavailable}>
              Personalized ranking is currently unavailable. Your catalog
              matches are ready to explore below.
            </p>
          )}
        </div>
        <button
          className="button"
          type="button"
          disabled={
            !health?.gemini_available ||
            state.loading ||
            !products.length ||
            ai.loading
          }
          onClick={rank}
        >
          <Icon name="spark" size={16} />
          {ai.loading
            ? "Comparing your matches…"
            : ai.data
              ? "Compare again"
              : "Find my shortlist"}
        </button>
      </section>
      {ai.data && (
        <div className={styles.summary} role="status">
          <Icon name="spark" size={18} />
          <div>
            <strong>Your shortlist, explained</strong>
            <p>{ai.data.summary}</p>
            <span>
              Gemini compared {ranked.length} candidates from the current
              catalog order. Explanations use listing specifications, not
              customer reviews.
            </span>
          </div>
        </div>
      )}
      {ai.error && (
        <p className="notice error" role="alert">
          {ai.error}
        </p>
      )}
      <div className={styles.toolbar}>
        <span aria-live="polite">
          {state.loading
            ? "Finding your matches…"
            : `${products.length} keyboard${products.length === 1 ? "" : "s"} found`}
        </span>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            change("q", search.trim());
          }}
          className={styles.search}
        >
          <label htmlFor="catalog-search">
            <Icon name="search" size={16} />
            <span className={styles.srOnly}>Search keyboards by name</span>
          </label>
          <input
            id="catalog-search"
            type="search"
            value={search}
            placeholder="Search by name"
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" aria-label="Search keyboards">
            <Icon name="arrow" size={15} />
          </button>
        </form>
        <label className={styles.sort}>
          Sort by
          <select value={sortValue} onChange={(e) => sort(e.target.value)}>
            <option value="keyboard_name:asc">Name: A–Z</option>
            <option value="price:asc">Price: low to high</option>
            <option value="price:desc">Price: high to low</option>
            <option value="scraped_at:desc">Recently collected</option>
          </select>
        </label>
      </div>
      {!params.get("currency") &&
        (["price:asc", "price:desc"].includes(sortValue) ||
          params.get("min_price") ||
          params.get("max_price")) && (
          <p className={styles.currencyNote}>
            Prices use their listed currency without conversion. Select a
            currency in preferences to compare like for like.
          </p>
        )}
      {state.loading ? (
        <div className="loading" role="status">
          Finding the keys to your setup…
        </div>
      ) : state.error ? (
        <div className="notice error" role="alert">
          {state.error}
          <button onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : !products.length ? (
        <div className="empty-state">
          <Icon name="search" size={30} />
          <h2>No matches just yet.</h2>
          <p>
            Try a wider budget or leave a preference open.
            <br />
            Your next keyboard might be just outside these filters.
          </p>
          <Link className="button" to={withQuery("/filters", params)}>
            Adjust my preferences <Icon size={16} />
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {products.slice(0, visible).map((keyboard, index) => (
              <article className={styles.card} key={keyboard.id}>
                <Link
                  className={styles.photoLink}
                  to={withQuery(`/keyboards/${keyboard.id}`, params)}
                  aria-label={`View ${keyboard.keyboard_name}`}
                >
                  <div className={styles.photo}>
                    <ProductImage
                      keyboard={keyboard}
                      className={styles.productImage}
                      eager={index < 3}
                    />
                    {reasons.has(keyboard.id) && (
                      <span className={styles.pick}>
                        <Icon name="spark" size={11} /> GEMINI SHORTLIST
                      </span>
                    )}
                    <span className={styles.hover}>
                      Take a closer look <Icon size={15} />
                    </span>
                  </div>
                </Link>
                <div className={styles.cardBody}>
                  <div className={styles.meta}>
                    <span>{keyboard.brand || keyboard.shop}</span>
                    <span>{keyboard.size || "Layout not listed"}</span>
                  </div>
                  <h2>
                    <Link to={withQuery(`/keyboards/${keyboard.id}`, params)}>
                      {keyboard.keyboard_name}
                    </Link>
                  </h2>
                  <div className={styles.priceRow}>
                    <strong>
                      {money(keyboard.price, keyboard.currency)}
                      {keyboard.price_max > keyboard.price && <span> +</span>}
                    </strong>
                    <span
                      className={
                        keyboard.available ? styles.available : styles.soldOut
                      }
                    >
                      {keyboard.available ? "Available" : "Unavailable"}
                    </span>
                  </div>
                  {reasons.has(keyboard.id) ? (
                    <div className={styles.reason}>
                      <p>
                        <Icon name="spark" size={13} />
                        {reasons.get(keyboard.id).reason}
                      </p>
                      <span>
                        Keep in mind: {reasons.get(keyboard.id).tradeoff}
                      </span>
                    </div>
                  ) : (
                    <p className={styles.spec}>
                      {keyboard.built_material || "Case material not listed"}
                      {keyboard.switches?.length
                        ? ` · ${keyboard.switches.length} switch option${keyboard.switches.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
          {visible < products.length && (
            <div className={styles.more}>
              <p>
                Showing {Math.min(visible, products.length)} of{" "}
                {products.length} keyboards
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={() => setVisible((value) => value + 12)}
              >
                A few more possibilities <Icon size={16} />
              </button>
            </div>
          )}
        </>
      )}
      <p className={styles.disclaimer}>
        Prices and availability reflect collected retailer listings. Confirm the
        current details with the seller.
      </p>
    </main>
  );
}
