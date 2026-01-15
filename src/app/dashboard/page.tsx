import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
        <h1 className="text-3xl md:text-4xl font-serif">Dashboard</h1>
        <div className="flex gap-4 w-full md:w-auto justify-between md:justify-end">
          <span className="font-mono text-sm self-center truncate">
            {user.email}
          </span>
          <Link href="/focus">
            <Button variant="outline" size="sm">
              Focus Mode
            </Button>
          </Link>
          <form action="/auth/signout" method="post">
            <Button variant="outline" size="sm">
              Log Out
            </Button>
          </form>
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <section className="space-y-6">
          <h2 className="text-2xl font-serif">Analytics</h2>
          <div className="border border-black p-8 min-h-[300px]">
            <p className="font-mono text-sm text-muted-foreground">
              // Session history and statistics will appear here
            </p>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-serif">Settings</h2>
          <div className="border border-black p-8 min-h-[300px]">
            <p className="font-mono text-sm text-muted-foreground">
              // User preferences and settings will appear here
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
