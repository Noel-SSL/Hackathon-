import { useId } from "react";

const ROWS = [
  [
    ["esc", 1],
    ..."1234567890-=".split("").map((key) => [key, 1]),
    ["backspace", 2],
  ],
  [
    ["tab", 1.5],
    ..."QWERTYUIOP[]".split("").map((key) => [key, 1]),
    ["\\", 1.5],
  ],
  [
    ["caps", 1.75],
    ..."ASDFGHJKL;'".split("").map((key) => [key, 1]),
    ["enter", 2.25],
  ],
  [
    ["shift", 2.25],
    ..."ZXCVBNM,./".split("").map((key) => [key, 1]),
    ["shift", 2.75],
  ],
  [
    ["ctrl", 1.25],
    ["win", 1.25],
    ["alt", 1.25],
    ["", 6.25],
    ["alt", 1],
    ["fn", 1],
    ["←", 1],
    ["↓", 1],
    ["→", 1],
  ],
];

/** Original decorative product illustration, with no network image dependency. */
export default function KeyboardArt({
  variant = "office",
  className,
  ...props
}) {
  const id = useId().replace(/:/g, "");
  const gaming = variant === "gaming";
  const palette = gaming
    ? {
        case: "#34325f",
        edge: "#17152f",
        border: "#7871c4",
        key: "#666182",
        bottom: "#36314e",
        legend: "#e7e2ff",
        accent: "#b5a4ff",
        mint: "#9ee9de",
      }
    : {
        case: "#e0d6df",
        edge: "#a79baa",
        border: "#f7eff3",
        key: "#f4efe8",
        bottom: "#c0b7bc",
        legend: "#61566c",
        accent: "#c4b2db",
        mint: "#b5d5c4",
      };

  return (
    <svg
      viewBox="0 0 900 440"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-case`} x1="0" y1="0" x2="0.8" y2="1">
          <stop stopColor={palette.border} />
          <stop offset="0.25" stopColor={palette.case} />
          <stop offset="1" stopColor={palette.case} />
        </linearGradient>
        <linearGradient id={`${id}-key`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={gaming ? "#777193" : "#fffcf6"} />
          <stop offset="1" stopColor={palette.key} />
        </linearGradient>
        <linearGradient id={`${id}-accent`} x1="0" y1="0" x2="0.5" y2="1">
          <stop stopColor={gaming ? "#d2c6ff" : "#dfd0ed"} />
          <stop offset="1" stopColor={palette.accent} />
        </linearGradient>
        <filter
          id={`${id}-shadow`}
          x="-30%"
          y="-60%"
          width="160%"
          height="220%"
        >
          <feGaussianBlur stdDeviation="17" />
        </filter>
        <filter id={`${id}-glow`} x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <ellipse
        cx="450"
        cy="350"
        rx="325"
        ry="33"
        fill="#000018"
        opacity="0.32"
        filter={`url(#${id}-shadow)`}
      />

      <g transform="translate(92 88) rotate(-7 360 135) skewX(-8)">
        {gaming && (
          <rect
            x="1"
            y="29"
            width="759"
            height="265"
            rx="25"
            fill="#9380ff"
            opacity="0.48"
            filter={`url(#${id}-glow)`}
          />
        )}
        <rect
          x="0"
          y="16"
          width="760"
          height="268"
          rx="23"
          fill={palette.edge}
        />
        <path
          d="M23 258 H737 Q759 258 759 237 V261 Q759 283 737 283 H23 Q1 283 1 261 V237 Q1 258 23 258Z"
          fill={gaming ? "#24213d" : "#b0a3b3"}
        />
        <rect
          x="0"
          y="0"
          width="760"
          height="268"
          rx="23"
          fill={`url(#${id}-case)`}
          stroke={palette.border}
          strokeWidth="1.5"
        />
        <rect
          x="17"
          y="23"
          width="726"
          height="230"
          rx="13"
          fill={gaming ? "#24213c" : "#c6bdc7"}
        />
        <path
          d="M28 11 H651"
          stroke={gaming ? "#827aab" : "#fff9fb"}
          strokeWidth="1"
          opacity="0.65"
        />
        {[0, 1, 2].map((light) => (
          <circle
            key={light}
            cx={695 + light * 13}
            cy="12"
            r="2.2"
            fill={light === 0 ? palette.mint : palette.edge}
          />
        ))}

        {ROWS.map((row, rowIndex) => {
          let offset = 25;
          return row.map(([label, units], keyIndex) => {
            const width = units * 47 - 5;
            const x = offset;
            offset += units * 47;
            const y = 31 + rowIndex * 44;
            const accent = label === "esc" || label === "enter" || label === "";
            const mint = gaming && ["W", "A", "S", "D"].includes(label);
            return (
              <g key={`${rowIndex}-${keyIndex}`}>
                <rect
                  x={x}
                  y={y + 5}
                  width={width}
                  height="35"
                  rx="5"
                  fill={
                    accent ? (gaming ? "#6c5c9b" : "#9e8cb4") : palette.bottom
                  }
                />
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height="35"
                  rx="5"
                  fill={
                    mint
                      ? palette.mint
                      : `url(#${id}-${accent ? "accent" : "key"})`
                  }
                />
                <path
                  d={`M${x + 6} ${y + 2} H${x + width - 6}`}
                  stroke="#fff"
                  strokeWidth="0.8"
                  opacity={gaming ? "0.18" : "0.65"}
                />
                <text
                  x={x + (label.length > 1 ? 7 : width / 2)}
                  y={y + 20}
                  textAnchor={label.length > 1 ? "start" : "middle"}
                  fill={mint ? "#34475b" : palette.legend}
                  fontFamily="'DM Sans', sans-serif"
                  fontSize={label.length > 2 ? "8" : "10.5"}
                  fontWeight="500"
                >
                  {label}
                </text>
                {label === "" && (
                  <rect
                    x={x + width / 2 - 20}
                    y={y + 24}
                    width="40"
                    height="1"
                    rx="0.5"
                    fill={palette.legend}
                    opacity="0.22"
                  />
                )}
              </g>
            );
          });
        })}
        <path
          d="M30 274 H730"
          stroke={gaming ? "#aba0ff" : "#f4eaf2"}
          strokeWidth="1.2"
          opacity="0.45"
        />
      </g>
    </svg>
  );
}

function Star({ x, y, size = 1, fill = "#c3b1ef" }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${size})`}
      d="M0 -17 5 -6 17 -5 8 3 10 15 0 9 -10 15 -8 3 -17 -5 -5 -6Z"
      fill={fill}
    />
  );
}

/** Small, static illustrations used above each filter control. */
export function FilterArt({ kind, className }) {
  const id = useId().replace(/:/g, "");
  const lilac = "#bca7ed";
  const mint = "#a1d6c7";
  const cream = "#eee7db";
  return (
    <svg
      viewBox="0 0 360 160"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#e3d8f7" />
          <stop offset="1" stopColor="#aa90d3" />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#d4d1e5" />
          <stop offset="0.5" stopColor="#9691b5" />
          <stop offset="1" stopColor="#bdb7d4" />
        </linearGradient>
      </defs>
      <ellipse cx="180" cy="136" rx="91" ry="8" fill="#020118" opacity="0.28" />

      {kind === "budget" && (
        <g>
          {[0, 1, 2].map((coin) => (
            <g key={coin} transform={`translate(0 ${-coin * 13})`}>
              <path
                d="M115 102 V115 C115 136 200 136 200 115 V102Z"
                fill="#8d75b0"
              />
              <ellipse
                cx="157.5"
                cy="102"
                rx="42.5"
                ry="16"
                fill={coin === 2 ? "#dcc9f1" : lilac}
                stroke="#edddff"
                strokeOpacity="0.35"
              />
            </g>
          ))}
          <g transform="rotate(14 223 78)">
            <path
              d="M191 75 V108 C191 125 249 125 249 108 V75Z"
              fill="#6c9d97"
            />
            <ellipse
              cx="220"
              cy="75"
              rx="29"
              ry="41"
              fill={mint}
              stroke="#c5f1e5"
              strokeWidth="2"
            />
            <text
              x="220"
              y="89"
              textAnchor="middle"
              fill="#4d7c77"
              fontSize="37"
              fontWeight="500"
              fontFamily="'DM Sans', sans-serif"
            >
              $
            </text>
          </g>
          <path
            d="M105 49 H117 M111 43 V55 M262 112 H274 M268 106 V118"
            stroke={cream}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      )}

      {kind === "layout" && (
        <g transform="translate(66 47) rotate(-6 115 45) skewX(-8)">
          <rect y="8" width="230" height="83" rx="10" fill="#75658e" />
          <rect width="230" height="83" rx="10" fill={`url(#${id}-face)`} />
          {[0, 1, 2].map((row) =>
            Array.from({ length: 13 }, (_, column) => (
              <rect
                key={`${row}-${column}`}
                x={12 + column * 16}
                y={11 + row * 17}
                width="13"
                height="13"
                rx="2"
                fill={
                  column === 0 || (row === 2 && column === 12) ? mint : cream
                }
              />
            )),
          )}
          <rect x="12" y="62" width="29" height="12" rx="2" fill={cream} />
          <rect x="46" y="62" width="112" height="12" rx="2" fill={mint} />
          {[0, 1, 2].map((key) => (
            <rect
              key={key}
              x={164 + key * 17}
              y="62"
              width="13"
              height="12"
              rx="2"
              fill={cream}
            />
          ))}
        </g>
      )}

      {kind === "switch" && (
        <g>
          <path d="M135 105 179 86 225 105 181 127Z" fill="#a89bb9" />
          <path d="M135 105 V120 L181 142 V127Z" fill="#82708f" />
          <path d="M181 127 225 105 V120 L181 142Z" fill="#bfb0d0" />
          <path d="M157 104 180 94 203 104 181 114Z" fill="#50445f" />
          <path d="M171 105 V72 M190 105 V72" stroke={cream} strokeWidth="2" />
          <path
            d="M170 79 C193 69 194 82 171 84 C150 88 192 94 191 88"
            fill="none"
            stroke={cream}
            strokeWidth="2"
          />
          <path d="M148 59 179 45 211 59 180 74Z" fill={mint} />
          <path d="M148 59 V74 L180 89 V74Z" fill="#73a899" />
          <path d="M180 74 211 59 V74 L180 89Z" fill="#8bc0b1" />
          <path d="M170 50 V33 L181 28 192 33 V50 L181 55Z" fill="#d5eee5" />
          <path d="M125 36 178 13 234 37 180 62Z" fill={`url(#${id}-face)`} />
          <path d="M125 36 V43 L180 69 V62Z" fill="#967bb9" />
          <path d="M180 62 234 37 V44 L180 69Z" fill={lilac} />
          <path
            d="M145 34 178 20 213 35"
            fill="none"
            stroke="#f0e3ff"
            strokeWidth="1.5"
          />
          <path
            d="M242 62 H253 M247.5 56.5 V67.5"
            stroke={cream}
            strokeLinecap="round"
            opacity="0.65"
          />
        </g>
      )}

      {kind === "material" && (
        <g>
          <path d="M75 105 221 80 286 109 139 137Z" fill="#85749f" />
          <path d="M75 105 V114 L139 145 V137Z" fill="#605075" />
          <path d="M139 137 286 109 V117 L139 145Z" fill="#9b86b8" />
          <path d="M75 76 221 51 286 80 139 108Z" fill={`url(#${id}-metal)`} />
          <path d="M75 76 V84 L139 116 V108Z" fill="#858098" />
          <path d="M139 108 286 80 V88 L139 116Z" fill="#aaa4bd" />
          <path d="M75 47 221 22 286 51 139 79Z" fill="#d9ceea" />
          <path d="M75 47 V56 L139 87 V79Z" fill="#ae9cc6" />
          <path d="M139 79 286 51 V59 L139 87Z" fill="#c6b6db" />
          <path d="M96 47 218 27 264 49 141 72Z" fill="#746386" />
          <path d="M111 48 217 31 249 48 143 66Z" fill="#4c405f" />
          {[0, 1, 2].map((screw) => (
            <circle
              key={screw}
              cx={96 + screw * 79}
              cy={screw === 1 ? 32 : 52}
              r="1.6"
              fill="#f7efff"
            />
          ))}
        </g>
      )}

      {kind === "brand" && (
        <g>
          {[
            { x: 81, y: 61, color: mint, text: "k", angle: -13 },
            { x: 146, y: 36, color: cream, text: "a", angle: 4 },
            { x: 213, y: 64, color: lilac, text: "✦", angle: 14 },
          ].map((cap) => (
            <g
              key={cap.text}
              transform={`rotate(${cap.angle} ${cap.x + 33} ${cap.y + 33})`}
            >
              <rect
                x={cap.x}
                y={cap.y + 8}
                width="65"
                height="61"
                rx="12"
                fill={cap.color}
                opacity="0.55"
              />
              <rect
                x={cap.x}
                y={cap.y}
                width="65"
                height="61"
                rx="12"
                fill={cap.color}
              />
              <rect
                x={cap.x + 7}
                y={cap.y + 6}
                width="51"
                height="43"
                rx="9"
                fill="none"
                stroke="#fff"
                strokeOpacity="0.32"
              />
              <text
                x={cap.x + 32.5}
                y={cap.y + 38}
                textAnchor="middle"
                fontFamily="'DM Sans', sans-serif"
                fontSize="29"
                fill="#645471"
              >
                {cap.text}
              </text>
            </g>
          ))}
        </g>
      )}

      {kind === "rating" && (
        <g>
          <rect x="87" y="38" width="186" height="86" rx="18" fill="#56416e" />
          <rect x="87" y="33" width="186" height="86" rx="18" fill="#c8b4e7" />
          <path d="M105 36 H255" stroke="#f2e5ff" opacity="0.5" />
          <text
            x="180"
            y="70"
            textAnchor="middle"
            fontFamily="'DM Sans', sans-serif"
            fontSize="26"
            fontWeight="600"
            fill="#574169"
          >
            4.5+
          </text>
          {[0, 1, 2, 3, 4].map((star) => (
            <Star
              key={star}
              x={126 + star * 27}
              y={94}
              size={0.55}
              fill={star === 4 ? "#957ab5" : cream}
            />
          ))}
          <Star x={74} y={51} size={0.35} fill={mint} />
          <Star x={292} y={101} size={0.45} fill={mint} />
        </g>
      )}
    </svg>
  );
}
