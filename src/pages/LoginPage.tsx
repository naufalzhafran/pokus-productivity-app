import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link, useNavigate } from "react-router";
import { loginWithEmail, signUpWithEmail } from "@/api/auth";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await loginWithEmail(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Invalid email or password");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      await signUpWithEmail(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError("Failed to create account");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-[#0f172a] font-sans relative overflow-hidden">
      <Card className="w-full max-w-md bg-[#1e293b]/80 border border-[#334155] text-white shadow-2xl backdrop-blur-md z-10">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-12 h-12 rounded-full border-2 border-dashed border-[#06b6d4] p-1 mb-4">
            <div className="w-full h-full bg-[#06b6d4] rounded-full animate-pulse shadow-[0_0_15px_#06b6d4]" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-slate-300">
            Sign in to continue your focus journey
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <form className="space-y-4" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Email Address"
                required
                disabled={isLoading}
                className="bg-[#0f172a] border-[#334155] text-white placeholder:text-slate-500 h-12 focus-visible:ring-[#06b6d4]"
              />
            </div>
            <div className="space-y-2">
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                required
                disabled={isLoading}
                className="bg-[#0f172a] border-[#334155] text-white placeholder:text-slate-500 h-12 focus-visible:ring-[#06b6d4]"
              />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-[#06b6d4] hover:bg-[#0891b2] text-slate-900 font-bold text-lg shadow-[0_0_15px_rgba(6,182,212,0.3)]"
              >
                {isLoading ? "Loading..." : "Log In"}
              </Button>
              <Button
                type="button"
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  if (form) handleSignup(new Event("submit") as any);
                }}
                disabled={isLoading}
                variant="ghost"
                className="w-full text-slate-400 hover:text-white hover:bg-white/5"
              >
                Create an account
              </Button>
            </div>
          </form>
          <div className="text-center pt-2">
            <Link
              to="/"
              className="text-xs text-slate-500 hover:text-white transition-colors"
            >
              ← BACK TO HOME
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Water Wave Footer - Layered */}
      <div className="absolute bottom-0 left-0 right-0 h-48 w-full z-0 overflow-hidden">
        {/* Back Wave */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-0 w-full h-full preserve-3d opacity-20 animate-pulse"
          style={{ animationDuration: "10s" }}
          preserveAspectRatio="none"
        >
          <path
            fill="#0ea5e9"
            fillOpacity="1"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320L0,320Z"
          ></path>
        </svg>

        {/* Front Wave (Filling) */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-[-40px] w-full h-full preserve-3d opacity-60"
          preserveAspectRatio="none"
        >
          <path
            fill="#22d3ee"
            fillOpacity="1"
            d="M0,224L80,213.3C160,203,320,181,480,181.3C640,181,800,203,960,202.7C1120,203,1280,181,1360,170.7L1440,160L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
          ></path>
        </svg>
      </div>
    </main>
  );
}
