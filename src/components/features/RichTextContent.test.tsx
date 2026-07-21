import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichTextContent } from "@/components/features/RichTextContent";

describe("RichTextContent", () => {
  it("keeps supported formatting and removes unsafe markup", () => {
    const { container } = render(
      <RichTextContent
        html={
          '<p><strong>Project brief</strong></p><img src="x" onerror="alert(1)"><script>alert(1)</script>'
        }
      />,
    );

    expect(screen.getByText("Project brief").tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).not.toHaveAttribute("onerror");
  });
});
