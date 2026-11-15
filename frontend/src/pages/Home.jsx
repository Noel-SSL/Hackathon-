import { Link } from "react-router-dom";
import KeyboardArt from "../components/KeyboardArt";
import Icon from "../components/Icon";
import styles from "./Home.module.css";
export default function Home() {
  return (
    <main id="main" className={styles.home}>
      <div className={styles.heading}>
        <p className="eyebrow">Less searching. More your type.</p>
        <h1>
          A better fit.
          <br />
          <span>Every keystroke.</span>
        </h1>
        <p>
          For the work you do. For the worlds you escape to.
          <br />
          Find a keyboard that feels like you.
        </p>
      </div>
      <div className={styles.split}>
        <section
          className={`${styles.panel} ${styles.office}`}
          aria-labelledby="office-title"
        >
          <div className={styles.panelTop}>
            <span>01 / THE DAILY FLOW</span>
            <span className={styles.tag}>Work & everyday</span>
          </div>
          <KeyboardArt className={styles.art} variant="office" />
          <div className={styles.panelBottom}>
            <div>
              <h2 id="office-title">Find your flow.</h2>
              <p>Thoughtful details for your everyday desk.</p>
            </div>
            <Link className={styles.cta} to="/filters?use=office">
              Explore work keyboards <Icon />
            </Link>
          </div>
        </section>
        <span className={styles.divider} aria-hidden="true">
          &
        </span>
        <section
          className={`${styles.panel} ${styles.gaming}`}
          aria-labelledby="gaming-title"
        >
          <div className={styles.panelTop}>
            <span>02 / THE NEXT LEVEL</span>
            <span className={styles.tag}>Gaming & play</span>
          </div>
          <KeyboardArt className={styles.art} variant="gaming" />
          <div className={styles.panelBottom}>
            <div>
              <h2 id="gaming-title">Make your next move.</h2>
              <p>A setup that’s ready when you are.</p>
            </div>
            <Link className={styles.cta} to="/filters?use=gaming">
              Explore gaming keyboards <Icon />
            </Link>
          </div>
        </section>
      </div>
      <div className={styles.benefits}>
        <span>
          <Icon name="sliders" size={16} /> Your preferences, your pick
        </span>
        <span>
          <Icon name="spark" size={16} /> A little help from Gemini
        </span>
        <span>
          <Icon name="keyboard" size={16} /> Real keyboards. Real possibilities.
        </span>
      </div>
    </main>
  );
}
