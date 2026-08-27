import test from "node:test";
import assert from "node:assert/strict";
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

test("unsupported files are ignored", () => {
  assert.deepEqual(extractComments("README.md", "<!-- not source -->"), []);
});
