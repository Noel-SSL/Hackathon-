import styles from "./KeyboardIllustration.module.css";

// A 75% layout, drawn top-down. Each number is a key width in units (1 = one
// regular key); a negative number is a gap of that width.
const ROWS = [
  [1, -0.5, 1, 1, 1, 1, -0.25, 1, 1, 1, 1, -0.25, 1, 1, 1, 1, -0.25, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, -0.25, 1],
  [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, -0.25, 1],
  [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25, -0.25, 1],
  [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75, 1, -0.25, 1],
  [1.25, 1.25, 1.25, 6.25, 1, 1, -0.5, 1, 1, 1],
];

const UNIT = 40;
const GAP = 5;
const PADDING = 20;

// Keys that carry the orange accent: one key for the office board (as in the
// logo), and the WASD cluster for the gaming board.
const ACCENT_KEYS = {
  office: ["1-3"],
  gaming: ["2-2", "3-1", "3-2", "3-3"],
};

function layoutKeys() {
  const keys = [];

  ROWS.forEach((row, rowIndex) => {
    let x = PADDING;
    let column = 0;

    for (const width of row) {
      const size = Math.abs(width) * UNIT;
      if (width > 0) {
        keys.push({
          id: `${rowIndex}-${column}`,
          x,
          y: PADDING + rowIndex * UNIT + (rowIndex > 0 ? 8 : 0),
          width: size - GAP,
          height: UNIT - GAP,
          order: rowIndex + column,
        });
        column += 1;
      }
      x += size;
    }
  });

  return keys;
}

const KEYS = layoutKeys();
const WIDTH = Math.max(...KEYS.map((key) => key.x + key.width)) + PADDING;
const HEIGHT = Math.max(...KEYS.map((key) => key.y + key.height)) + PADDING;

export default function KeyboardIllustration({ variant = "office", lifted = false }) {
  const accents = ACCENT_KEYS[variant];

  return (
    <div
      className={`${styles.stage} ${styles[variant]} ${lifted ? styles.lifted : ""}`}
      aria-hidden="true"
    >
      <svg className={styles.board} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <rect className={styles.case} width={WIDTH} height={HEIGHT} rx="22" />
        <rect
          className={styles.plate}
          x="10"
          y="10"
          width={WIDTH - 20}
          height={HEIGHT - 20}
          rx="14"
        />

        {KEYS.map((key) => (
          <rect
            key={key.id}
            className={`${styles.key} ${accents.includes(key.id) ? styles.accent : ""}`}
            x={key.x}
            y={key.y}
            width={key.width}
            height={key.height}
            rx="7"
            style={{ "--order": key.order }}
          />
        ))}
      </svg>
    </div>
  );
}
