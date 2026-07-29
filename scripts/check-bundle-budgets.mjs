/* global console, process */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const outputDirectory = resolve("dist");
const manifest = JSON.parse(
  readFileSync(resolve(outputDirectory, ".vite/manifest.json"), "utf8"),
);

function gzipBytes(file) {
  return gzipSync(readFileSync(resolve(outputDirectory, file))).byteLength;
}

function collectStaticGraph(startKey) {
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Bundle manifest is missing ${key}.`);
    visited.add(key);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  };
  visit(startKey);
  return visited;
}

function findKey(predicate, description) {
  const key = Object.keys(manifest).find((candidate) =>
    predicate(manifest[candidate], candidate),
  );
  if (!key) throw new Error(`Could not find ${description} in the Vite manifest.`);
  return key;
}

function javascriptFiles(keys) {
  return [...keys]
    .map((key) => manifest[key].file)
    .filter((file) => file.endsWith(".js"));
}

function checkBudget(label, files, limitKilobytes) {
  const contributions = files
    .map((file) => ({ file, bytes: gzipBytes(file) }))
    .sort((a, b) => b.bytes - a.bytes);
  const measuredBytes = contributions.reduce((total, item) => total + item.bytes, 0);
  const limitBytes = limitKilobytes * 1024;
  const measured = (measuredBytes / 1024).toFixed(1);
  const details = contributions
    .map(({ file, bytes }) => `${file} (${(bytes / 1024).toFixed(1)} kB)`)
    .join(", ");

  if (measuredBytes > limitBytes) {
    failures.push(`${label}: ${measured} kB gzip exceeds ${limitKilobytes} kB. Chunks: ${details}`);
  } else {
    console.log(`✓ ${label}: ${measured} / ${limitKilobytes} kB gzip`);
  }
}

const failures = [];
const entryKey = findKey((chunk) => chunk.isEntry, "the application entry");
const authenticatedKey = findKey(
  (chunk) => chunk.isDynamicEntry && chunk.name === "AuthenticatedApp",
  "the authenticated application entry",
);
const editorKey = findKey(
  (chunk) => chunk.src === "src/components/features/RichTextEditor.tsx",
  "the rich-text editor chunk",
);

const signedOutGraph = collectStaticGraph(entryKey);
const authenticatedGraph = new Set([
  ...signedOutGraph,
  ...collectStaticGraph(authenticatedKey),
]);
const initialCss = new Set();
for (const key of signedOutGraph) {
  for (const file of manifest[key].css ?? []) initialCss.add(file);
}

checkBudget("Signed-out initial JavaScript", javascriptFiles(signedOutGraph), 110);
checkBudget("Authenticated Tasks loading graph", javascriptFiles(authenticatedGraph), 200);
checkBudget("Rich-text editor chunk", [manifest[editorKey].file], 130);
checkBudget("Total initial CSS", [...initialCss], 20);

if (failures.length > 0) {
  console.error("\nBundle budget failures:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
}
