import { useState, useMemo } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SearchNodeItem, VmFlavor } from "./api/types";
import { Layout } from "./components/Layout";
import { SearchBar } from "./components/SearchBar";
import { DiscoveryPage } from "./pages/DiscoveryPage";
import { CartPage } from "./pages/CartPage";
import { useCart, cartItemCount } from "./hooks/useCart";

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
  const [searchEnterSignal, setSearchEnterSignal] = useState(0);
  const [filtersSummary, setFiltersSummary] = useState("");
  const location = useLocation();

  function handleCartChange(node: SearchNodeItem, add: boolean) {
    dispatch(add ? { type: "addNode", node } : { type: "removeNode", uid: node.uid });
  }

  function handleFlavorCountChange(flavor: VmFlavor, siteId: string, count: number) {
    dispatch({ type: "setFlavorCount", siteId, flavor, count });
  }

  const cartCount = useMemo(() => cartItemCount(cart), [cart]);

  function handleReset() {
    setQuery("");
    setResetKey((k) => k + 1);
  }

  const isDiscovery =
    location.pathname === "/" ||
    location.pathname.startsWith("/nodes/") ||
    location.pathname.startsWith("/flavors/");

  const discoveryPage = (
    <DiscoveryPage
      key={resetKey}
      cart={cart}
      query={query}
      onQueryChange={setQuery}
      searchEnterSignal={searchEnterSignal}
      onCartChange={handleCartChange}
      onFlavorCountChange={handleFlavorCountChange}
      onClearCart={() => dispatch({ type: "clear" })}
      onFiltersSummaryChange={setFiltersSummary}
    />
  );

  return (
    <Layout
      cartCount={cartCount}
      center={isDiscovery ? <SearchBar value={query} onChange={setQuery} onEnter={() => setSearchEnterSignal((s) => s + 1)} /> : undefined}
      onLogoClick={handleReset}
      feedbackFiltersSummary={isDiscovery ? filtersSummary : undefined}
    >
      <Routes>
        <Route path="/" element={discoveryPage}>
          <Route path="nodes/:siteId/:clusterId/:uid" element={null} />
          <Route path="flavors/:siteId/:uid" element={null} />
        </Route>
        <Route
          path="/cart"
          element={
            <CartPage
              cart={cart}
              onRemoveNode={(uid) => dispatch({ type: "removeNode", uid })}
              onFlavorCountChange={(siteId, flavor, count) => dispatch({ type: "setFlavorCount", siteId, flavor, count })}
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
