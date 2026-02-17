import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router";
import { Timer } from "@/components/features/timer";
import { updateSessionStatus } from "@/api/focus";
import { getLocalSession, LocalSession } from "@/lib/sync";
import { TagDisplay } from "@/components/features/TagSelector";

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

      if (session) {
        return;
      }

      const localSession = await getLocalSession(id);

      if (localSession) {
        setSession(localSession);
      } else {
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
        await updateSessionStatus(sessionId, status, actualDuration);
        navigate("/focus");
      } catch (error) {
        console.error("Failed to update session status:", error);
      }
    },
    [navigate],
  );

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 md:p-8 relative overflow-hidden font-sans">
      <div className="z-10 text-center space-y-12 md:space-y-24 w-full max-w-4xl px-4">
        <div className="space-y-3 mb-8">
          <h1 className="font-sans font-bold text-3xl md:text-4xl text-foreground">
            {session.title}
          </h1>
          <TagDisplay
            tags={session.tags}
            size="md"
            className="justify-center mt-2"
          />
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
