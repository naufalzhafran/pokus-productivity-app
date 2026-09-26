import { useCachedResource } from "@/hooks/useCachedResource";
import { listPomodoroHistory } from "@/lib/pocketbase-records";

export function usePomodoroHistory() {
  const { items: history, isLoading, loadError: error } = useCachedResource("history", listPomodoroHistory);
  return { history, isLoading, error };
}
