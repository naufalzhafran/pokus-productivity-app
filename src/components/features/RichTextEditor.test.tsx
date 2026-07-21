import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "@/components/features/RichTextEditor";

describe("RichTextEditor", () => {
  it("mounts its controls while the editor initializes", () => {
    render(
      <RichTextEditor
        id="project-description"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("toolbar", { name: "Description formatting" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
  });
});
