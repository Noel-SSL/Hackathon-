// One drawing per filter, in the same line style as the logo:
// thick rounded strokes in slate with a single orange detail.

const INK = "#2b3a45";
const ACCENT = "#f0894a";
const TINT = "#e4e0d6";

const line = {
  fill: "none",
  stroke: INK,
  strokeWidth: 4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Size() {
  return (
    <>
      <rect x="20" y="30" width="200" height="60" rx="10" {...line} />
      <rect x="20" y="30" width="128" height="60" rx="10" fill={TINT} {...line} stroke={INK} />
      <path
        d="M148 34v52"
        stroke={ACCENT}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="2 9"
      />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4].map((column) => (
          <rect
            key={`${row}-${column}`}
            x={32 + column * 22}
            y={41 + row * 14}
            width="14"
            height="8"
            rx="2.5"
            fill={INK}
          />
        )),
      )}
      {[0, 1, 2].map((row) =>
        [0, 1, 2].map((column) => (
          <rect
            key={`${row}-${column}`}
            x={162 + column * 17}
            y={41 + row * 14}
            width="10"
            height="8"
            rx="2.5"
            fill={INK}
            opacity="0.28"
          />
        )),
      )}
    </>
  );
}

function Material() {
  return (
    <>
      <path d="M38 78 120 104l82-26-82-22z" fill={TINT} {...line} />
      <path d="M38 78v10l82 26 82-26V78" {...line} />
      <path d="M52 44 120 64l68-20-68-18z" {...line} />
      <path d="M52 44v8l68 20 68-20v-8" {...line} />
      <path d="M120 64v8" {...line} />
      <path d="M96 39l48 14" stroke={ACCENT} strokeWidth="4" strokeLinecap="round" />
    </>
  );
}

function Switch() {
  return (
    <>
      <path d="M78 104h84V70H78z" fill={TINT} {...line} />
      <path d="M88 70V52h64v18" {...line} />
      <path
        d="M108 52V26h24v26"
        fill={ACCENT}
        stroke={INK}
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M120 26v-10M110 16h20" {...line} />
      <path d="M96 104v10M144 104v10" {...line} />
      <path d="M114 82h12M114 92h12" {...line} />
    </>
  );
}

function Brand() {
  return (
    <>
      <path
        d="M96 22h54a8 8 0 0 1 8 8v54L112 112a8 8 0 0 1-11 0L66 77a8 8 0 0 1 0-11z"
        fill={TINT}
        {...line}
        transform="rotate(-8 120 64)"
      />
      <circle cx="138" cy="42" r="7" fill={ACCENT} stroke={INK} strokeWidth="4" />
      <path d="M92 68l22 22M106 56l22 22" {...line} />
      <path d="M150 34c18-14 36-6 34 12" {...line} strokeDasharray="1 9" />
    </>
  );
}

function Price() {
  return (
    <>
      <ellipse cx="120" cy="92" rx="52" ry="14" fill={TINT} {...line} />
      <path d="M68 92V78c0 8 23 14 52 14s52-6 52-14v14" {...line} />
      <ellipse cx="120" cy="64" rx="52" ry="14" fill={TINT} {...line} />
      <path d="M68 64V50c0 8 23 14 52 14s52-6 52-14v14" {...line} />
      <ellipse cx="120" cy="36" rx="52" ry="14" fill="#fff" {...line} />
      <path
        d="M120 28v16M127 32c-3-3-14-3-14 2s14 2 14 7-11 5-14 2"
        stroke={ACCENT}
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
    </>
  );
}

function Rating() {
  const star = "M0-17 5-6l12 1.6-9 8.4L10.4 16 0 10l-10.4 6L-8 4-17-4.4-5-6z";
  return (
    <>
      <path
        d="M30 26h180a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8h-74l-16 18-16-18H30a8 8 0 0 1-8-8V34a8 8 0 0 1 8-8z"
        fill={TINT}
        {...line}
      />
      {[0, 1, 2, 3, 4].map((index) => (
        <path
          key={index}
          d={star}
          transform={`translate(${56 + index * 32} 59)`}
          fill={index < 4 ? ACCENT : "none"}
          stroke={INK}
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
      ))}
    </>
  );
}

const DRAWINGS = {
  size: Size,
  material: Material,
  switch: Switch,
  brand: Brand,
  price: Price,
  rating: Rating,
};

export default function PartArt({ part }) {
  const Drawing = DRAWINGS[part];

  return (
    <svg viewBox="0 0 240 128" width="100%" aria-hidden="true">
      <Drawing />
    </svg>
  );
}
