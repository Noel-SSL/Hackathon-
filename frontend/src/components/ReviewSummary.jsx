import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { useCatalog } from "../context/CatalogContext";
import { post } from "../lib/api";
import Icon from "./Icon";
import Stars from "./Stars";
import styles from "./ReviewSummary.module.css";

function hostname(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

// What buyers say. There are two sources, in this order:
//
//   1. the shop's own reviews, which the scraper collects and Gemini
//      summarises ahead of time (keyboard.review_summary)
//   2. for keyboards without those, a live lookup where Gemini searches
//      Google and the answer is cached (web_review), with its sources
export default function ReviewSummary({ keyboard, webReview }) {
  const { geminiReady } = useCatalog();
  const hasShopReviews = Boolean(keyboard.review_summary);

  const [web, setWeb] = useState(webReview);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (hasShopReviews || web || !geminiReady) return;

    const controller = new AbortController();
    setStatus("loading");

    post(`/api/keyboards/${keyboard.id}/reviews`, {}, controller.signal)
      .then((data) => {
        setWeb(data.web_review);
        setStatus("idle");
      })
      .catch((problem) => {
        if (controller.signal.aborted) return;
        setMessage(problem.message);
        setStatus("failed");
      });

    return () => controller.abort();
  }, [keyboard.id, geminiReady, hasShopReviews, web]);

  const review = hasShopReviews
    ? {
        summary: keyboard.review_summary,
        praise: keyboard.review_pros,
        complaints: keyboard.review_cons,
        rating: keyboard.rating,
        count: keyboard.review_count,
        ratingSource: keyboard.shop,
      }
    : web && {
        summary: web.summary,
        praise: web.praise,
        complaints: web.complaints,
        rating: web.rating,
        count: web.rating_count,
        ratingSource: web.rating_source,
      };

  return (
    <section className={styles.reviews}>
      <header>
        <p className="eyebrow">customer reviews</p>
        <h2>what buyers say</h2>
        <p className={styles.method}>
          <Icon name="spark" size={14} />
          {hasShopReviews
            ? `Summarised by Gemini from the written reviews on ${keyboard.shop}'s product page.`
            : "Summarised by Gemini from pages it found with Google Search. Every source is linked."}
        </p>
      </header>

      {!review && status === "idle" && (
        <p className={styles.quiet}>
          Review summaries need Gemini. Add GEMINI_API_KEY to the .env file and restart the backend.
        </p>
      )}

      {status === "failed" && <p className={styles.quiet}>{message}</p>}

      {status === "loading" && (
        <div className={styles.loading} aria-live="polite">
          <p>searching google for reviews of this keyboard…</p>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {review && (
        <motion.div
          className={styles.body}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={styles.summary}>
            {review.rating != null && (
              <p className={styles.rating}>
                <Stars rating={review.rating} count={review.count} />
                {review.ratingSource && <span>on {review.ratingSource}</span>}
              </p>
            )}
            <p>{review.summary}</p>
          </div>

          <div className={styles.points}>
            <div>
              <h3>people like</h3>
              <ul>
                {review.praise.length === 0 && <li>nothing mentioned often enough to list</li>}
                {review.praise.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>people mention</h3>
              <ul>
                {review.complaints.length === 0 && <li>no recurring complaints found</li>}
                {review.complaints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          </div>

          {!hasShopReviews && (
            <footer className={styles.sources}>
              <h3>sources</h3>
              <ul>
                {web.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.title || hostname(source.url)}
                      <Icon name="external" size={13} />
                    </a>
                  </li>
                ))}
              </ul>

              {web.queries.length > 0 && (
                <p className={styles.queries}>
                  google searches:{" "}
                  {web.queries.map((query) => (
                    <a
                      key={query}
                      href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {query}
                    </a>
                  ))}
                </p>
              )}
            </footer>
          )}
        </motion.div>
      )}
    </section>
  );
}
