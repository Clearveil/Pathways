import React from "react";
import ReactDOM from "react-dom/client";
import HealthTracker from "./App.jsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Installs the service worker that makes the site installable and caches the
// app shell. autoUpdate: a new build replaces the old one on the next load.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HealthTracker />
  </React.StrictMode>
);
