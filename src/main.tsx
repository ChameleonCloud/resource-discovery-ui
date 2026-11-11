import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL ?? "https://www.chameleoncloud.org";
const headerScript = document.createElement("script");
headerScript.src = `${PORTAL_URL}/static/scripts/chameleon-header.js`;
document.head.append(headerScript);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
