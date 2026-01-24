import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { router } from "./router";
import { initSyncQueue } from "@/lib/sync";
import "./styles/globals.css";

// Initialize sync queue for offline-first functionality
initSyncQueue();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  </StrictMode>,
);
