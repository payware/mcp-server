# GitHub Publishing Workflow

GitLab has full history, GitHub has squashed/summarized commits.

## Daily Development

Work on `main`, commit and push to GitLab:

```bash
git push gitlab main
```

## Publishing to GitHub

`github-public` and `main` have **unrelated histories** - the public branch was started from its own
root commit, not branched from `main`. So `git merge main --squash` fails with "refusing to merge
unrelated histories", and `--allow-unrelated-histories` would produce conflicts on every file rather
than the clean squash we want.

Set the tree directly instead. This makes the index and working tree exactly match `main` while HEAD
stays on `github-public`, so the commit carries main's tree on the public branch's history - which is
precisely what a squashed publish is:

```bash
git checkout main && npm test          # never publish a red tree
git checkout github-public
git read-tree -u --reset main          # tree := main, HEAD stays here
git status                             # review what is being published
git commit -m "Summary of changes"
git push github github-public:main
git checkout main
```

`read-tree` touches only tracked files, so the private material stays put: `internal-docs/`,
`docs/MCP_TOOLS_DOCUMENTATION.md`, `keys/*.pem` and `.env` are untracked (see `.git/info/exclude` and
`.gitignore`), are in neither tree, and cannot be published by this or any other tree operation.

**Check before pushing**, because a public push cannot be taken back:

```bash
git ls-files | grep -iE '\.pem$|\.key$|^\.env|internal-docs'   # must be empty
git grep -n "BEGIN.*PRIVATE KEY" -- .    # must be placeholders and PEM-parsing code only
```

### What is NOT excluded from the public repo

Nothing, beyond the untracked private material above. The logs tools were absent from the public repo
until 2026-08-23 purely because the previous publish (v1.2.0, 2026-01-07) predated them by two days -
it was staleness, not policy. Plan gating is enforced server-side, so a non-Premium partner calling a
Premium tool gets a 403 either way; withholding the client code gates nothing and only hides that the
feature exists. Owner decision 2026-08-23: publish the full tool set.
