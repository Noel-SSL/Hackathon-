import { NavLink, useNavigate } from "react-router-dom";

import styles from "./Home.module.css";

export default function Home() {
    return (
        <main>
            <div className={styles["slides-container"]}>
                <div className={styles["office-slide"]}>
                    <div className={styles["button"]}>
                        <NavLink className={styles["button-click"]} to = "/">
                            DISCOVER
                        </NavLink>
                    </div>
                </div>
                <div className={styles["gaming-slide"]}>
                    <div className={styles["button"]}>
                        <NavLink className={styles["button-click"]} to = "/">
                            EXPLORE
                        </NavLink>
                    </div>
                </div>

            </div>
            
        </main>
    )
}