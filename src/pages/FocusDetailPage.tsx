import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { Timer } from "@/components/features/timer";
import { updateSessionStatus } from "@/api/focus";
import { getLocalSession, LocalSession } from "@/lib/sync";

export default function FocusDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<LocalSession | null>(
    location.state?.session || null,
  );

  useEffect(() => {
    async function loadSession() {
      if (!id) {
        navigate("/dashboard");
        return;
      }

      // If we already have session from navigation state, use it
      if (session) {
        return;
      }

      // Try to load from local storage first (instant)
      const localSession = await getLocalSession(id);

      if (localSession) {
        setSession(localSession);
      } else {
        // Session not found locally, redirect
        console.error("Session not found:", id);
        navigate("/dashboard");
      }
    }

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate]);

  const handleUpdateStatus = useCallback(
    async (
      sessionId: string,
      status: "COMPLETED" | "ABANDONED",
      actualDuration?: number,
    ) => {
      try {
        // Update status locally first (instant), sync to Supabase in background
        await updateSessionStatus(sessionId, status, actualDuration);
        navigate("/focus");
      } catch (error) {
        console.error("Failed to update session status:", error);
      }
    },
    [navigate],
  );

  // No loading state - we either have the session from nav state or local storage
  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden font-sans">
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
          key={session.id}
          initialDurationMinutes={session.duration_planned}
          sessionId={session.id}
          onStop={() => handleUpdateStatus(session.id, "ABANDONED")}
          onComplete={() =>
            handleUpdateStatus(
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
