# Contributing to @relaya/react

Thank you for your interest in contributing to Relaya. Contributions are welcome — bug reports, documentation improvements, and pull requests all help make the SDK better.

---

## Contributor License Agreement (CLA)

**Before your pull request can be merged, you must agree to the Relaya CLA.**

By submitting a pull request, you agree to the following terms:

> I hereby assign to JAB Ventures, Inc. ("the Project Maintainer") all right, title, and interest in and to the copyright of my contributions to this repository, including all modifications, additions, and derivative works. I represent that I am the original author of my contributions and that I have the right to make this assignment. I retain the right to use my contributions for any purpose, including in other projects.

This copyright assignment is what allows the project to:
- Maintain a single clean copyright holder across all contributions
- Relicense the project in the future if needed (e.g., for commercial exceptions or dual licensing)
- Enforce the license against bad actors if necessary

This is the same model used by projects like CockroachDB, HashiCorp, and others. The code remains MIT-licensed — contributors retain the right to use their own contributions in any other project.

If you are contributing on behalf of an employer, ensure you have the authority to assign copyright on their behalf before submitting.

---

## Ways to Contribute

### Bug reports

Open an issue on GitHub with:
- A clear description of the bug
- Steps to reproduce it
- Expected vs. actual behavior
- Relevant environment details (React version, browser, framework)

### Documentation improvements

Documentation fixes and clarifications are always welcome. Open a PR directly — no issue required for small changes.

### Feature requests

Open an issue describing the feature and its use case. Discussion first is preferred before any implementation work begins — this avoids wasted effort on features that don't fit the project's direction.

### Pull requests

For anything beyond a small documentation fix:
1. Open an issue first to discuss the change
2. Wait for acknowledgment before starting implementation
3. Keep PRs focused — one logical change per PR
4. Include a clear description of what the PR does and why

---

## Development Setup

This repository is a monorepo containing the `@relaya/react` package. To get started:

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test
```

The SDK connects to a Relaya backend. For development and testing, use the sandbox environment at [relaya.chat](https://relaya.chat) — create a free account and use your space slug in your test setup.

---

## Code Style

- TypeScript for all source files
- Follow the existing patterns in the codebase
- No new dependencies without discussion — keep the bundle small
- Hooks and components should be composable and not assume a specific layout or styling

---

## Commit Messages

Follow the conventional commits format:

```
feat: add X
fix: correct Y behavior
docs: update README
chore: update dependencies
```

---

## Code of Conduct

Be respectful. Constructive criticism is welcome; personal attacks are not. Maintainers reserve the right to close issues or remove comments that are disruptive.

---

## Questions?

Open a GitHub Discussion or email [hello@relaya.chat](mailto:hello@relaya.chat).
