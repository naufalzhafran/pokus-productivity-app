/* eslint-disable react-refresh/only-export-components */
import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import { AuthGate } from "@/components/features/AuthGate";
import { Skeleton } from "@/components/ui/skeleton";
import "./styles/globals.css";

const loadAuthenticatedApp = () => import("./AuthenticatedApp");
const AuthenticatedApp = lazy(loadAuthenticatedApp);

function AuthenticatedAppFallback() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-5 px-5 py-6">
      <Skeleton className="h-14 w-full" />
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Skeleton className="hidden h-[36rem] lg:block" />
        <Skeleton className="h-[36rem] w-full" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate preloadAuthenticatedApp={loadAuthenticatedApp}>
      <Suspense fallback={<AuthenticatedAppFallback />}>
        <AuthenticatedApp />
      </Suspense>
    </AuthGate>
  </StrictMode>,
);
