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

// The gaming board is drawn with height: every keycap is a stack of slices
// stepping up and to the right, which reads as a tall key once the board tilts.
const KEY_RISE = { x: 4, y: -11 };
const KEY_SLICES = [0, 1 / 3, 2 / 3];
const CASE_SLICES = [5, 4, 3, 2, 1];

// Rainbow position of a key: sweeps left to right, nudged a little per row.
function hueOf(key) {
  return Math.round((key.x / WIDTH) * 300 + key.y * 0.5);
}

function GamingBoard({ accents }) {
  return (
    <svg className={styles.board} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <defs>
        <linearGradient id="kbd-rgb" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={WIDTH} y2="0">
          <stop offset="0" stopColor="#ff2d55" />
          <stop offset="0.2" stopColor="#ffb400" />
          <stop offset="0.4" stopColor="#3dff6e" />
          <stop offset="0.6" stopColor="#00d5ff" />
          <stop offset="0.8" stopColor="#6a5cff" />
          <stop offset="1" stopColor="#ff3df2" />
        </linearGradient>
        <filter id="kbd-underglow" x="-20%" y="-30%" width="140%" height="160%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="kbd-bleed" x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* light spilling onto the desk from under the case */}
      <rect
        className={styles.underglow}
        x="-14"
        y="6"
        width={WIDTH + 14}
        height={HEIGHT + 22}
        rx="30"
        fill="url(#kbd-rgb)"
        filter="url(#kbd-underglow)"
      />

      {/* thick case: stacked slices, then the top face with a lit rim */}
      {CASE_SLICES.map((step) => (
        <rect
          key={step}
          className={styles.caseSide}
          x={-step * 1.4}
          y={step * 3.6}
          width={WIDTH}
          height={HEIGHT}
          rx="22"
        />
      ))}
      <rect className={styles.case} width={WIDTH} height={HEIGHT} rx="22" />
      <rect
        className={styles.rim}
        x="1.5"
        y="1.5"
        width={WIDTH - 3}
        height={HEIGHT - 3}
        rx="20.5"
        stroke="url(#kbd-rgb)"
      />
      <rect
        className={styles.plate}
        x="10"
        y="10"
        width={WIDTH - 20}
        height={HEIGHT - 20}
        rx="14"
        fill="url(#kbd-rgb)"
      />

      {/* per-key backlight bleeding out between the caps */}
      <g filter="url(#kbd-bleed)">
        {KEYS.map((key) => (
          <rect
            key={key.id}
            className={styles.backlight}
            x={key.x - 1.5}
            y={key.y - 1.5}
            width={key.width + 3}
            height={key.height + 3}
            rx="8"
            style={{ "--hue": hueOf(key) }}
          />
        ))}
      </g>

      {KEYS.map((key) => {
        const isAccent = accents.includes(key.id);
        return (
          <g
            key={key.id}
            className={`${styles.key} ${isAccent ? styles.accent : ""}`}
            style={{ "--order": key.order, "--hue": hueOf(key) }}
          >
            {/* translucent walls of the keycap, brighter toward the top */}
            {KEY_SLICES.map((t, index) => (
              <rect
                key={t}
                className={styles[`wall${index}`]}
                x={key.x + KEY_RISE.x * t}
                y={key.y + KEY_RISE.y * t}
                width={key.width}
                height={key.height}
                rx="7"
              />
            ))}
            <g className={styles.cap}>
              <rect
                className={styles.capTop}
                x={key.x + KEY_RISE.x}
                y={key.y + KEY_RISE.y}
                width={key.width}
                height={key.height}
                rx="7"
              />
              <rect
                className={styles.legend}
                x={key.x + KEY_RISE.x + 7}
                y={key.y + KEY_RISE.y + 7}
                width={Math.min(key.width - 14, 11)}
                height="4"
                rx="2"
              />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

export default function KeyboardIllustration({ variant = "office", lifted = false }) {
  const accents = ACCENT_KEYS[variant];

  return (
    <div
      className={`${styles.stage} ${styles[variant]} ${lifted ? styles.lifted : ""}`}
      aria-hidden="true"
    >
      {variant === "gaming" ? (
        <GamingBoard accents={accents} />
      ) : (
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
      )}
    </div>
  );
}
