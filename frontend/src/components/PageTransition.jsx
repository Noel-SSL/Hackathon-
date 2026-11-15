import { useEffect } from "react";
import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1];

// Wraps a page so routes fade and lift into place instead of snapping.
export default function PageTransition({ children }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.25, ease: "easeIn" } }}
    >
      {children}
    </motion.div>
  );
}
