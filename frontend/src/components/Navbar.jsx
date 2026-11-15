import { Link, NavLink } from "react-router-dom";
import Icon from "./Icon";
import styles from "./Navbar.module.css";
export default function Navbar() {
  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link className={styles.logo} to="/" aria-label="Keyboard Finder home">
          <span className={styles.mark}>
            <Icon name="keyboard" size={25} />
          </span>
          <span>
            keyboard<span className={styles.light}>finder</span>
            <span className={styles.dot}>.</span>
          </span>
        </Link>
        <div className={styles.links}>
          <NavLink to="/" end>
            Discover
          </NavLink>
          <NavLink to="/filters">Find your fit</NavLink>
        </div>
        <span className={styles.event}>
          <span />
          DEVFEST <b>2026</b>
          <span className={styles.school}> / UCSC</span>
        </span>
      </nav>
    </header>
  );
}
