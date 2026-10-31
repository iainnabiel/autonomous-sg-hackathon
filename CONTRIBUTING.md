# Contributing

Do not push directly to `main`. Land changes through a pull request that another teammate reviews and approves.

1. Update local `main` before starting work.

   ```bash
   git checkout main
   git pull origin main
   ```

2. Create a feature branch, such as `feature/login`.

   ```bash
   git checkout -b feature/login
   ```

3. Commit and push that feature branch.

   ```bash
   git push -u origin HEAD
   ```

4. Open a pull request targeting `main`.
5. Have another teammate review and approve it before merging.
