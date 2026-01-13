import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createSession } from "./actions";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-8 max-w-6xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b-4 border-black pb-6 gap-4">
        <h1 className="text-3xl md:text-4xl font-serif">Break Mode</h1>
        <div className="flex gap-4 w-full md:w-auto justify-between md:justify-end">
          <span className="font-mono text-sm self-center truncate">
            {user.email}
          </span>
          <form action="/auth/signout" method="post">
            <Button variant="outline" size="sm">
              Log Out
            </Button>
          </form>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h2 className="text-2xl font-serif">Plan Next Session</h2>
          <Card className="border-black">
            <CardContent className="pt-6">
              <form action={createSession} className="space-y-6">
                <div className="space-y-2">
                  <label
                    htmlFor="title"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Objective
                  </label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="What are you working on?"
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="duration"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Duration (minutes)
                  </label>
                  <div className="flex gap-4">
                    {[25, 45, 60].map((mins) => (
                      <div key={mins} className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id={`d-${mins}`}
                          name="duration"
                          value={mins}
                          defaultChecked={mins === 25}
                          className="accent-black h-4 w-4"
                        />
                        <label
                          htmlFor={`d-${mins}`}
                          className="text-sm font-mono"
                        >
                          {mins}m
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <Button type="submit" size="lg" className="w-full text-lg py-6">
                  ENTER FOCUS MODE
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-serif">Tasks (Inbox)</h2>
          <div className="border border-black p-8 min-h-[300px]">
            <p className="font-mono text-sm text-muted-foreground">
              // Tasks will appear here
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
