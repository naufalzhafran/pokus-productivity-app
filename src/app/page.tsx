import { Button } from "@/components/ui/button";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-24 bg-background text-foreground overflow-hidden relative">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, #000 1px, #000 2px)`,
          backgroundSize: "100% 4px",
        }}
      ></div>

      <div className="z-10 flex flex-col items-center text-center space-y-8 md:space-y-12 max-w-4xl px-4">
        <h1 className="font-serif text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-medium tracking-tighter leading-none">
          Pokus
        </h1>
        <p className="font-serif text-xl md:text-2xl lg:text-3xl max-w-2xl text-muted-foreground">
          A distraction-free deep work environment that separates{" "}
          <span className="text-foreground italic">Execution</span> from{" "}
          <span className="text-foreground italic">Planning</span>.
        </p>

        <div className="flex gap-6">
          <Link href="/login">
            <Button size="lg" className="text-lg px-12 py-8">
              Start Focus
            </Button>
          </Link>
        </div>
      </div>

      <div className="absolute bottom-12 text-sm font-mono tracking-widest text-muted-foreground">
        EST. 2026
      </div>
    </main>
  );
}
