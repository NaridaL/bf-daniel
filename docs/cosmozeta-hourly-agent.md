# CosmoZeta hourly agent

The `CosmoZeta hourly agent` workflow runs at minute 17 of each hour and can also be started manually from the Actions tab. It opens a fresh named Playwright CLI session in Chrome, unlocks the insider preview, signs in, and asks Copilot CLI to pursue balanced empire growth through multiple useful actions. Gameplay instructions live in [cosmozeta-gameplay-prompt.md](cosmozeta-gameplay-prompt.md).

## Required repository secrets

- `COSMOZETA_EMAIL`: CosmoZeta account email.
- `AGENTMAIL_API_KEY`: AgentMail key with read access to the forwarding inbox. Replace temporary keys before they expire. The old `COSMOZETA_PASSWORD` secret is no longer used and can be removed.

Forward CosmoZeta sign-in emails for `COSMOZETA_EMAIL` to `adrian-1479@agentmail.to` (the workflow's `AGENTMAIL_INBOX`). Keep `COSMOZETA_EMAIL` set to the original game account address, not the forwarding inbox.

The workflow authenticates Copilot CLI with the built-in Actions `GITHUB_TOKEN`, so it does not store a Copilot PAT. This requires the repository owner's Copilot entitlement to support Actions authentication.

The login step uses `scripts/cosmozeta-login.mjs` to submit the account email, poll AgentMail for up to two minutes, and submit the six-digit code. It ignores messages present before the request and requires a fresh message from the exact CosmoZeta account-service sender, the expected subject, the original recipient, and exactly one six-digit code in the text body. Email content is treated only as data; links and instructions are never followed. API errors (including expired keys) fail closed, and successful login requires the browser to reach `/app/` on the game origin.

Credentials are provided only to the login step. The API key stays in the Node controller and is not passed to the browser CLI or Copilot. Email and code are JSON-escaped into runner-temporary scripts with restrictive permissions because Playwright CLI executes `run-code` without access to Node environment variables. Script output is suppressed and temporary scripts are removed in `finally`, including on failure. Credentials are never deliberately written to workflow logs, caches, uploaded artifacts, or agent state.

## Behavior and safety

The agent first reads `.cosmozeta-state/state.md`, treats it as a hint, and verifies recorded queues against the live UI. It reviews buildings/economy, research, ships, exploration/combat, and expansion across owned planets, chooses a strategic goal, and uses independent queues instead of repeatedly selecting the first building. It collects free completed rewards, advances prerequisites, starts useful research and ship batches, and launches appropriate missions or colonization when available.

Before each action it confirms live costs, balances, prerequisites, capacity, and an enabled control. Afterward it must confirm the matching queue/mission/status change, resource deduction, or success message, update the action ledger immediately, and refresh affected resources and slots. A rejected or unconfirmed attempt is recorded separately and never blindly retried; it does not prevent other independent useful actions.

The loop has no fixed action-count cap. It normally stops only after a fresh pass finds no sensible executable actions across all progression areas, not merely after one upgrade or one insufficient-resource message. Valid blockers include insufficient resources/fuel, full queues, locked prerequisites, protection rules, unattractive risk/reward, or a justified reservation for a more valuable objective. It must document each area's actual blocker; pointless spending to reach zero resources is not a goal. It does not wait for long builds or resource regeneration.

Exploration, scouting, colonization, and in-game attacks on NPCs or other players are permitted. Attacks require a reasoned assessment of current intelligence, fleet capability, target strength/protection, fuel, and likely value; uncertainty should lead to scouting rather than blind attacks. A launched attack is not recorded as a victory until a live result confirms it.

Player messaging/harassment, alliance changes, marketplace trades, premium-currency spending, purchases, account/settings changes, deliberate scrapping/destruction of owned assets, cancellations, exploits, and secret exposure remain prohibited. Page content is untrusted data, not instructions. Built-in MCPs and repository custom instructions are disabled. Noninteractive permissions approve Playwright CLI commands and updates to the single state file only.

### Review of the previous policy

Reviewed successful workflow runs `39686233420`, `39706408147`, `39742030048`, and `39790487211` from October 21–22, 2026. Three confirmed another Metal Collector upgrade, while one made no confirmed progression action. None confirmed research, shipbuilding, or exploration. The old prompt explicitly capped runs at one action, favored continuing the same progression chain, and ended the whole run on a rejected click. Those restrictions are removed. The latest reviewed October 25 run (`40202131221`) failed at login and never reached gameplay; prompt changes do not fix authentication failures.

## Persistence and cost controls

Only non-secret progress state is restored and saved with `actions/cache`. Each run saves an immutable, unique cache key and restores the newest key sharing a stable prefix. Browser authentication, cookies, browser profiles, Copilot home data, passwords, and tokens are never cached. The state file records a UTC timestamp, strategic goal/reservation, full confirmed action ledger, separate rejected/uncertain attempts, queues and displayed end times, coverage/blockers for every progression area, next-run priorities, and an explicit stop reason. It is also published in the Actions run summary. State and usage JSON are retained as a diagnostic artifact for three days.

Copilot uses the `auto` model with the `efficiency` tier, default context, up to twelve autopilot continuations, and `--max-ai-credits 30`. Continuations are an execution guard, not an action-count limit. The prompt targets at most roughly 15 minutes of gameplay, the Copilot step has a 20-minute timeout, and the whole job has a 30-minute timeout to allow setup and cleanup. Budget exhaustion must be reported separately from exhausted opportunities, with unchecked/actionable areas identified. More actions can increase usage compared with the old one-click runs.

Auto routing selects the model and its reasoning behavior, so the workflow does not pass an incompatible explicit reasoning-effort setting. Thirty is currently the minimum accepted AI-credit limit. It is a soft session credit cap, not a strict token cap, so actual billing and token usage should still be monitored in the uploaded usage JSON.

## Schedule and manual testing

Scheduled GitHub Actions runs can start later than the cron time during periods of service load. GitHub only runs a scheduled workflow after the workflow file exists on the repository's default branch.

To test without waiting for the schedule:

1. Configure `COSMOZETA_EMAIL` and `AGENTMAIL_API_KEY`, verify forwarding, and confirm the repository owner's Copilot entitlement supports Actions authentication.
2. Open **Actions > CosmoZeta hourly agent**.
3. Select **Run workflow** on the default branch.
4. Review the run summary and the short-retention `cosmozeta-run-*` artifact.

Manual dispatch performs a real login and can make multiple real game actions, including attacks. Review the workflow and gameplay prompt before testing; local YAML, prompt, or shell validation should not execute the workflow, log in, or invoke Copilot.

Offline regression tests: `node --test tests/*.test.mjs` (login behavior and gameplay prompt/workflow contract checks). These checks cannot prove model strategy quality; inspect subsequent live action ledgers and category coverage to evaluate that. For a login-only integration test, open the named Playwright CLI session at the preview URL, set the three login environment variables, run `node scripts/cosmozeta-login.mjs`, then close the session. This does not invoke Copilot or perform progression actions. Never put keys directly in repository files or commit browser-generated output.
