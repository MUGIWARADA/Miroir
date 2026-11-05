# GitHub collaboration

These rules apply to human contributors, agents, and automated update PRs.

## 1. Start from current code

Check for existing work before changing anything:

```bash
git status --short --branch
git fetch origin
```

If the working tree is dirty, preserve it. Do not reset, delete, stash, or switch branches over another contributor's work. Use a separate worktree or agree on the next step.

For a clean checkout starting new work:

```bash
git switch main
git pull --ff-only origin main
python3 .github/checks.py
python3 -m unittest discover -s .github -p 'test_*.py'
git switch -c feat/short-description
```

Use a branch prefix of `feat/`, `fix/`, `chore/`, or `docs/`. Dependabot uses its own generated branch names.

Run the baseline checks before edits. Record existing failures and stop if they prevent reliable verification.

## 2. Keep changes focused

One PR should deliver one coherent result, with its relevant tests and documentation. Keep unrelated cleanup and dependency upgrades separate.

Stage intended paths explicitly. Review `git diff --cached` before committing. Do not commit secrets, generated runtime data, local environments, or unrelated files.

Do not amend, rebase, squash, or force-push published work without the branch owner's agreement. Use new commits for review fixes by default.

If main advances, coordinate any necessary branch update. Avoid merge commits in feature branches. Re-run checks after updating the branch. Never force-push main.

## 3. Strict commit and PR titles

Every commit subject and PR title must use this format:

```text
type(optional-scope): short imperative description
```

Only four types are allowed:

| Type | Purpose |
| --- | --- |
| feat | Add or change product behavior |
| fix | Correct a defect |
| chore | Repository tooling, CI, dependencies, or maintenance |
| docs | Documentation changes |

Use `chore` for test-only, build, CI, and behavior-preserving refactoring changes. Include behavior tests with the relevant `feat` or `fix` change.

Examples:

```text
feat(strategy): collect exit-plan answers
fix(review): reject an outdated strategy result
chore(ci): validate pull request commit subjects
docs: explain AI service boundaries
```

Requirements:

- Start the description with a lowercase letter.
- Keep the entire subject at most 72 characters.
- Do not end it with a period or whitespace.
- Use a lowercase scope containing letters, numbers, dots, underscores, slashes, or hyphens.
- A breaking change may use `!` before the colon and must explain the impact and migration in the body.
- Explain what changed and why in the body when the subject is insufficient.
- Do not use WIP, fixup, squash, generic update messages, or merge commits.

The `Commit policy` CI check enforces the allowed syntax, length, and linear commit history. Human review verifies that the description accurately explains the change.

## 4. Before requesting review

Run:

```bash
python3 .github/checks.py
python3 -m unittest discover -s .github -p 'test_*.py'
git diff --check
```

Also run all applicable application checks once they exist. Do not claim application tests passed while the repository contains only foundation tooling.

Use the [PR template](.github/pull_request_template.md). Explain the result, reason, verification, and any remaining limitation. Update the title and description if the final scope changes.

Review correctness, readability, service boundaries, security, and unnecessary complexity. Resolve required findings. Label optional suggestions clearly.

## 5. Merge gate

After the initial repository bootstrap, all changes to main must use a PR.

A maintainer may merge only when:

- The branch is current with main and conflicts are resolved.
- `Repository checks` and `Commit policy` pass for the current PR.
- At least one other human reviewer has approved.
- Approval is renewed after new commits, and conversations are resolved.
- The PR contains only its intended changes.

Use squash merge so the validated PR title becomes one clear commit on main. Review the resulting commit message before confirming the merge. Merge and rebase buttons should be disabled.

Do not bypass a failed or pending check, even as an administrator. No bot or agent may approve its own work or merge unattended.

Required checks, current-branch requirements, review requirements, and force-push restrictions must be enforced in GitHub settings. Workflow files alone do not enforce the merge gate. Private-repository enforcement requires a GitHub plan that supports branch protection or rulesets.

The initial root commit may bootstrap the repository after its available local checks pass. The merge gate applies to subsequent changes.

## 6. Automatic updates and CI permissions

Dependabot opens weekly GitHub Actions update PRs using the same commit policy. Review each update and wait for CI before merging.

Workflows use read-only repository permissions and SHA-pinned external actions. Do not add secrets, write permissions, or automatic deployment unless the task requires and reviews them.

Application dependency updates and deployment gates will be configured when the corresponding application and deployment target exist.

## References

- [Google: Small changes](https://google.github.io/eng-practices/review/developer/small-cls.html)
- [Google: Change descriptions](https://google.github.io/eng-practices/review/developer/cl-descriptions.html)
- [Google: Review standard](https://google.github.io/eng-practices/review/reviewer/standard.html)
