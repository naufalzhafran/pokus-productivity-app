import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/focus");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-zinc-700 border-t-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 text-foreground">
      {/* Navbar */}
      <nav className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center max-w-5xl mx-auto w-full">
        <span className="font-bold text-lg tracking-wider text-foreground">
          POKUS
        </span>
        <Link to="/login">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
          >
            Log in
          </Button>
        </Link>
      </nav>

      <div className="flex flex-col items-center text-center space-y-8 max-w-2xl px-4">
        <h1 className="text-5xl md:text-7xl font-medium tracking-tight text-foreground">
          Pokus
        </h1>

        <p className="text-lg text-muted-foreground max-w-md leading-relaxed">
          A distraction-free environment for deep work.
        </p>

        <Link to="/login">
          <Button
            size="lg"
            className="h-14 px-10 text-lg font-semibold"
          >
            Start Deep Work
          </Button>
        </Link>
      </div>
    </main>
  );
}
