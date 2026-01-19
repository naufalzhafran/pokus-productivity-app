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
    redirect("/focus");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#0f172a] text-white relative overflow-hidden font-sans">
      {/* Navbar Placeholder */}
      <nav className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center max-w-5xl mx-auto w-full z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-dashed border-[#06b6d4] p-0.5">
            <div className="w-full h-full bg-[#06b6d4] rounded-full animate-pulse shadow-[0_0_10px_#06b6d4]" />
          </div>
          <span className="font-bold text-lg tracking-tight drop-shadow-md">
            POKUS
          </span>
        </div>
        <Link href="/login">
          <Button
            variant="ghost"
            className="text-white hover:text-white/80 hover:bg-white/10"
          >
            Log in
          </Button>
        </Link>
      </nav>

      <div className="z-10 flex flex-col items-center text-center space-y-8 max-w-3xl px-4">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight drop-shadow-xl ">
          Simple. Effective.
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-300">
            Focus Timer.
          </span>
        </h1>
        <p className="text-xl text-blue-100 max-w-xl drop-shadow-md">
          A distraction-free deep work environment that helps you separate
          execution from planning.
        </p>

        <div className="flex gap-4">
          <Link href="/login">
            <Button
              size="lg"
              className="h-14 px-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-lg font-bold shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-transform hover:scale-105"
            >
              Start Focus
            </Button>
          </Link>
        </div>
      </div>

      {/* Water Wave Footer - Layered */}
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
    </main>
  );
}
