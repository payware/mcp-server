# GitHub Publishing Workflow

GitLab has full history, GitHub has squashed/summarized commits.

## Daily Development

Work on `main`, commit and push to GitLab:

```bash
git push gitlab main
```

## Publishing to GitHub

When ready to publish updates to the public GitHub repo:

```bash
git checkout github-public
git merge main --squash
git commit -m "Summary of changes"
git push github github-public:main
git checkout main
```
