# GitHub collaboration

## Branches

- Use feature branches from `main`.
- Suggested names: `feat/backend-mvp-slice`, `fix/review-idempotency`, `docs/neon-runbook`.
- Do not push directly to `main`.

## Commits

Use one logical change per commit.

Format:

`type(scope): lowercase description`

Allowed types: `feat`, `fix`, `chore`, `docs`.

Rules:

- Scope is optional and lowercase.
- Description is lowercase.
- Maximum subject length is 72 characters.
- No trailing period.
- No merge commits in pull requests.

Examples:

- `feat(api): add strategy confirmation`
- `fix(scoring): treat missing evidence as unassessed`
- `docs: add neon migration runbook`

## Pull requests

- Open a pull request into `main`.
- Use a PR title that follows the commit subject format.
- Describe the change, testing, and any contract impact.
- Require one human approval.
- Agents may prepare changes but may not approve or merge.
- Squash merge after approval and passing CI.

## CI expectations

The first application PR must keep real commands for lint, typecheck, tests, and build. Do not replace them with placeholders.
