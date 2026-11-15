import { createContext, useContext, useEffect, useState } from "react";
import { request } from "../lib/api";

const CatalogContext = createContext(null);
export function CatalogProvider({ children }) {
  const [data, setData] = useState({
    facets: null,
    health: null,
    loading: true,
    error: "",
  });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData((previous) => ({ ...previous, loading: true, error: "" }));
    Promise.all([
      request("/api/facets", { signal: controller.signal }),
      request("/api/health", { signal: controller.signal }),
    ])
      .then(([facets, health]) =>
        setData({ facets, health, loading: false, error: "" }),
      )
      .catch((error) => {
        if (!controller.signal.aborted)
          setData({
            facets: null,
            health: null,
            loading: false,
            error: error.message,
          });
      });
    return () => controller.abort();
  }, [version]);
  return (
    <CatalogContext.Provider
      value={{ ...data, retry: () => setVersion((v) => v + 1) }}
    >
      {children}
    </CatalogContext.Provider>
  );
}
export function useCatalog() {
  return useContext(CatalogContext);
}
