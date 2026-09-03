import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Makes the site installable: generates the web manifest and a service
    // worker that caches the app shell. "Add to Home Screen" on iOS and
    // "Install" in Chrome/Edge then open it fullscreen with the hand icon.
    // Data still comes from Supabase; nothing user-specific is cached.
    VitePWA({
      registerType: "autoUpdate",     // new builds replace the old one on next load
      includeAssets: ["logo.png", "apple-touch-icon.png"],
      manifest: {
        name: "Pathways",
        short_name: "Pathways",
        description: "One experiment at a time. A health log that tells you whether a change actually did anything.",
        start_url: "/",
        display: "standalone",
        background_color: "#FFFFFF",
        theme_color: "#FFFFFF",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The bundle is ~850 KB; the default 2 MB cap is fine, stated here so it's visible.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Never intercept Supabase traffic. Data must always be live.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
      },
    }),
  ],
});
