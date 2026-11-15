import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { request } from "../lib/api";

const CatalogContext = createContext(null);

// Loads the two things every page needs once: the values filters can take,
// and whether Gemini is switched on in the backend.
export function CatalogProvider({ children }) {
  const [facets, setFacets] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setError("");

    Promise.all([request("/api/facets", { signal }), request("/api/health", { signal })])
      .then(([nextFacets, nextHealth]) => {
        setFacets(nextFacets);
        setHealth(nextHealth);
      })
      .catch((problem) => {
        if (!signal.aborted) setError(problem.message);
      });

    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);

  const value = {
    facets,
    error,
    retry,
    loading: !facets && !error,
    geminiReady: Boolean(health?.gemini_available),
    geminiModel: health?.gemini_model ?? "",
    total: facets?.total ?? 0,
  };

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  return useContext(CatalogContext);
}
