const PATHS = {
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  back: <path d="M20 12H5m6-6-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  external: <path d="M9 6h9v9M18 6 7 17" />,
  camera: (
    <>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3v10H4z" />
      <circle cx="12" cy="13.2" r="3.2" />
    </>
  ),
  send: <path d="M5 12 19 5l-4 14-3-6z" />,
  chat: <path d="M5 5.5h14v10H11l-4.5 3.5v-3.5H5z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  // Four-point spark used wherever Gemini is doing the work.
  spark: (
    <path d="M12 3c.6 4.8 4.2 8.4 9 9-4.8.6-8.4 4.2-9 9-.6-4.8-4.2-8.4-9-9 4.8-.6 8.4-4.2 9-9z" />
  ),
};

export default function Icon({ name = "arrow", size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
