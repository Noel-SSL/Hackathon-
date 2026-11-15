import { Link } from "react-router-dom";
export default function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/">A little more you. Every keystroke.</Link>
      <span>Made for DevFest 2026 · UCSC</span>
    </footer>
  );
}
