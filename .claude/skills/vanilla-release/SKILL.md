---
name: vanilla-release
description: Prepare a VanillaDatabase release or commit (version bump, changelog, docs check, secrets scan, build, Docker). Use when asked to release, tag, bump version, prepare a pull request, or finalize a commit.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Bash(git *), Bash(npm run *), Bash(npm test*), Bash(docker build*)
---

# vanilla-release

This skill has side effects; invoke explicitly. Never push or tag without the user's confirmation.

## Checklist

1. **Clean state**: `git status`; confirm only intended files changed. Check nothing from `data/`, `.env`, `*.rar`, `dist/`, audit folders, or keys is staged (see `.gitignore`).
2. **Secrets scan**: grep staged diff for `password`, `secret`, `token`, `PRIVATE KEY`, `.env` values; confirm `.env.example` contains placeholders only.
3. **Verify**: run `npm run test:audit` (typecheck, security tests, full tests, build). Everything must pass.
4. **Docs**: run the `vanilla-docs-sync` checklist; `docs/en` and `docs/vi` both updated.
5. **Version**: update `version` in `package.json` (and `package-lock.json` via `npm install --package-lock-only`). Follow semver: breaking API = major, feature = minor, fix = patch.
6. **Changelog**: `CHANGELOG.md` entry with date and categories (Added, Changed, Fixed, Security, Migration notes). Mention schema migrations and the recommended backup step.
7. **Docker**: if Dockerfile, compose, or env vars changed, run `docker build .` and confirm startup health.
8. **Commit message**: imperative, scoped, no emojis, for example `fix(storage): validate references before file insert`.
9. **Summary for the PR**: what changed, why, test evidence, risks, rollback notes.

## Rollback notes

- Migrations are forward-only; state whether a backup restore is required to roll back.

