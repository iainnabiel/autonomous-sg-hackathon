# Agent Instructions

You are working on our Autonomous SG hackathon project.

Repository:
https://github.com/iainnabiel/autonomous-sg-hackathon

PROJECT CONTEXT
- Task plan, owners, and acceptance criteria (SG-01 to SG-09): docs/TASK_PLAN.md
- Challenge brief: Problem_Statement/PROBLEM_STATEMENT.md and Problem_Statement/Requirements.md
- Raw data lives in Datasets/ locally and is gitignored. Never commit it.
- Work only on tasks owned by the current user unless told otherwise.

Follow this Git workflow for every task. These rules apply to everyone, including the repository owner.

INITIAL CHECK
1. Confirm the current project directory and repository remote.
2. Read README.md, CONTRIBUTING.md, and any applicable AGENTS.md or agent instructions.
3. Inspect the current branch, working-tree status, and relevant open pull requests.
4. Preserve existing changes. Never discard, overwrite, or stash someone’s work without permission.

STARTING WORK
5. Fetch the latest origin/main before starting a new task.
6. Create a descriptive feature branch from the latest origin/main:
   - feature/<short-description>
   - fix/<short-description>
   - docs/<short-description>
7. Never implement changes directly on main.
8. If continuing an existing task, reuse its feature branch and open PR where appropriate.
9. If unrelated local changes prevent a clean start, use a separate worktree rather than disturbing them.

IMPLEMENTATION
10. Work only on the assigned task and files. Avoid unrelated refactors.
11. Respect the team’s agreed API contracts and file ownership. Flag shared-contract changes before implementing them.
12. Run checks appropriate to the change. Report actual results and any checks you could not run.
13. Never commit secrets, .env files, raw datasets, dependencies, or large generated model files. Follow repository conventions for shared artifacts.

COMMIT AND PULL REQUEST
14. Review the diff and stage only files belonging to this task.
15. Commit with a clear message, then push the feature branch.
16. Create or update a PR targeting main.
17. Include:
   - What changed and why.
   - How it was tested.
   - Known limitations or assumptions.
   - Any dependencies on another PR.
18. Request review from another teammate. If the reviewer is unspecified, ask which teammate should review.

REVIEW AND MERGING
19. Do not merge any PR or enable auto-merge. A human teammate will merge after approval.
20. Never push directly to main, force-push to main, or bypass branch protection.
21. Never approve your own PR or treat an AI review as the required teammate approval.
22. Address review feedback on the same feature branch, rerun relevant checks, and update the PR.
23. After changes following approval, request another teammate review.
24. Do not force-push a shared feature branch without explicit permission.

KEEPING UP TO DATE
25. Fetch origin/main before preparing the PR for review.
26. If updates from main are needed, merge origin/main into the feature branch and rerun affected checks.
27. Resolve straightforward conflicts within your task. Ask before resolving conflicts that would change another teammate’s intended behaviour.
28. After the PR is merged, start the next task on a new branch from the latest origin/main.

FINISH EACH TASK WITH
- A concise summary of changes.
- Branch name and latest commit.
- Checks run and their results.
- PR URL.
- Any blockers or required teammate decisions.
- Confirmation that the PR is awaiting human review/merge.

Do not begin implementing an unspecified task. First confirm the repository state and report that you are ready for your assigned work.