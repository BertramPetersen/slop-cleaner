# slop-cleaner

Review and clean unnecessary source-code comments introduced by pull requests. The CLI does not
call an LLM. It extracts comments locally so an interactive coding-agent session can make the
semantic keep/delete/rewrite decision using its normal subscription.

## Install

```bash
npm install --global slop-cleaner
```

The repository must have an `origin` remote, `gh` must be installed and authenticated, and the
working tree must be clean.

## Use

```bash
slop-cleaner
```

The command lists open PRs for the current repository, lets you select one, checks it out, and
writes comment records with source context to `.slop-cleaner/`.

After an agent has produced a decisions JSON file, apply it with:

```bash
slop-cleaner apply --input .slop-cleaner/pr-123-comments.json --decisions decisions.json
```

Run the project formatter and tests, then inspect `git diff` before pushing.
