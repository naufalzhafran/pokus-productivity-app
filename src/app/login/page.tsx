import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { login, signup } from "./actions";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md border-2 border-black">
        <CardHeader className="text-center space-y-4">
          <CardTitle className="text-4xl">Enter</CardTitle>
          <CardDescription className="text-lg">
            Sign in to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4">
            <div className="space-y-2">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="Email"
                required
              />
            </div>
            <div className="space-y-2">
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Password"
                required
              />
            </div>
            <div className="flex gap-4 pt-4">
              <Button formAction={login} className="w-full">
                Log In
              </Button>
              <Button formAction={signup} variant="outline" className="w-full">
                Sign Up
              </Button>
            </div>
          </form>
          <div className="text-center">
            <Link
              href="/"
              className="font-mono text-xs hover:underline decoration-1 underline-offset-4"
            >
              BACK TO HOME
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
