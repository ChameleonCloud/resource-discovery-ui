import { useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchNodeItem } from "./api/types";
import { Layout } from "./components/Layout";
import { SearchBar } from "./components/SearchBar";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { CartPage } from "./pages/CartPage";
import { useCart } from "./hooks/useCart";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppInner() {
  const { cart, dispatch } = useCart();
  const [query, setQuery] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const location = useLocation();

  function handleCartChange(node: SearchNodeItem, add: boolean) {
    dispatch(add ? { type: "add", node } : { type: "remove", uid: node.uid });
  }

  function handleReset() {
    setQuery("");
    setResetKey((k) => k + 1);
  }

  const isDiscovery = location.pathname === "/";

  return (
    <Layout
      cartCount={cart.length}
      center={isDiscovery ? <SearchBar value={query} onChange={setQuery} /> : undefined}
      onLogoClick={handleReset}
    >
      <Routes>
        <Route
          path="/"
          element={
            <DiscoveryPage
              key={resetKey}
              cart={cart}
              query={query}
              onQueryChange={setQuery}
              onCartChange={handleCartChange}
              onClearCart={() => dispatch({ type: "clear" })}
            />
          }
        />
        <Route
          path="/cart"
          element={
            <CartPage
              cart={cart}
              onRemove={(uid) => dispatch({ type: "remove", uid })}
              onClear={() => dispatch({ type: "clear" })}
            />
          }
        />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
