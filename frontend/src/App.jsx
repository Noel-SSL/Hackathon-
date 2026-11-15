import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { CatalogProvider } from "./context/CatalogContext";
import MainLayout from "./layouts/MainLayout";
import Home from "./pages/Home";
import FilterPage from "./pages/filterPage";
import ResultPage from "./pages/resultPage";
import DescPage from "./pages/descPage";
import "./App.css";
export default function App() {
  return (
    <BrowserRouter>
      <CatalogProvider>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/filters" element={<FilterPage />} />
            <Route path="/results" element={<ResultPage />} />
            <Route path="/keyboards/:keyboardId" element={<DescPage />} />
            <Route
              path="*"
              element={
                <main id="main" className="page-shell empty-state">
                  <h1>That page slipped away.</h1>
                  <p>Let’s get you back to finding your keyboard.</p>
                  <Link className="button" to="/">
                    Back to discovering
                  </Link>
                </main>
              }
            />
          </Route>
        </Routes>
      </CatalogProvider>
    </BrowserRouter>
  );
}
