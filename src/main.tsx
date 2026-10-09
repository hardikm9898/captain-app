import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { router } from "./router";

// Android hardware back: step back through the in-app history; from a root
// screen (tables/login) background the app instead of popping to a blank view.
if (Capacitor.isNativePlatform()) {
  // Status / gesture bar colours: MainActivity (EdgeInsets.java), not the StatusBar plugin.
  void CapApp.addListener("backButton", () => {
    const path = router.history.location.pathname;
    if (path === "/" || path === "/login") void CapApp.minimizeApp();
    else router.history.back();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
