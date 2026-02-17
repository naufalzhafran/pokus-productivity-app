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
import { toast } from "sonner";
import { loginWithEmail, signUpWithEmail } from "@/api/auth";

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleAuth = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      if (isLogin) {
        await loginWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
        toast.success("Account created successfully!");
      }
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred during authentication",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4 pb-2">
          <CardTitle className="text-3xl font-bold tracking-tight text-foreground">
            {isLogin ? "Welcome Back" : "Create Account"}
          </CardTitle>
          <CardDescription>
            {isLogin
              ? "Sign in to continue your focus journey"
              : "Enter your details to get started"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <form className="space-y-4" onSubmit={handleAuth}>
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-lg text-sm">
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
              />
            </div>
            <div className="space-y-2">
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                required
                autoComplete={isLogin ? "current-password" : "new-password"}
                disabled={isLoading}
              />
            </div>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold"
              >
                {isLoading ? "Loading..." : isLogin ? "Log In" : "Sign Up"}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                }}
                disabled={isLoading}
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
              >
                {isLogin
                  ? "Create an account"
                  : "Already have an account? Log in"}
              </Button>
            </div>
          </form>
          <div className="text-center pt-2">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors tracking-widest uppercase"
            >
              Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
