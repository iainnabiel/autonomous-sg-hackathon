# Autonomous SG Hackathon

Shared project for the Autonomous SG Hackathon. Changes to `main` are merged through pull requests.

## Team Git Workflow

Everyone, including the repository owner, follows this process.

- **Never push directly to `main`.**
- **Never merge your own pull request without another teammate’s approval.**
- **Do not force-push to `main`.**
- **These rules apply to everyone, including the owner.**

GitHub branch protection is currently unavailable for this private repository, so this workflow is a team agreement and is not technically enforced.

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

See [CONTRIBUTING.md](CONTRIBUTING.md) for the same workflow.
