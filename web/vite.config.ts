import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: "prompt",
    injectRegister: null,
    includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
    manifest: {
      id: "/", name: "Pokus", short_name: "Pokus", description: "Turn intention into focused time, one Pokus at a time.",
      start_url: "/#timer", scope: "/", display: "standalone", lang: "en",
      theme_color: "#4B3BFF", background_color: "#F7F7FB",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "New capture", short_name: "Capture", url: "/#capture", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
        { name: "Start a Pokus", short_name: "Start", url: "/#timer", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
        { name: "Today", url: "/#today", icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }] },
      ],
      // Shared links and text open Quick capture prefilled (`src/lib/share-target.ts`).
      share_target: { action: "/", method: "GET", params: { title: "title", text: "text", url: "url" } },
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
      navigateFallback: "index.html", cleanupOutdatedCaches: true, clientsClaim: true,
      navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
      // Authenticated API data is stored explicitly per account in IndexedDB.
      runtimeCaching: [],
    },
  })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    // Fonts stay separate, cacheable files instead of base64 in the critical CSS.
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? false : undefined),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react-runtime";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 3000,
  },
});
