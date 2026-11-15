import { Link, useLocation } from "react-router-dom";

import Icon from "./Icon";
import Logo from "./Logo";
import styles from "./Navbar.module.css";

export default function Navbar({ onAsk }) {
  const { pathname } = useLocation();
  const onHome = pathname === "/";

  return (
    <header className={`${styles.nav} ${onHome ? styles.overHero : ""}`}>
      <Link to="/" aria-label="keydex home">
        <Logo />
      </Link>

      <nav className={styles.links} aria-label="Main">
        {!onHome && <Link to="/find?use=office">office</Link>}
        {!onHome && <Link to="/find?use=gaming">gaming</Link>}
        <Link to="/keyboards">all keyboards</Link>
        <button type="button" className={styles.ask} onClick={onAsk}>
          <Icon name="spark" size={15} />
          ask keydex
        </button>
      </nav>
    </header>
  );
}
