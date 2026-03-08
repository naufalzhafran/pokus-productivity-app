import { NavLink, useLocation } from "react-router";
import {
  LayoutGrid,
  Folder,
  Timer,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { logout } from "@/api/auth";
import { useNavigate } from "react-router";

export function MobileNav() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const isFocusActive = location.pathname.startsWith("/focus");
  const isProjectsActive = location.pathname.startsWith("/projects");
  const isHistoryActive = location.pathname === "/history";

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        <NavLink
          to="/focus"
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all duration-200 ${
            isFocusActive
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Timer className="w-6 h-6" strokeWidth={isFocusActive ? 2.5 : 2} />
          <span className={`text-[10px] mt-0.5 font-medium ${isFocusActive ? "text-foreground" : "text-muted-foreground"}`}>
            Focus
          </span>
        </NavLink>

        <NavLink
          to="/projects"
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all duration-200 ${
            isProjectsActive
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Folder className="w-6 h-6" strokeWidth={isProjectsActive ? 2.5 : 2} />
          <span className={`text-[10px] mt-0.5 font-medium ${isProjectsActive ? "text-foreground" : "text-muted-foreground"}`}>
            Projects
          </span>
        </NavLink>

        <NavLink
          to="/history"
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all duration-200 ${
            isHistoryActive
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutGrid className="w-6 h-6" strokeWidth={isHistoryActive ? 2.5 : 2} />
          <span className={`text-[10px] mt-0.5 font-medium ${isHistoryActive ? "text-foreground" : "text-muted-foreground"}`}>
            History
          </span>
        </NavLink>
      </div>
    </nav>
  );
}

export function MobileHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 bg-background/95 backdrop-blur-md border-b border-border z-40">
      <div className="flex items-center justify-between h-14 px-4">
        <span className="font-bold text-lg tracking-tight text-foreground">
          POKUS
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-zinc-800 transition-colors"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

export function useIsMobile() {
  return typeof window !== "undefined" && window.innerWidth < 768;
}
