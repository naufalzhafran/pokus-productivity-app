import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { Suspense, lazy } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { MobileNav, MobileHeader } from "@/components/MobileNav";

const HomePage = lazy(() => import("@/pages/HomePage"));
const LoginPage = lazy(() => import("@/pages/LoginPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const FocusPage = lazy(() => import("@/pages/FocusPage"));
const FocusDetailPage = lazy(() => import("@/pages/FocusDetailPage"));
const ProjectsPage = lazy(() => import("@/pages/ProjectsPage"));
const ProjectDetailPage = lazy(() => import("@/pages/ProjectDetailPage"));

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

function SuspenseLayout() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Outlet />
    </Suspense>
  );
}

function MobileLayout() {
  const { user } = useAuth();

  if (!user) {
    return <Outlet />;
  }

  return (
    <>
      <MobileHeader />
      <div className="fixed inset-0 pt-14 pb-20 flex flex-col">
        <Outlet />
      </div>
      <MobileNav />
    </>
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
        element: <MobileLayout />,
        children: [
          {
            path: "/focus",
            element: <FocusPage />,
          },
          {
            path: "/focus/:id",
            element: <FocusDetailPage />,
          },
          {
            element: <ProtectedLayout />,
            children: [
              {
                path: "/",
                element: <ProjectsPage />,
              },
              {
                path: "/history",
                element: <DashboardPage />,
              },
              {
                path: "/projects",
                element: <ProjectsPage />,
              },
              {
                path: "/projects/:id",
                element: <ProjectDetailPage />,
              },
            ],
          },
        ],
      },
    ],
  },
]);
