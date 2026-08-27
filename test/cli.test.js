import test from "node:test";
import assert from "node:assert/strict";
import { scanComments } from "../src/cli.js";

test("ignores comment markers inside strings", () => {
  assert.deepEqual(scanComments('const value = "// not a comment";\n// explain why\n').map(({ text }) => text), ["explain why"]);
});

test("finds line and block comments", () => {
  assert.equal(scanComments("/* reason */\nvalue(); // detail").length, 2);
});
