import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";

import { useCatalog } from "../context/CatalogContext";
import { money, post } from "../lib/api";
import Icon from "./Icon";
import Markdown from "./Markdown";
import Stars from "./Stars";
import styles from "./ChatDrawer.module.css";

const SUGGESTIONS = [
  "what's the cheapest 75% keyboard in stock?",
  "I want something quiet for an open office",
  "compare two wireless boards under $150",
];

// The chatbot (backend/chat.py) only links to keyboards its tools returned,
// and sends those back as cards. Pointing them at our own pages keeps the
// visitor on the site; the shop link is one click further, on that page.
function pagePath(card, useCase) {
  return `/keyboards/${card.id}${useCase ? `?use=${useCase}` : ""}`;
}

function cardFacts(card) {
  return [card.size, card.connectivity, card.in_stock ? "in stock" : "sold out"]
    .filter(Boolean)
    .join(" · ");
}

export default function ChatDrawer({ open, onClose }) {
  const [params] = useSearchParams();
  const { geminiReady } = useCatalog();
  const useCase = params.get("use") ?? "";

  // Messages use the shape chat.py expects for history: { role, content }.
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const scroller = useRef(null);
  const input = useRef(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;

    input.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function send(text) {
    const question = text.trim();
    if (!question || busy) return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages([...messages, { role: "user", content: question }]);
    setDraft("");
    setError("");
    setBusy(true);

    try {
      const answer = await post("/api/chat", { message: question, history });
      setMessages((current) => [
        ...current,
        { role: "assistant", content: answer.reply, keyboards: answer.keyboards },
      ]);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.backdrop}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.aside
            className={styles.drawer}
            role="dialog"
            aria-label="Ask keydex"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className={styles.header}>
              <div>
                <h2>ask keydex</h2>
                <p>Gemini looks things up in the catalog for you.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close chat">
                <Icon name="close" />
              </button>
            </header>

            <div className={styles.messages} ref={scroller}>
              {messages.length === 0 && (
                <div className={styles.intro}>
                  <p>Ask in your own words. Try one of these:</p>
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      disabled={!geminiReady}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  className={`${styles.message} ${styles[message.role]}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className={styles.bubble}>
                    {message.role === "user" ? (
                      message.content
                    ) : (
                      <Markdown
                        text={message.content}
                        internalLinks={Object.fromEntries(
                          (message.keyboards ?? []).map((card) => [
                            card.url,
                            pagePath(card, useCase),
                          ]),
                        )}
                      />
                    )}
                  </div>

                  {message.keyboards?.length > 0 && (
                    <ul className={styles.cards}>
                      {message.keyboards.map((card) => (
                        <li key={card.id}>
                          <Link to={pagePath(card, useCase)} onClick={onClose}>
                            <span className={styles.cardName}>{card.name}</span>
                            <span className={styles.cardMeta}>{cardFacts(card)}</span>
                            <span className={styles.cardPrice}>
                              {money(card.price)}
                              <Stars rating={card.rating} count={card.review_count} />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              ))}

              {busy && (
                <div className={styles.typing} aria-label="Gemini is working">
                  <span />
                  <span />
                  <span />
                </div>
              )}

              {error && (
                <p className="notice" role="alert">
                  {error}
                </p>
              )}
            </div>

            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              <input
                ref={input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  geminiReady ? "ask about any keyboard…" : "gemini is off: add GEMINI_API_KEY"
                }
                aria-label="Your question"
                maxLength={1000}
                disabled={!geminiReady}
              />
              <button
                type="submit"
                disabled={!geminiReady || busy || !draft.trim()}
                aria-label="Send"
              >
                <Icon name="send" />
              </button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
