import { lazy, Suspense } from "react";

const ConfirmDialog = lazy(() => import("@/components/features/ConfirmDialog").then((module) => ({ default: module.ConfirmDialog })));

export interface ConfirmRequest {
  title: string;
  description: string;
  /** The action's label, such as "Delete task". */
  confirmLabel: string;
  onConfirm: () => void;
  /** Defaults to true: deletes and other changes that can't be undone. */
  destructive?: boolean;
}

/** The app's confirmation dialog, loaded only when a request is open so pages don't pay for it up front. */
export function ConfirmPrompt({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return request ? <Suspense fallback={null}><ConfirmDialog request={request} onClose={onClose} /></Suspense> : null;
}
