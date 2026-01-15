import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSession } from "./actions";
import { Input } from "@/components/ui/input";
import { LayoutGrid } from "lucide-react";
import Link from "next/link";

export default async function FocusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Texture */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 1px, #fff 1px, #fff 2px)`,
          backgroundSize: "4px 100%",
        }}
      ></div>

      <div className="z-10 w-full max-w-xl px-4">
        {/* Header */}
        <header className="flex justify-between items-center mb-12 border-b border-white/20 pb-6">
          <h1 className="text-2xl md:text-3xl">Break Mode</h1>
          <Link
            href="/dashboard"
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            aria-label="Dashboard"
          >
            <LayoutGrid size={20} />
          </Link>
        </header>

        {/* Session Planning Form */}
        <div className="space-y-8">
          <div className="space-y-2">
            <h2 className="text-xl">Plan Next Session</h2>
            <p className="text-sm text-gray-500">
              // Define your objective for the next block
            </p>
          </div>

          <form action={createSession} className="space-y-8">
            <div className="space-y-4">
              <label
                htmlFor="title"
                className="text-sm font-medium leading-none text-gray-400 uppercase tracking-widest"
              >
                Objective
              </label>

              <Input
                id="title"
                name="title"
                placeholder="What are you working on?"
                required
                autoFocus
                className="bg-transparent border-0 border-b-2 border-white/20 rounded-none text-2xl md:text-3xl placeholder:text-gray-700 px-0 py-4 focus-visible:ring-0 focus-visible:border-white transition-colors h-auto"
              />
            </div>

            <div className="space-y-4">
              <label
                htmlFor="duration"
                className="text-sm font-medium leading-none text-gray-400 uppercase tracking-widest"
              >
                Duration
              </label>
              <div className="flex gap-6">
                {[25, 45, 60].map((mins) => (
                  <div key={mins} className="flex items-center">
                    <input
                      type="radio"
                      id={`d-${mins}`}
                      name="duration"
                      value={mins}
                      defaultChecked={mins === 25}
                      className="peer sr-only"
                    />
                    <label
                      htmlFor={`d-${mins}`}
                      className="text-lg md:text-xl text-gray-600 cursor-pointer peer-checked:text-white peer-checked:underline decoration-1 underline-offset-8 transition-all hover:text-gray-300"
                    >
                      {mins}m
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full text-lg py-8 bg-transparent border border-white text-white hover:bg-white hover:text-black mt-8 rounded-none tracking-widest transition-colors"
            >
              [ ENTER FOCUS MODE ]
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
