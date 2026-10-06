# CosmoZeta hourly agent

The `CosmoZeta hourly agent` workflow runs at minute 17 of each hour and can also be started manually from the Actions tab. It opens a fresh named Playwright CLI session in Chrome, unlocks the insider preview, signs in, and asks Copilot CLI to inspect only enough game state to perform at most one modest, safe progression action.

## Required repository secrets

- `COSMOZETA_EMAIL`: CosmoZeta account email.
- `COSMOZETA_PASSWORD`: CosmoZeta account password.

The workflow grants `copilot-requests: write` and authenticates Copilot CLI with the built-in Actions `GITHUB_TOKEN`, so no Copilot PAT or additional authentication secret is required. The owning organization must allow Copilot CLI usage billed to the organization.

CosmoZeta credentials are provided only to the login step and are not written to scripts, logs, caches, artifacts, or agent state. The generated login script is created with restrictive permissions, its output is suppressed, and it is deleted immediately after use.

## Behavior and safety

The agent first reads `.cosmozeta-state/state.md`. It checks whether a previously recorded queue is still active, prioritizes collecting or completing that progression chain when appropriate, and otherwise makes at most one modest resource, building, research, ship-progression, or scanning action. It exits without acting whenever the page state, cost, target, or safety is uncertain.

The prompt explicitly prohibits attacks, player messaging, alliance changes, marketplace trades, premium-currency spending, account or settings changes, destructive actions, cancellations, and secret exposure. Built-in MCPs and repository custom instructions are disabled. Noninteractive permissions approve Playwright CLI commands and updates to the single state file only.

## Persistence and cost controls

Only non-secret progress state is restored and saved with `actions/cache`. Each run saves an immutable, unique cache key and restores the newest key sharing a stable prefix. Browser authentication, cookies, browser profiles, Copilot home data, passwords, and tokens are never cached. The state file records a UTC timestamp, observation, action, active queue/end time, and suggested next action. State and usage JSON are also retained as a diagnostic artifact for three days.

Copilot uses the `auto` model with the `efficiency` tier, default context, low reasoning, one autopilot continuation, and `--max-ai-credits 30`. Thirty is currently the minimum accepted AI-credit limit. It is a soft session credit cap, not a strict token cap, so actual billing and token usage should still be monitored in the uploaded usage JSON.

## Schedule and manual testing

Scheduled GitHub Actions runs can start later than the cron time during periods of service load. GitHub only runs a scheduled workflow after the workflow file exists on the repository's default branch.

To test without waiting for the schedule:

1. Confirm the organization allows Copilot CLI usage billed to the organization, then configure both CosmoZeta repository secrets.
2. Open **Actions > CosmoZeta hourly agent**.
3. Select **Run workflow** on the default branch.
4. Review the run summary and the short-retention `cosmozeta-run-*` artifact.

Manual dispatch performs a real login and can make one permitted game action. Review the workflow and safety prompt before testing; local YAML or shell validation should not execute the workflow, log in, or invoke Copilot.
