import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FocusLanding } from "@/components/features/focus-landing";

export default async function FocusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <FocusLanding />;
}
