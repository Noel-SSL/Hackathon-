// The keydex mark, redrawn as SVG from the brand files so it stays sharp
// and can switch to white on the midnight half of the home page.
export default function Logo({ tone = "dark", wordmark = true }) {
  const ink = tone === "light" ? "#ffffff" : "#2b3a45";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg width="44" height="32" viewBox="0 0 88 64" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="68" height="38" rx="9" stroke={ink} strokeWidth="4.5" />

        <rect x="12" y="12" width="8" height="8" rx="2.4" fill={ink} />
        <rect x="23" y="12" width="8" height="8" rx="2.4" fill={ink} />
        <rect x="34" y="12" width="8" height="8" rx="2.4" fill="#f0894a" />
        <rect x="45" y="12" width="8" height="8" rx="2.4" fill={ink} />
        <rect x="56" y="12" width="8" height="8" rx="2.4" fill={ink} />

        <rect x="12" y="24" width="8" height="8" rx="2.4" fill={ink} />
        <rect x="23" y="24" width="26" height="8" rx="2.4" fill={ink} />

        <circle cx="64" cy="40" r="11.5" stroke={ink} strokeWidth="4.5" />
        <path d="M72.5 48.5 84 60" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />
      </svg>

      {wordmark && (
        <span style={{ color: ink, fontSize: 25, fontWeight: 500, letterSpacing: "0.04em" }}>
          keydex
        </span>
      )}
    </span>
  );
}
