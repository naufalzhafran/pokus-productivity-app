import { createBrowserRouter, Navigate, Outlet } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import HomePage from "@/pages/HomePage";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import FocusPage from "@/pages/FocusPage";
import FocusDetailPage from "@/pages/FocusDetailPage";

// Protected route wrapper component
function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#06b6d4] p-1">
          <div className="w-full h-full bg-[#06b6d4] rounded-full animate-pulse shadow-[0_0_15px_#06b6d4]" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
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
]);
