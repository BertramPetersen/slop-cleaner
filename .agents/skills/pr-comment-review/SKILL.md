---
name: pr-comment-review
description: Review comments introduced by a pull request and remove or rewrite comments that describe what code does instead of why it does it. Use when cleaning LLM-generated comments in a PR. Not for reviewing GitHub discussion comments or general code quality.
---

# PR comment review

Use the installed `slop-cleaner` CLI. It performs extraction and patching locally; it does not call
an LLM API. The semantic decisions are made interactively by the current agent or user using the
normal subscription-based session.

```bash
npm install --global slop-cleaner
slop-cleaner
```

The CLI verifies the current repository's `origin`, lists its open PRs through `gh`, and prompts
for a selection. It creates an isolated temporary worktree for the selected PR, so the current
checkout may contain uncommitted changes and remains untouched. The isolated worktree is left in
place for inspection after review.

Review each displayed comment independently. Do not assume a comment is valid because it uses
words such as `WHY` or `NOTE`.

- `k` keep the comment because it records a non-obvious reason
- `d` delete it because it describes what the code does or adds no durable value
- `r` rewrite it without inventing a rationale
- `e` escalate when the decision requires domain knowledge unavailable in the repository

Confirm the summary only after reviewing all comments. After changes are applied, run the
repository formatter and tests and inspect the isolated worktree's `git diff` before committing or
pushing.

The CLI supports `.ts`, `.tsx`, `.fs`, `.fsi`, and `.fsx`. It ignores Markdown, JSON, YAML,
lockfiles, and other unsupported file types. Adjacent standalone comment lines are presented as a
single review item.

Do not invent a rationale. If the reason cannot be established from repository evidence, delete or
escalate the comment. Preserve comments that are required for compiler, formatter, lint, generated
code, or license behavior.
