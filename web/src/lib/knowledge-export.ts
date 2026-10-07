import { captureDisplayTitle } from "@/lib/capture";
import type { Capture } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Category, Project } from "@/types/task";

export interface ExportContext {
  projects: Project[];
  captures: Capture[];
  categories: Category[];
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/([*_`[\]\\])/g, "\\$1");
  if (!(node instanceof Element)) return "";
  const content = Array.from(node.childNodes, inline).join("");
  switch (node.tagName.toLowerCase()) {
    case "strong": case "b": return content.trim() ? `**${content}**` : content;
    case "em": case "i": return content.trim() ? `*${content}*` : content;
    case "s": case "del": return content.trim() ? `~~${content}~~` : content;
    case "code": return `\`${node.textContent ?? ""}\``;
    case "a": { const href = node.getAttribute("href"); return href ? `[${content}](${href})` : content; }
    case "br": return "  \n";
    default: return content;
  }
}

function block(node: Node, depth = 0): string {
  if (!(node instanceof Element)) return inline(node).trim() ? inline(node) : "";
  const tag = node.tagName.toLowerCase();
  const children = () => Array.from(node.childNodes, (child) => block(child, depth)).filter(Boolean).join("\n\n");
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Math.min(6, Number(tag[1]) + 1))} ${inline(node).trim()}`;
  if (tag === "p") return inline(node).trim();
  if (tag === "blockquote") return children().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
  if (tag === "pre") return `\`\`\`\n${node.textContent ?? ""}\n\`\`\``;
  if (tag === "hr") return "---";
  if (tag === "ul" || tag === "ol") {
    return Array.from(node.children).filter((child) => child.tagName.toLowerCase() === "li").map((item, index) => {
      const marker = tag === "ol" ? `${index + 1}.` : "-";
      const parts = Array.from(item.childNodes, (child) => child instanceof Element && /^(ul|ol)$/i.test(child.tagName) ? `\n${block(child, depth + 1)}` : child instanceof Element && child.tagName.toLowerCase() === "p" ? inline(child).trim() : inline(child)).join("").trim();
      return `${"  ".repeat(depth)}${marker} ${parts}`;
    }).join("\n");
  }
  return children() || inline(node).trim();
}

/** Converts the editor's rich-text HTML to Markdown. */
export function htmlToMarkdown(html: string) {
  if (!html.trim()) return "";
  const document = new DOMParser().parseFromString(html, "text/html");
  return Array.from(document.body.childNodes, (node) => block(node)).filter(Boolean).join("\n\n").trim();
}

const yamlString = (value: string) => JSON.stringify(value);
const yamlList = (key: string, values: string[]) => values.length ? `${key}:\n${values.map((value) => `  - ${yamlString(value)}`).join("\n")}` : `${key}: []`;

/** One note as Markdown with YAML frontmatter that Obsidian understands. */
export function knowledgeToMarkdown(note: Knowledge, { projects, captures, categories }: ExportContext) {
  const projectTitle = (id: string) => projects.find((project) => project.id === id)?.title;
  const sources = note.sourceIds.flatMap((id) => captures.find((capture) => capture.id === id) ?? []);
  const linked = note.linkedProjectIds.flatMap((id) => projectTitle(id) ?? []);
  const origin = note.projectId ? projectTitle(note.projectId) : undefined;
  const category = categories.find((item) => item.id === note.categoryId)?.name;
  const frontmatter = [
    `title: ${yamlString(note.title)}`,
    `status: ${note.status}`,
    origin ? `project: ${yamlString(origin)}` : null,
    yamlList("linked_projects", linked),
    yamlList("sources", sources.map(captureDisplayTitle)),
    note.locator ? `locator: ${yamlString(note.locator)}` : null,
    category ? `tags:\n  - ${yamlString(category)}` : null,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
  ].filter(Boolean).join("\n");
  const sourceLines = sources.map((capture) => {
    const title = captureDisplayTitle(capture);
    const label = capture.url ? `[${title}](${capture.url})` : title;
    return `- ${label}${capture.author ? ` by ${capture.author}` : ""}`;
  });
  return [
    `---\n${frontmatter}\n---`,
    `# ${note.title}`,
    note.summary ? note.summary.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n") : null,
    htmlToMarkdown(note.body) || null,
    sourceLines.length ? `## Sources${note.locator ? ` (${note.locator})` : ""}\n\n${sourceLines.join("\n")}` : null,
  ].filter(Boolean).join("\n\n") + "\n";
}

/** A file name that works on every OS, made unique within the archive. */
function fileName(title: string, used: Set<string>) {
  // eslint-disable-next-line no-control-regex -- control characters are invalid in file names
  const base = title.replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim().slice(0, 100) || "Untitled";
  let name = `${base}.md`;
  for (let index = 2; used.has(name.toLocaleLowerCase()); index += 1) name = `${base} ${index}.md`;
  used.add(name.toLocaleLowerCase());
  return name;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** An uncompressed ZIP archive; Markdown is small, so this avoids a compression dependency. */
export function createZip(files: { name: string; content: string }[], date = new Date()) {
  const encoder = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    // Local file header; bit 11 marks UTF-8 file names.
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, day, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([at, value, size]) => size === 4 ? local.setUint32(at, value, true) : local.setUint16(at, value, true));
    const header = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, day, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([at, value, size]) => size === 4 ? header.setUint32(at, value, true) : header.setUint16(at, value, true));
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(header.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, centralSize, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([at, value, size]) => size === 4 ? end.setUint32(at, value, true) : end.setUint16(at, value, true));
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)].map((part) => part.slice().buffer), { type: "application/zip" });
}

export function buildKnowledgeArchive(notes: Knowledge[], context: ExportContext) {
  const used = new Set<string>();
  return createZip(notes.map((note) => ({ name: `Pokus Knowledge/${fileName(note.title, used)}`, content: knowledgeToMarkdown(note, context) })));
}

export function downloadKnowledgeArchive(notes: Knowledge[], context: ExportContext) {
  const url = URL.createObjectURL(buildKnowledgeArchive(notes, context));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pokus-knowledge-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
