import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import FocusPage from "./pages/FocusPage";
import FocusDetailPage from "./pages/FocusDetailPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/focus"
        element={
          <ProtectedRoute>
            <FocusPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/focus/:id"
        element={
          <ProtectedRoute>
            <FocusDetailPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
