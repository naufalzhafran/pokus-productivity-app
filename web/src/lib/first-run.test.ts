import { beforeEach, describe, expect, it } from "vitest";
import { dismissWelcome, isFirstRun, welcomeDismissed } from "@/lib/first-run";

beforeEach(() => localStorage.clear());
describe("first run", () => {
  it("is only for an account with nothing in it", () => {
    expect(isFirstRun({ projects: 0, tasks: 0, captures: 0, sessions: 0 })).toBe(true);
    expect(isFirstRun({ projects: 0, tasks: 1, captures: 0, sessions: 0 })).toBe(false);
    expect(isFirstRun({ projects: 0, tasks: 0, captures: 0, sessions: 2 })).toBe(false);
  });
  it("remembers dismissal per account", () => {
    dismissWelcome("a");
    expect(welcomeDismissed("a")).toBe(true);
    expect(welcomeDismissed("b")).toBe(false);
  });
});
