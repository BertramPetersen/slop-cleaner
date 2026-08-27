# slop-cleaner

Review and clean unnecessary source-code comments introduced by pull requests. The CLI does not
call an LLM. It extracts comments locally so an interactive coding-agent session can make the
semantic keep/delete/rewrite decision using its normal subscription.

Comment extraction currently supports only `.ts`, `.tsx`, `.fs`, `.fsi`, and `.fsx`. Other files,
including Markdown, JSON, YAML, and lockfiles, are ignored.

## Install

```bash
npm install --global slop-cleaner
```

The repository must have an `origin` remote, and `gh` must be installed and authenticated. The
tool creates an isolated temporary worktree for the selected PR, so the current working tree may
contain uncommitted changes.

## Use

```bash
slop-cleaner
```

The command lists open PRs for the current repository, lets you select one, creates an isolated
worktree, and reviews comments with source context there. The worktree is left in place so you can
inspect or commit the resulting changes without affecting your original checkout.

After an agent has produced a decisions JSON file, apply it with:

```bash
slop-cleaner apply --input .slop-cleaner/pr-123-comments.json --decisions decisions.json
```

Run the project formatter and tests, then inspect `git diff` before pushing.
