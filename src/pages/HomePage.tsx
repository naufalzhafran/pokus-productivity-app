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
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-primary p-1">
          <div className="w-full h-full bg-primary rounded-full animate-pulse shadow-[0_0_15px_hsl(var(--primary))]" />
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-6 text-foreground overflow-hidden">
      {/* Navbar */}
      <nav className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center max-w-5xl mx-auto w-full z-20">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border border-primary/50 p-0.5">
            <div className="w-full h-full bg-primary rounded-full" />
          </div>
          <span className="font-bold text-lg tracking-wider text-primary">
            POKUS
          </span>
        </div>
        <Link to="/login">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-300 rounded-full px-6"
          >
            Log in
          </Button>
        </Link>
      </nav>

      <div className="z-10 flex flex-col items-center text-center space-y-10 max-w-4xl px-4 animate-in fade-in zoom-in duration-700">
        <h1 className="text-6xl md:text-8xl font-medium tracking-tight leading-tight">
          <span className="block text-slate-300">Simple. Effective.</span>
          <span className="text-primary">Focus Timer.</span>
        </h1>

        <p className="text-xl md:text-2xl text-slate-400 max-w-2xl font-light leading-relaxed">
          Dive into a distraction-free environment. <br />
          <span className="text-slate-300">
            Separate planning from execution.
          </span>
        </p>

        <div className="flex gap-4 pt-4">
          <Link to="/login">
            <Button
              size="lg"
              className="h-16 px-10 rounded-full bg-primary hover:bg-primary/90 text-background text-lg font-bold transition-all hover:scale-105"
            >
              Start Deep Work
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
