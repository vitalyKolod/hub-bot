# HUB Bot development and deployment

- Treat production as a deployment target. Never edit application source there.
- Start each change from `main` in a new `feature/`, `fix/`, or `refactor/` branch.
- Run `npm ci`, `npm run build`, and `npm test` before pushing.
- Commit and push the branch, open a pull request, and wait for the CI check to pass before merging into `main`.
- Deploy only the tested commit from `main`. The deployment must stop if the production working tree is dirty; investigate and preserve changes before repairing it.
- Keep `.env`, tokens, passwords, database URIs, SSH keys, and other secrets out of Git. Configure production values on the server and GitHub Actions secrets in repository settings.
- After deployment, verify the Git commit and clean status, PM2 status, recent logs, and relevant bot flows.
