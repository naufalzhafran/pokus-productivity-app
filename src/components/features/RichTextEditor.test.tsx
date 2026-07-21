import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "@/components/features/RichTextEditor";

describe("RichTextEditor", () => {
  it("mounts its controls while the editor initializes", () => {
    render(
      <StrictMode>
        <RichTextEditor
          id="project-description"
          value="<p>Existing project description</p>"
          onChange={vi.fn()}
        />
      </StrictMode>,
    );

    expect(
      screen.getByRole("toolbar", { name: "Description formatting" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add or edit link" }),
    ).toBeInTheDocument();
  });

  it("inserts a secure web link at the cursor", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        id="project-description"
        value=""
        onChange={onChange}
      />,
    );
    const editor = within(container);

    await user.click(
      editor.getByRole("button", { name: "Add or edit link" }),
    );
    await user.type(editor.getByLabelText("Link URL"), "example.com/docs");
    await user.click(editor.getByRole("button", { name: "Apply" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.stringContaining('href="https://example.com/docs"'),
      ),
    );
  });

  it("uses roving focus across available toolbar controls", async () => {
    const user = userEvent.setup();
    render(
      <RichTextEditor
        id="project-description"
        value=""
        onChange={vi.fn()}
      />,
    );

    const bold = screen.getByRole("button", { name: "Bold" });
    const italic = screen.getByRole("button", { name: "Italic" });
    const link = screen.getByRole("button", { name: "Add or edit link" });
    expect(bold).toHaveAttribute("tabindex", "0");
    expect(italic).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();

    bold.focus();
    await user.keyboard("{ArrowRight}");
    expect(italic).toHaveFocus();
    expect(italic).toHaveAttribute("tabindex", "0");
    await user.keyboard("{End}");
    expect(link).toHaveFocus();
    await user.keyboard("{Home}");
    expect(bold).toHaveFocus();

    await user.click(link);
    expect(screen.getByLabelText("Link URL")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(link).toHaveFocus());
  });
});
