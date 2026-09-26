import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: "prompt",
    injectRegister: null,
    includeAssets: ["favicon.svg", "apple-touch-icon.png"],
    manifest: {
      id: "/", name: "Pokus", short_name: "Pokus", description: "One calm focus session at a time.",
      start_url: "/#timer", scope: "/", display: "standalone", lang: "en",
      theme_color: "#f6f5f0", background_color: "#f6f5f0",
      icons: [
        { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react-runtime";
          }
          if (id.includes("node_modules/lucide-react/")) {
            return "lucide";
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
