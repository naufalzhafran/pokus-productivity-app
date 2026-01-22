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
    <main className="flex min-h-screen items-center justify-center p-6 text-foreground relative overflow-hidden">
      <Card className="w-full max-w-md bg-secondary/30 border border-white/10 text-foreground z-10 transition-all duration-500 hover:bg-secondary/40">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto w-12 h-12 rounded-full border border-primary/50 p-1 mb-4">
            <div className="w-full h-full bg-primary rounded-full" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Sign in to continue your focus journey
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <form className="space-y-4" onSubmit={handleLogin}>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded text-sm">
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
                autoComplete="email"
                disabled={isLoading}
                className="bg-background/50 border-white/5 text-foreground placeholder:text-muted-foreground h-12 focus-visible:ring-primary focus-visible:border-primary transition-all duration-300"
              />
            </div>
            <div className="space-y-2">
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                required
                autoComplete="current-password"
                disabled={isLoading}
                className="bg-background/50 border-white/5 text-foreground placeholder:text-muted-foreground h-12 focus-visible:ring-primary focus-visible:border-primary transition-all duration-300"
              />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-primary hover:bg-primary/90 text-background font-bold text-lg transition-all hover:scale-[1.02]"
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
                className="w-full text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                Create an account
              </Button>
            </div>
          </form>
          <div className="text-center pt-2">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-primary transition-colors tracking-widest uppercase"
            >
              ← Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
