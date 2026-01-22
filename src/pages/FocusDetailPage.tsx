import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { Timer } from "@/components/features/timer";
import { createClient } from "@/lib/supabase/client";

interface Session {
  id: string;
  title: string;
  duration_planned: number;
  status: string;
  user_id: string;
}

export default function FocusDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(
    location.state?.session || null,
  );
  const [loading, setLoading] = useState(!location.state?.session);
  const supabase = createClient();

  useEffect(() => {
    async function loadSession() {
      if (!id) {
        navigate("/dashboard");
        return;
      }

      const { data, error } = await supabase
        .from("pokus_sessions")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("Error loading session:", error);
        // Only redirect if we don't have optimistic data to show
        if (!session) {
          navigate("/dashboard");
        }
        return;
      }

      setSession(data);
      setLoading(false);
    }

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  const updateSessionStatus = async (
    sessionId: string,
    status: "COMPLETED" | "ABANDONED",
    actualDuration?: number,
  ) => {
    const { error } = await supabase
      .from("pokus_sessions")
      .update({
        status,
        duration_actual: actualDuration,
        ended_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      console.error("Error updating session:", error);
      throw new Error("Failed to update session");
    }

    navigate("/focus");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <div className="w-12 h-12 rounded-full border-2 border-dashed border-[#06b6d4] p-1">
          <div className="w-full h-full bg-[#06b6d4] rounded-full animate-pulse shadow-[0_0_15px_#06b6d4]" />
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-8 relative overflow-hidden font-sans">
      {/* Wave Background Removed */}

      <div className="z-10 text-center space-y-12 md:space-y-24 w-full max-w-4xl px-4">
        <div className="space-y-4 mb-8">
          <div className="bg-white/10 rounded-full px-4 py-1 inline-flex items-center gap-2 text-sm font-medium tracking-wide">
            <span className="text-white/70 uppercase">FOCUSING</span>
          </div>
          <h1 className="font-sans font-bold text-3xl md:text-4xl text-white/90">
            {session.title}
          </h1>
        </div>

        <Timer
          initialDurationMinutes={session.duration_planned}
          sessionId={session.id}
          onStop={() => updateSessionStatus(session.id, "ABANDONED")}
          onComplete={() =>
            updateSessionStatus(
              session.id,
              "COMPLETED",
              session.duration_planned,
            )
          }
          sessionTitle={session.title}
        />
      </div>
    </div>
  );
}
