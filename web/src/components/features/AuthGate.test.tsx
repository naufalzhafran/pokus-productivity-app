import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "@/components/features/AuthGate";
import { ClientResponseError } from "pocketbase";

const auth = vi.hoisted(() => ({
  refresh: vi.fn<() => Promise<unknown>>(),
  clear: vi.fn(),
  save: vi.fn(),
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
      save: auth.save,
      onChange: auth.onChange,
    },
    send: auth.refresh,
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
      () => new Promise((resolve) => { finishRefresh = () => resolve({ token: "refreshed", record: auth.store.record }); }),
    );
    const preload = vi.fn(() => Promise.resolve());

    render(
      <AuthGate preloadAuthenticatedApp={preload}>
        <p>Workspace</p>
      </AuthGate>,
    );

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(preload).toHaveBeenCalledTimes(1);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.clear).not.toHaveBeenCalled();

    finishRefresh?.();
    await waitFor(() => expect(screen.getByText("Workspace")).toBeInTheDocument());
  });

  it("preserves cached identity when refresh cannot connect", async () => {
    auth.store.isValid = true; auth.store.record = { id: "offline-user" };
    auth.refresh.mockRejectedValue(new ClientResponseError({ status: 0 }));
    render(<AuthGate><p>Offline workspace</p></AuthGate>);
    await waitFor(() => expect(auth.refresh).toHaveBeenCalled());
    expect(screen.getByText("Offline workspace")).toBeInTheDocument();
    expect(auth.clear).not.toHaveBeenCalled();
  });

  it("allows local use of an expired saved account without server access", () => {
    auth.store.isValid = false; auth.store.record = { id: "expired-user" };
    render(<AuthGate><p>Offline workspace</p></AuthGate>);
    expect(screen.getByText("Offline workspace")).toBeInTheDocument();
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(auth.clear).not.toHaveBeenCalled();
  });

  it("clears authentication only after a confirmed rejection", async () => {
    auth.store.isValid = true; auth.store.record = { id: "revoked-user" };
    auth.refresh.mockRejectedValue(new ClientResponseError({ status: 401 }));
    render(<AuthGate><p>Workspace</p></AuthGate>);
    await waitFor(() => expect(auth.clear).toHaveBeenCalled());
  });
});
