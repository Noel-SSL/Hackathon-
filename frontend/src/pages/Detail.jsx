import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import Icon from "../components/Icon";
import ProductImage from "../components/ProductImage";
import ReviewSummary from "../components/ReviewSummary";
import SpecInsights from "../components/SpecInsights";
import Stars from "../components/Stars";
import { priceLabel, request, safeUrl } from "../lib/api";
import styles from "./Detail.module.css";

function specRows(keyboard) {
  const rows = [
    ["size", keyboard.size],
    ["base material", keyboard.built_material],
    ["connection", keyboard.connectivity],
    ["switch type", keyboard.switch_type],
    [
      "hot-swappable",
      keyboard.hot_swappable == null ? null : keyboard.hot_swappable ? "yes" : "no",
    ],
    ["sold as", keyboard.assembly],
    ["weight", keyboard.weight_g ? `${Math.round(keyboard.weight_g)} g` : null],
    ["sold by", keyboard.shop],
  ];
  return rows.filter(([, value]) => value);
}

export default function Detail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const useCase = params.get("use") ?? "";

  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");

    request(`/api/keyboards/${id}`, { signal: controller.signal })
      .then(setData)
      .catch((problem) => {
        if (!controller.signal.aborted) setError(problem.message);
      });

    return () => controller.abort();
  }, [id]);

  if (error) {
    return (
      <main className="page">
        <p className="notice" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className={`page ${styles.layout}`}>
        <div className={`skeleton ${styles.photo}`} />
        <div className={`skeleton ${styles.loadingText}`} />
      </main>
    );
  }

  const { keyboard } = data;
  const buyUrl = safeUrl(keyboard.source_url);

  return (
    <main className="page">
      <button type="button" className={`text-link ${styles.back}`} onClick={() => navigate(-1)}>
        <Icon name="back" size={16} /> back to results
      </button>

      <div className={styles.layout}>
        <div className={styles.photo}>
          <ProductImage keyboard={keyboard} eager />
        </div>

        <div className={styles.info}>
          <p className="eyebrow">{keyboard.brand || keyboard.shop}</p>
          <h1>{keyboard.keyboard_name}</h1>

          <div className={styles.priceRow}>
            <span className={styles.price}>{priceLabel(keyboard)}</span>
            <span className={keyboard.available ? styles.inStock : styles.soldOut}>
              {keyboard.available ? "in stock" : "sold out"}
            </span>
            <Stars rating={keyboard.rating} count={keyboard.review_count} showEmpty />
          </div>

          {buyUrl && (
            <a className={`button ${styles.buy}`} href={buyUrl} target="_blank" rel="noreferrer">
              buy at {keyboard.shop}
              <Icon name="external" />
            </a>
          )}
          <p className={styles.priceNote}>
            Price and stock were read from the shop on{" "}
            {new Date(keyboard.scraped_at).toLocaleDateString()}. Check the shop for today's price.
          </p>

          <dl className={styles.specs}>
            {specRows(keyboard).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {keyboard.switches.length > 0 && (
            <div className={styles.switches}>
              <h2>switch options</h2>
              <ul>
                {keyboard.switches.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          <SpecInsights keyboardId={keyboard.id} useCase={useCase} />
        </div>
      </div>

      <ReviewSummary keyboard={keyboard} webReview={data.web_review} />
    </main>
  );
}
