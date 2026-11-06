import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { migrateBrandStorage } from "./storage/migrateBrandStorage";
import "./styles.css";
import { applyRestoredPreferences } from "./storage/db";

migrateBrandStorage(window.localStorage);

const renderApp = () => ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


void applyRestoredPreferences(window.localStorage).then(renderApp).catch(() => {
  const root = document.getElementById("root")!;
  const message = document.createElement("p");
  message.textContent = "Could not open local data or apply restored UI preferences. Free local storage and retry.";
  const retry = document.createElement("button");
  retry.textContent = "Retry";
  retry.onclick = () => window.location.reload();
  root.replaceChildren(message, retry);
});
