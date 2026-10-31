# Contributing

Everyone, including the repository owner, follows this workflow.

- Never push directly to `main`.
- Never merge your own pull request without another teammate’s approval.
- Do not force-push to `main`.
- These rules apply to everyone, including the owner.

GitHub enforces protection on `main` for everyone, including administrators. A pull request and at least one approving review are required, stale approvals are dismissed when new commits are pushed, review conversations must be resolved, and force pushes and branch deletion are blocked. No one can bypass these rules.

1. Update local `main`:

   ```bash
   git switch main
   git pull --ff-only origin main
   ```

2. Create a descriptive feature branch:

   ```bash
   git switch -c feature/short-description
   ```

3. Make changes, stage the intended files, and commit.

4. Push the feature branch:

   ```bash
   git push -u origin feature/short-description
   ```

5. Open a pull request targeting `main`. Describe what changed and how it was tested.

6. Request review from another teammate. Wait for at least one teammate’s approval and address review comments before merging.

7. If code changes after approval, request another review before merging.
