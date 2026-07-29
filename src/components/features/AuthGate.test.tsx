import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/features/AuthGate";

const auth = vi.hoisted(() => ({
  refresh: vi.fn<() => Promise<unknown>>(),
  clear: vi.fn(),
  onChange: vi.fn(() => vi.fn()),
  store: {
    isValid: false,
    record: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/lib/pocketbase", () => ({
  AUTH_COLLECTION: "users",
  pb: {
    authStore: {
      get isValid() {
        return auth.store.isValid;
      },
      get record() {
        return auth.store.record;
      },
      clear: auth.clear,
      onChange: auth.onChange,
    },
    collection: () => ({ authRefresh: auth.refresh }),
  },
}));

vi.mock("@/components/features/LoginForm", () => ({
  LoginForm: () => <p>Sign in screen</p>,
}));

describe("AuthGate loading", () => {
  beforeEach(() => {
    auth.store.isValid = false;
    auth.store.record = null;
    auth.refresh.mockReset();
    auth.clear.mockReset();
    auth.onChange.mockClear();
  });

  it("does not request authenticated code for a signed-out startup", () => {
    const preload = vi.fn(() => Promise.resolve());
    render(
      <AuthGate preloadAuthenticatedApp={preload}>
        <p>Workspace</p>
      </AuthGate>,
    );

    expect(screen.getByText("Sign in screen")).toBeInTheDocument();
    expect(preload).not.toHaveBeenCalled();
  });

  it("preloads authenticated code while saved-session refresh is pending", async () => {
    let finishRefresh: (() => void) | undefined;
    auth.store.isValid = true;
    auth.store.record = { id: "user-1" };
    auth.refresh.mockImplementation(
      () => new Promise<void>((resolve) => { finishRefresh = resolve; }),
    );
    const preload = vi.fn(() => Promise.resolve());

    render(
      <AuthGate preloadAuthenticatedApp={preload}>
        <p>Workspace</p>
      </AuthGate>,
    );

    expect(screen.getByText("Restoring your session…")).toBeInTheDocument();
    expect(preload).toHaveBeenCalledTimes(1);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();

    finishRefresh?.();
    await waitFor(() => expect(screen.getByText("Workspace")).toBeInTheDocument());
  });
});
