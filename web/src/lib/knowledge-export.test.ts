import { describe, expect, it } from "vitest";
import { buildKnowledgeArchive, createZip, htmlToMarkdown, knowledgeToMarkdown } from "@/lib/knowledge-export";
import type { Capture } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Project } from "@/types/task";

const note: Knowledge = { id: "n1", title: "Two-minute rule", summary: "Start with a version that takes two minutes.", body: "<h2>Why</h2><p>Make it <strong>easy</strong> and <a href=\"https://example.com\">start</a>.</p><ul><li>Read one page</li><li>Do one push-up</li></ul>",
  projectId: "p1", linkedProjectIds: ["p2"], sourceIds: ["c1"], locator: "Ch. 13", categoryId: null, status: "evergreen", reviewStep: 1, nextReviewAt: 5, createdAt: Date.UTC(2026, 8, 1), updatedAt: Date.UTC(2026, 8, 2) };
const projects: Project[] = [{ id: "p1", title: "Read Atomic Habits", description: "", createdAt: 1 }, { id: "p2", title: "Fitness", description: "", createdAt: 1 }];
const captures: Capture[] = [{ id: "c1", kind: "book", url: null, title: "Atomic Habits", note: "", author: "James Clear", preview: null, isProcessed: false, createdAt: 1, updatedAt: 1 }];

describe("knowledge export", () => {
  it("converts editor HTML to Markdown", () => {
    expect(htmlToMarkdown(note.body)).toBe("### Why\n\nMake it **easy** and [start](https://example.com).\n\n- Read one page\n- Do one push-up");
    expect(htmlToMarkdown("<ol><li><p>First</p></li><li><p>Second</p></li></ol><blockquote><p>Quote</p></blockquote>")).toBe("1. First\n2. Second\n\n> Quote");
  });

  it("writes Obsidian-friendly frontmatter, summary, body, and sources", () => {
    const markdown = knowledgeToMarkdown(note, { projects, captures, categories: [] });
    expect(markdown).toContain('title: "Two-minute rule"\nstatus: evergreen\nproject: "Read Atomic Habits"\nlinked_projects:\n  - "Fitness"\nsources:\n  - "Atomic Habits"\nlocator: "Ch. 13"');
    expect(markdown).toContain("# Two-minute rule\n\n> Start with a version that takes two minutes.");
    expect(markdown).toContain("## Sources (Ch. 13)\n\n- Atomic Habits by James Clear");
  });

  it("builds a valid uncompressed ZIP with unique file names", async () => {
    const zip = createZip([{ name: "a.md", content: "hello" }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0x3610a686); // CRC-32 of "hello"
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);

    const archive = new TextDecoder().decode(await buildKnowledgeArchive([note, { ...note, id: "n2" }], { projects, captures, categories: [] }).arrayBuffer());
    expect(archive).toContain("Pokus Knowledge/Two-minute rule.md");
    expect(archive).toContain("Pokus Knowledge/Two-minute rule 2.md");
  });
});
