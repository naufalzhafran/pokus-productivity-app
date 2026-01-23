import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Suspense, lazy } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";

const HomePage = lazy(() => import("@/pages/HomePage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const FocusPage = lazy(() => import("@/pages/FocusPage"));
const FocusDetailPage = lazy(() => import("@/pages/FocusDetailPage"));

// Protected route wrapper component
function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Double check for safety, though technically redundant with above
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Suspense wrapper
function SuspenseLayout() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Outlet />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <SuspenseLayout />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        // Protected routes wrapper
        element: <ProtectedLayout />,
        children: [
          {
            path: "/dashboard",
            element: <DashboardPage />,
          },
          {
            path: "/focus",
            element: <FocusPage />,
          },
          {
            path: "/focus/:id",
            element: <FocusDetailPage />,
          },
        ],
      },
    ],
  },
]);
