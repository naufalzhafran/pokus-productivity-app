import { Timer } from "@/components/features/timer";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { updateSessionStatus } from "../actions";

interface FocusPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function FocusPage(props: FocusPageProps) {
  const params = await props.params;
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("pokus_sessions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !session) {
    // Handle error or redirect
    redirect("/dashboard");
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

      <div className="z-10 text-center space-y-12 md:space-y-24 w-full max-w-4xl px-4">
        <div className="space-y-4">
          <h2 className="font-mono text-xs md:text-sm tracking-[0.2em] text-gray-400">
            CURRENT OBJECTIVE
          </h2>
          <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl break-words">
            {session.title}
          </h1>
        </div>

        <Timer
          initialDurationMinutes={session.duration_planned}
          sessionId={session.id}
          onStop={async () => {
            "use server";
            await updateSessionStatus(session.id, "ABANDONED");
          }}
          onComplete={async () => {
            "use server";
            await updateSessionStatus(
              session.id,
              "COMPLETED",
              session.duration_planned
            );
          }}
        />
      </div>
    </div>
  );
}
