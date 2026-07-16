import { useState } from "react";
import { ClientResponseError } from "pocketbase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
} from "@/components/ui/field";
import { AUTH_COLLECTION, pb } from "@/lib/pocketbase";
import { saveOAuthAvatar } from "@/lib/user-profile";

function getGoogleLoginError(error: unknown) {
  if (error instanceof ClientResponseError) {
    if (error.isAbort) return "Google sign-in was cancelled.";

    if (error.status === 0) {
      return "Google sign-in could not connect. Allow pop-ups and check your connection, then try again.";
    }
  }

  return "Google sign-in is unavailable right now. Please try again.";
}

export function LoginForm() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleLogin = () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    void pb
      .collection(AUTH_COLLECTION)
      .authWithOAuth2({ provider: "google" })
      .then((authData) => {
        saveOAuthAvatar(authData.record.id, authData.meta);
      })
      .catch((error) => {
        setErrorMessage(getGoogleLoginError(error));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="screen-panel flex w-full max-w-sm flex-col gap-5">
        <div className="text-center">
          <Badge>Pokus</Badge>
          <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight">
            Welcome to Pokus
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Turn the work in front of you into one calm focus session.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Continue with Google to save tasks and focus history across
              sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field data-invalid={Boolean(errorMessage)}>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={isSubmitting}
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={errorMessage ? "google-login-error" : undefined}
              >
                {isSubmitting ? "Connecting to Google…" : "Continue with Google"}
              </Button>
              <FieldError id="google-login-error">{errorMessage}</FieldError>
            </Field>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Authentication is securely handled by Google and PocketBase.
            </p>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}
