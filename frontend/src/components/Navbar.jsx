import { useState } from "react";

import { NavLink } from "react-router-dom";

import styles from "./Navbar.module.css";

export default function Navbar() {
    return (
        <nav className="navbar">
            <div className="navbar_left">
                {/* if we have a logo we can add that here */}
                <a href="/" className="navbar_title">Keyboard Finder</a>
            </div>
            {/* come back here to include additional links */}
        </nav>
    )
}
