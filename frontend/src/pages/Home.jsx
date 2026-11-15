import { useState } from "react";
import { Link } from "react-router-dom";

import Icon from "../components/Icon";
import KeyboardIllustration from "../components/KeyboardIllustration";
import { useCatalog } from "../context/CatalogContext";
import styles from "./Home.module.css";

const SIDES = [
  {
    id: "office",
    number: "01",
    label: "office",
    heading: "programs, emails, drafts.",
    text: "Slim layouts and calm switches for writing, spreadsheets and long calls.",
    cta: "find my office keyboard",
  },
  {
    id: "gaming",
    number: "02",
    label: "gaming",
    heading: "competition, teamwork, precision.",
    text: "Magnetic switches, compact frames and room for the mouse to move.",
    cta: "find my gaming keyboard",
  },
];

export default function Home() {
  // Which half the pointer (or keyboard focus) is on. Null means an even split.
  const [active, setActive] = useState(null);
  const { total } = useCatalog();

  return (
    <main className={styles.home}>
      {SIDES.map((side) => {
        const isActive = active === side.id;
        const isDimmed = active !== null && !isActive;
        const state = isActive ? styles.active : isDimmed ? styles.dimmed : "";

        return (
          <section
            key={side.id}
            className={`${styles.side} ${styles[side.id]} ${state}`}
            onMouseEnter={() => setActive(side.id)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(side.id)}
            onBlur={() => setActive(null)}
          >
            <div className={styles.inner}>
              <p className={styles.label}>
                <span>{side.number}</span>
                {side.label}
              </p>

              <div className={styles.art}>
                <KeyboardIllustration variant={side.id} lifted={isActive} />
              </div>

              <div className={styles.copy}>
                <h1>{side.heading}</h1>

                <div className={styles.reveal}>
                  <p>{side.text}</p>
                  <Link
                    className={`button ${side.id === "gaming" ? "light" : ""}`}
                    to={`/find?use=${side.id}`}
                  >
                    {side.cta}
                    <Icon name="arrow" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <p className={styles.footnote}>
        {total > 0 ? `${total} keyboards from real shops` : "keyboards from real shops"}
        <span>·</span>
        matched with Google Gemini
      </p>
    </main>
  );
}
