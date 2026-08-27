#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { extractComments, parserByExtension } from "./parsers.js";

function command(...args) {
  return execFileSync(args[0], args.slice(1), { encoding: "utf8" });
}

function changedLines(base, head) {
  const diff = command("git", "diff", "--no-color", "--unified=0", `${base}...${head}`);
  const result = new Map();
  let file;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      if (!result.has(file)) result.set(file, new Set());
      continue;
    }
    const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (match && file) {
      const start = Number(match[1]);
      const count = Number(match[2] ?? 1);
      for (let lineNumber = start; lineNumber < start + count; lineNumber += 1) {
        result.get(file).add(lineNumber);
      }
    }
  }
  return result;
}

function extract({ base, head, context = 4 }) {
  const changed = changedLines(base, head);
  const records = [];
  for (const [file, lines] of changed) {
    if (!parserByExtension.has(file.slice(file.lastIndexOf(".")).toLowerCase())) continue;
    if (!existsSync(file)) continue;
    const source = readFileSync(file, "utf8");
    const sourceLines = source.split(/\r?\n/);
    for (const comment of extractComments(file, source)) {
      if (![...lines].some((line) => line >= comment.start_line && line <= comment.end_line)) continue;
      const first = Math.max(1, comment.start_line - context);
      const last = Math.min(sourceLines.length, comment.end_line + context);
      records.push({
        id: `comment-${records.length + 1}`,
        file,
        start_line: comment.start_line,
        end_line: comment.end_line,
        start_column: comment.start_column,
        end_column: comment.end_column,
        text: comment.text,
        raw: comment.raw,
        context_start_line: first,
        context: sourceLines.slice(first - 1, last)
      });
    }
  }
  return records;
}

function apply(inputPath, decisionsPath) {
  const records = Object.fromEntries(JSON.parse(readFileSync(inputPath, "utf8")).map((record) => [record.id, record]));
  const decisions = JSON.parse(readFileSync(decisionsPath, "utf8"));
  const edits = new Map();
  for (const decision of decisions) {
    const record = records[decision.id];
    if (!record || !["keep", "delete", "rewrite", "escalate"].includes(decision.decision)) throw new Error(`invalid decision: ${JSON.stringify(decision)}`);
    if (["keep", "escalate"].includes(decision.decision)) continue;
    const file = resolve(record.file);
    const source = readFileSync(file, "utf8");
    const start = source.indexOf(record.raw);
    if (start < 0 || source.indexOf(record.raw, start + 1) >= 0) throw new Error(`stale or ambiguous comment ${record.id} in ${record.file}`);
    if (decision.decision === "rewrite" && typeof decision.replacement !== "string") throw new Error(`rewrite ${record.id} needs replacement`);
    if (!edits.has(file)) edits.set(file, []);
    edits.get(file).push({ start, end: start + record.raw.length, raw: record.raw, replacement: decision.decision === "delete" ? "" : decision.replacement });
  }
  for (const [file, fileEdits] of edits) {
    let source = readFileSync(file, "utf8");
    for (const edit of fileEdits.sort((a, b) => b.start - a.start)) {
      if (source.slice(edit.start, edit.end) !== edit.raw) throw new Error(`file changed while applying ${file}`);
      source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
    }
    writeFileSync(file, source);
  }
}

async function runInteractive() {
  let remote;
  try { remote = command("git", "remote", "get-url", "origin").trim(); } catch { throw new Error("current directory has no remote named origin"); }
  if (command("git", "status", "--porcelain").trim()) throw new Error("working tree is not clean; commit or stash changes first");
  let pullRequests;
  try { pullRequests = JSON.parse(command("gh", "pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,baseRefName,headRefName,url")); }
  catch { throw new Error("could not list open PRs; install gh and run gh auth login"); }
  if (!pullRequests.length) throw new Error(`no open PRs found for ${remote}`);
  console.log(`Open PRs for ${remote}:`);
  pullRequests.forEach((pr, index) => console.log(`  ${index + 1}. #${pr.number} ${pr.title} (${pr.headRefName} -> ${pr.baseRefName})`));
  const reader = createInterface({ input, output });
  const answer = await reader.question("Select a PR (number, or q to quit): ");
  reader.close();
  if (answer.toLowerCase() === "q") return;
  const selected = pullRequests[Number(answer) - 1];
  if (!selected) throw new Error("invalid PR selection");
  const checkout = spawnSync("gh", ["pr", "checkout", String(selected.number)], { stdio: "inherit" });
  if (checkout.status !== 0) throw new Error(`could not check out PR #${selected.number}`);
  const records = extract({ base: `origin/${selected.baseRefName}`, head: "HEAD" });
  mkdirSync(".slop-cleaner", { recursive: true });
  await reviewRecords(records, `.slop-cleaner/pr-${selected.number}-decisions.json`);
}

async function reviewRecords(records, decisionsPath) {
  if (!records.length) {
    console.log("No comments were found on changed lines.");
    return;
  }
  const reader = createInterface({ input, output });
  const decisions = [];
  for (const [index, record] of records.entries()) {
    console.log(`\nComment ${index + 1}/${records.length}: ${record.file}:${record.start_line}`);
    console.log(`  ${record.text}`);
    console.log("\n  Context:");
    record.context.forEach((line, contextIndex) => console.log(`  ${String(record.context_start_line + contextIndex).padStart(4)} | ${line}`));
    while (true) {
      const choice = (await reader.question("\n  [k]eep [d]elete [r]ewrite [e]scalate: ")).trim().toLowerCase();
      if (choice === "k" || choice === "keep") {
        decisions.push({ id: record.id, decision: "keep" });
        break;
      }
      if (choice === "d" || choice === "delete") {
        decisions.push({ id: record.id, decision: "delete" });
        break;
      }
      if (choice === "e" || choice === "escalate") {
        decisions.push({ id: record.id, decision: "escalate" });
        break;
      }
      if (choice === "r" || choice === "rewrite") {
        const replacement = await reader.question("  Replacement comment (without leading whitespace): ");
        decisions.push({ id: record.id, decision: "rewrite", replacement });
        break;
      }
      console.log("  Choose k, d, r, or e.");
    }
  }
  reader.close();
  mkdirSync(resolve(decisionsPath, ".."), { recursive: true });
  writeFileSync(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`);
  const changes = decisions.filter(({ decision }) => decision === "delete" || decision === "rewrite").length;
  console.log(`\nReviewed ${records.length} comment(s); ${changes} change(s) selected.`);
  if (!changes) return;
  const confirmationReader = createInterface({ input, output });
  const confirmation = (await confirmationReader.question("Apply these changes? [y/N] ")).trim().toLowerCase();
  confirmationReader.close();
  if (confirmation === "y" || confirmation === "yes") {
    applyRecords(records, decisions, decisionsPath);
    console.log("Changes applied. Run your formatter and tests, then inspect git diff.");
  } else {
    console.log(`Decisions saved to ${decisionsPath}; no files were changed.`);
  }
}

function applyRecords(records, decisions, decisionsPath) {
  const recordsPath = ".slop-cleaner/comments.json";
  writeFileSync(recordsPath, `${JSON.stringify(records, null, 2)}\n`);
  writeFileSync(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`);
  apply(recordsPath, decisionsPath);
}

function help() {
  console.log("Usage: slop-cleaner [run|review|extract|apply]");
  console.log("  slop-cleaner                 select an open PR and extract comments");
  console.log("  slop-cleaner review ...      review extracted comments interactively");
  console.log("  slop-cleaner extract ...     extract comments for explicit refs");
  console.log("  slop-cleaner apply ...       apply reviewed decisions");
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(argv) {
  const [subcommand, ...args] = argv;
  if (!subcommand || subcommand === "run") return runInteractive();
  if (subcommand === "--help" || subcommand === "-h") return help();
  if (subcommand === "extract") {
    const base = option(args, "--base");
    const head = option(args, "--head");
    if (!base || !head) throw new Error("extract requires --base and --head");
    const records = extract({ base, head, context: Number(option(args, "--context") || 4) });
    const outputPath = option(args, "--output");
    if (outputPath) {
      mkdirSync(resolve(outputPath, ".."), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(records, null, 2)}\n`);
    }
    else console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (subcommand === "review") {
    const inputPath = option(args, "--input");
    if (!inputPath) throw new Error("review requires --input");
    const decisionsPath = option(args, "--decisions") || ".slop-cleaner/decisions.json";
    return reviewRecords(JSON.parse(readFileSync(inputPath, "utf8")), decisionsPath);
  }
  if (subcommand === "apply") {
    const inputPath = option(args, "--input");
    const decisionsPath = option(args, "--decisions");
    if (!inputPath || !decisionsPath) throw new Error("apply requires --input and --decisions");
    return apply(inputPath, decisionsPath);
  }
  throw new Error(`unknown command: ${subcommand}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => { console.error(`slop-cleaner: ${error.message}`); process.exitCode = 1; });
}

export { apply, changedLines, extract };
