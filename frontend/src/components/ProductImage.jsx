import { useState } from "react";

import { safeUrl } from "../lib/api";
import styles from "./ProductImage.module.css";

// Shop photos load from the shops' own CDNs. They fade in once ready, and a
// broken link falls back to a plain tile instead of a broken-image icon.
export default function ProductImage({ keyboard, eager = false }) {
  const [state, setState] = useState("loading");
  const source = safeUrl(keyboard.image_url);

  if (!source || state === "failed") {
    return <div className={styles.missing}>no photo</div>;
  }

  return (
    <img
      className={`${styles.image} ${state === "ready" ? styles.ready : ""}`}
      src={source}
      alt={keyboard.keyboard_name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setState("ready")}
      onError={() => setState("failed")}
    />
  );
}
