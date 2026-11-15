import { useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "motion/react";

import ChatDrawer from "./components/ChatDrawer";
import Navbar from "./components/Navbar";
import PageTransition from "./components/PageTransition";
import Detail from "./pages/Detail";
import Filters from "./pages/Filters";
import Home from "./pages/Home";
import Results from "./pages/Results";

export default function App() {
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <Navbar onAsk={() => setChatOpen(true)} />

      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={
              <PageTransition>
                <Home />
              </PageTransition>
            }
          />
          <Route
            path="/find"
            element={
              <PageTransition>
                <Filters />
              </PageTransition>
            }
          />
          <Route
            path="/keyboards"
            element={
              <PageTransition>
                <Results />
              </PageTransition>
            }
          />
          <Route
            path="/keyboards/:id"
            element={
              <PageTransition>
                <Detail />
              </PageTransition>
            }
          />
        </Routes>
      </AnimatePresence>

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
    </>
  );
}
