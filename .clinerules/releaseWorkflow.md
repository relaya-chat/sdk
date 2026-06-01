# Release Workflow — SDK Repo (Local Override)

This rule overrides the global `releaseWorkflow.md` for the `relaya-chat/sdk`
workspace. SDK releases publish npm packages — there is no Docker image, no
server deployment, and no `production` branch merge.

---

## Magic Phrase

`"prepare release vX.Y.Z"` or `"cut release vX.Y.Z"`

---

## Step 0 — Identify Changed Packages

Before anything else, determine which packages actually changed:

- `packages/core` → publishes `@relaya-chat/core`
- `packages/react` → publishes `@relaya-chat/react`
- `packages/react-native` → publishes `@relaya-chat/react-native`

Ask the user to confirm which packages are included in this release if it is
not obvious from the diff. All three share the same version number by
convention, but only changed packages need bumping.

---

## Phase 1 — Pre-Release Validation

1. **Check git status** — verify clean working tree (`git status`). Stop if dirty.
2. **Run tests** — `npm test` from the repo root (runs all workspace tests).
3. **Check for existing tag** — `git tag -l vX.Y.Z`. Stop if tag already exists.
4. **Report status** — inform user of any blockers before proceeding.

---

## Phase 2 — Version Updates

1. **Update `package.json` version** in each changed package directory
   (`packages/core`, `packages/react`, `packages/react-native`).
   - All published packages keep the same version number.
   - The root `package.json` is private and does not need a version bump.
2. **Run `npm install`** from the repo root to update `package-lock.json`.
3. **Verify** the correct packages reflect the new version.

---

## Phase 3 — Documentation

1. **Draft commit message** (present to user before committing):
   ```
   release: vX.Y.Z - <short description>
   
   - Bullet points summarizing changes
   ```
2. **Draft release notes** (present to user before publishing):
   - Title: `vX.Y.Z - <Short Description>`
   - Sections: What's new / Fixed / Changed
3. **Remind the user** that after this release is published to npm, any
   changes that affect the server bundle (iframe, relaya.chat demo) require
   a follow-up coordinated release in the `relaya` repo.

---

## Phase 4 — Commit and Push

After user approves the commit message:

1. `git add -A`
2. `git commit` using the approved message
3. `git push origin main`

---

## Phase 5 — Create GitHub Release (triggers npm publish)

The `publish.yml` GitHub Action fires on `release: published` and handles
the full build → test → `npm publish --workspaces` cycle automatically.

1. Write release notes to `/tmp/release-notes-vX.Y.Z.md`
2. Create the release:
   ```
   gh release create vX.Y.Z --target main --title "vX.Y.Z - <Short Description>" --notes-file /tmp/release-notes-vX.Y.Z.md
   ```
3. Delete temp file: `rm /tmp/release-notes-vX.Y.Z.md`
4. Verify: `gh release view vX.Y.Z`

---

## Phase 6 — Post-Release

1. Confirm the GitHub Action completed successfully:
   `gh run list --workflow=publish.yml --limit=1`
2. Verify packages are live on npm:
   - `npm view @relaya-chat/core version`
   - `npm view @relaya-chat/react version`
3. Remind the user:
   > "If these changes need to reach the relaya.chat demo or the self-hosted
   > iframe, start a coordinated release in the relaya repo (`cut release vX.Y.Z`)
   > and select release type 2 (Coordinated)."

---

## What Is NOT Part of This Workflow

- No `production` branch merge (SDK releases directly from `main`)
- No Docker build or server deployment
- No database migrations
- No `apps/chat-web` or `apps/www` version bumps (those live in the relaya repo)

---

## Release Type Reference

| Scope | How to release |
|---|---|
| SDK change only | This workflow — SDK repo only |
| Server change only | `relaya` repo, server-only release |
| SDK + server change | This workflow first, then relaya coordinated release |
