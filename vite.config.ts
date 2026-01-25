import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router"],
          ui: [
            "@radix-ui/react-slot",
            "class-variance-authority",
            "clsx",
            "lucide-react",
            "tailwind-merge",
            "tailwindcss-animate",
          ],
          pocketbase: ["pocketbase"],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 3000,
  },
});
