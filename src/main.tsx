import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./App";
import { AuthGate } from "@/components/features/AuthGate";
import { Toaster } from "@/components/ui/sonner";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
    <Toaster position="bottom-center" closeButton />
  </StrictMode>,
);
