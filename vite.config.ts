import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
