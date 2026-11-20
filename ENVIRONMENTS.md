# Environments

The project runs in four parallel environments so changes can be tried out
without touching prod.

| Env     | Git branch | Pages URL                           | Worker                                | Role                                |
|---------|------------|-------------------------------------|---------------------------------------|-------------------------------------|
| **prod** | `main`    | https://qb-trainer.pages.dev        | `quizbowl-rooms` (top-level)          | Live site. Users land here.         |
| **qa**  | `qa`       | https://qa.qb-trainer.pages.dev     | `qa-quizbowl-rooms`                   | Release candidate; last check before prod. |
| **prev** | `preview` | https://preview.qb-trainer.pages.dev | `prev-quizbowl-rooms`                 | Integration / staging. Feature PRs merge here first. |
| **dev** | `dev`      | https://dev.qb-trainer.pages.dev    | `dev-quizbowl-rooms`                  | Open sandbox for in-progress work.  |

All four envs currently share the `qb-trainer-auth` D1 database. Separating
them is a planned follow-up — see the "Future work" section below.

## Branching flow

```
dev   →   preview   →   qa   →   main (prod)
          (integrate)   (RC)   (release)
```

- `dev` is where new work lands first.
- When a change is good enough to show other contributors, merge it into
  `preview` (or `prev`) and point them at the preview URL.
- When a change is ready to ship but we want a soak period, merge it into
  `qa`. The QA URL mirrors what prod will look like after the next release.
- When QA is green, fast-forward `main` to `qa`.

Each branch deploys automatically on push:

- **Pages**: The `qb-trainer` Cloudflare Pages project watches the GitHub
  repo and builds any branch push. The alias `<branch>.qb-trainer.pages.dev`
  points at the latest deploy on that branch.
- **Worker**: Deploy from `web/` with the matching `--env` flag:
  ```bash
  cd web
  npx wrangler deploy                # prod (top-level)
  npx wrangler deploy --env qa       # qa
  npx wrangler deploy --env prev     # prev
  npx wrangler deploy --env dev      # dev
  ```

## Pages env vars (per branch)

Each Pages build needs `WORKER_ORIGIN` pointing at the matching Worker so
`/api/*` proxies correctly. Set these once per branch under Settings →
Environment variables → Preview branch:

| Branch   | `WORKER_ORIGIN`                                                  |
|----------|------------------------------------------------------------------|
| `main`   | https://quizbowl-rooms.vishruthvikram2029.workers.dev            |
| `qa`     | https://qa-quizbowl-rooms.vishruthvikram2029.workers.dev         |
| `preview`| https://prev-quizbowl-rooms.vishruthvikram2029.workers.dev       |
| `dev`    | https://dev-quizbowl-rooms.vishruthvikram2029.workers.dev        |

## Branch protection

`main` is protected (GitHub classic branch protection, 2026-11-20):

- Pull request required before merge (0 required approvals, so solo
  work still ships but has to go through a PR).
- Linear history required — no merge commits, use squash or rebase.
- Conversation resolution required before merge.
- Force-push and delete blocked.
- Admins are **not** enforced (so the repo owner can still fast-forward
  in a hurry); flip `enforce_admins=true` once the team grows.

The repo had to go **public** for GitHub to unlock protection on the
free plan.

## Future work (not done yet)

1. **Separate D1 per environment.** Run
   `wrangler d1 create qb-trainer-auth-{qa,prev,dev}` and point each
   `[env.*].d1_databases` block at its own `database_id`. Apply the shared
   migrations folder to each.
2. **Env indicator banner.** Replace the `pre-alpha` badge with an env badge
   that reads a `VITE_ENV` constant and shows `DEV` / `PREV` / `QA` on
   non-prod. Keep `pre-alpha` on prod until launch.
3. **Required status checks.** Once CI is wired up, add the test-job name
   to `required_status_checks.contexts` so PRs can't merge red.
