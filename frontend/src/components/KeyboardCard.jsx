import { Link } from "react-router-dom";

import { priceLabel } from "../lib/api";
import Icon from "./Icon";
import ProductImage from "./ProductImage";
import Stars from "./Stars";
import styles from "./KeyboardCard.module.css";

function quickFacts(keyboard) {
  const switches = keyboard.switches ?? [];
  const facts = [
    ["size", keyboard.size],
    ["case", keyboard.built_material],
    ["switches", switches.length > 2 ? `${switches.length} options` : switches.join(", ")],
    ["stock", keyboard.available ? "in stock" : "sold out"],
  ];
  return facts.filter(([, value]) => value);
}

// `pick` is set when Gemini has ranked the results:
// { rank, reason, tradeoff }.
export default function KeyboardCard({ keyboard, useCase, pick }) {
  const link = `/keyboards/${keyboard.id}${useCase ? `?use=${useCase}` : ""}`;

  return (
    <Link to={link} className={styles.card}>
      <div className={styles.photo}>
        <ProductImage keyboard={keyboard} />

        {pick && <span className={styles.rank}>{pick.rank}</span>}

        {/* Quick look: slides up over the photo on hover or keyboard focus. */}
        <div className={styles.quickLook}>
          <dl>
            {quickFacts(keyboard).map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <span className={styles.open}>
            full details <Icon name="arrow" size={15} />
          </span>
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.brand}>{keyboard.brand || keyboard.shop}</p>
        <h3>{keyboard.keyboard_name}</h3>

        <div className={styles.meta}>
          <span className={styles.price}>{priceLabel(keyboard)}</span>
          <Stars rating={keyboard.rating} count={keyboard.review_count} />
        </div>

        {pick && (
          <div className={styles.pick}>
            <p>{pick.reason}</p>
            <p className={styles.tradeoff}>{pick.tradeoff}</p>
          </div>
        )}
      </div>
    </Link>
  );
}
