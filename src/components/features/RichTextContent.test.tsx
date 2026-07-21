import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichTextContent } from "@/components/features/RichTextContent";

describe("RichTextContent", () => {
  it("keeps supported formatting and removes unsafe markup", () => {
    const { container } = render(
      <RichTextContent
        html={
          '<p><strong>Project brief</strong> <a href="https://example.com/docs" target="_blank" rel="noopener noreferrer nofollow">Documentation</a> <a href="javascript:alert(1)">Unsafe</a></p><img src="x" onerror="alert(1)"><script>alert(1)</script>'
        }
      />,
    );

    expect(screen.getByText("Project brief").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(screen.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow",
    );
    expect(screen.getByText("Unsafe")).not.toHaveAttribute("href");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  });
});
