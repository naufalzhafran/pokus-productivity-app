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
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-8 relative overflow-hidden font-sans">
      {/* Wave Background */}
      <div className="absolute bottom-0 left-0 right-0 h-48 w-full z-0 overflow-hidden">
        {/* Back Wave */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-0 w-full h-full preserve-3d opacity-30 animate-pulse"
          style={{ animationDuration: "8s" }}
          preserveAspectRatio="none"
        >
          <path
            fill="#0ea5e9"
            fillOpacity="1"
            d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320L0,320Z"
          ></path>
        </svg>

        {/* Middle Wave */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-[-10px] w-full h-full preserve-3d opacity-50"
          preserveAspectRatio="none"
        >
          <path
            fill="#06b6d4"
            fillOpacity="1"
            d="M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,144C672,128,768,128,864,144C960,160,1056,192,1152,192C1248,192,1344,160,1392,144L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320L0,320Z"
          ></path>
        </svg>

        {/* Front Wave (Filling) */}
        <svg
          viewBox="0 0 1440 320"
          className="absolute bottom-[-20px] w-full h-full preserve-3d opacity-80"
          preserveAspectRatio="none"
        >
          <path
            fill="#22d3ee"
            fillOpacity="1"
            d="M0,224L80,213.3C160,203,320,181,480,181.3C640,181,800,203,960,202.7C1120,203,1280,181,1360,170.7L1440,160L1440,320L1360,320C1280,320,1120,320,960,320C800,320,640,320,480,320C320,320,160,320,80,320L0,320Z"
          ></path>
        </svg>
      </div>

      <div className="z-10 text-center space-y-12 md:space-y-24 w-full max-w-4xl px-4">
        <div className="space-y-4 mb-8">
          <div className="bg-white/10 rounded-full px-4 py-1 inline-flex items-center gap-2 text-sm font-medium tracking-wide shadow-[0_0_10px_rgba(255,255,255,0.2)]">
            <span className="text-white/70 uppercase">FOCUSING</span>
          </div>
          <h1 className="font-sans font-bold text-3xl md:text-4xl text-white/90 drop-shadow-lg">
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
              session.duration_planned,
            );
          }}
        />
      </div>
    </div>
  );
}
