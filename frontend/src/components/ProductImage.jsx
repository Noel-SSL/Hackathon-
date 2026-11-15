import { useState } from "react";
import KeyboardArt from "./KeyboardArt";
import { safeUrl } from "../lib/api";
export default function ProductImage({ keyboard, className, eager = false }) {
  const [failed, setFailed] = useState(false);
  const src = safeUrl(keyboard.image_url);
  return src && !failed ? (
    <img
      className={className}
      src={src}
      alt={keyboard.keyboard_name}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={className}
      role="img"
      aria-label="Product photo unavailable"
    >
      <KeyboardArt variant="office" />
      <span className="image-caption">Product photo unavailable</span>
    </div>
  );
}
