import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../src/cli.js";
import { extractComments } from "../src/parsers.js";

test("TypeScript parser ignores comment markers inside strings", () => {
  assert.deepEqual(extractComments("example.ts", 'const value = "// not a comment";\n// explain why\n').map(({ text }) => text), ["explain why"]);
});

test("TypeScript parser finds line and block comments", () => {
  assert.equal(extractComments("example.ts", "/* reason */\nvalue(); // detail").length, 2);
});

test("F# parser handles line and block comments", () => {
  assert.deepEqual(extractComments("example.fs", "let value = 1 // detail\n(* reason *)").map(({ text }) => text), ["detail", "reason"]);
});

test("F# parser handles XML docs and nested blocks", () => {
  const comments = extractComments("example.fs", "/// docs\nlet value = (* outer (* inner *) block *) 1");
  assert.deepEqual(comments.map(({ text }) => text), ["docs", "outer (* inner *) block"]);
  assert.equal(comments[0].start_line, 1);
  assert.equal(comments[1].start_line, 2);
});

test("groups adjacent standalone comments but not trailing comments", () => {
  const comments = extractComments("example.fs", "/// first\n/// second\nlet value = 1 // trailing\n");
  assert.equal(comments.length, 2);
  assert.equal(comments[0].text, "first\nsecond");
  assert.equal(comments[0].raw, "/// first\n/// second");
  assert.equal(comments[1].text, "trailing");
});

test("unsupported files are ignored", () => {
  assert.deepEqual(extractComments("README.md", "<!-- not source -->"), []);
});

test("deleting a standalone comment removes its whitespace-only line", () => {
  const directory = mkdtempSync(join(tmpdir(), "slop-cleaner-test-"));
  const sourcePath = join(directory, "example.fs");
  const commentsPath = join(directory, "comments.json");
  const decisionsPath = join(directory, "decisions.json");
  writeFileSync(sourcePath, "let value = 1\n  // remove me\nlet next = 2 // keep code\n");
  writeFileSync(commentsPath, JSON.stringify([
    { id: "comment-1", file: sourcePath, raw: "// remove me" },
    { id: "comment-2", file: sourcePath, raw: "// keep code" }
  ]));
  writeFileSync(decisionsPath, JSON.stringify([
    { id: "comment-1", decision: "delete" },
    { id: "comment-2", decision: "delete" }
  ]));
  apply(commentsPath, decisionsPath);
  assert.equal(readFileSync(sourcePath, "utf8"), "let value = 1\nlet next = 2 \n");
});
