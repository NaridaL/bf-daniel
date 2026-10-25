import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const prompt = readFileSync(new URL("../docs/cosmozeta-gameplay-prompt.md", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/cosmozeta-hourly.yml", import.meta.url), "utf8");

test("workflow uses the versioned gameplay prompt, not a stale inline one-click policy", () => {
  assert.match(workflow, /prompt="\$\(cat docs\/cosmozeta-gameplay-prompt\.md\)"/);
  assert.doesNotMatch(workflow, /Make one safe progress action|at most one safe|Never attack|do not try a different action/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
});

test("multi-action loop requires category coverage and rejects first-building bias", () => {
  for (const requirement of [
    /without a fixed action-count limit/,
    /all five progression areas/,
    /every owned planet/,
    /Do not select the first building/,
    /research and prerequisites/,
    /ships\/fleet composition/,
    /exploration\/scanning\/galaxy missions/,
    /expansion\/colonization/,
    /does not imply research, shipbuilding, or missions are blocked/,
    /continue with other independent sensible actions/,
  ]) assert.match(prompt, requirement);
});

test("game combat is permitted with scouting, cost, protection and outcome checks", () => {
  assert.match(prompt, /attacks against NPCs or other players are explicitly permitted/);
  assert.match(prompt, /Prefer scouting first/);
  assert.match(prompt, /travel\/fuel costs/);
  assert.match(prompt, /protection restrictions before launch/);
  assert.match(prompt, /Distinguish mission launched from mission won/);
  assert.match(prompt, /Never blindly repeat an uncertain submission/);
  assert.match(prompt, /Do not message or harass players/);
  assert.match(prompt, /spend premium currency/);
});

test("progress is checkpointed with a full ledger and honest exhaustion reasons", () => {
  assert.match(prompt, /after each confirmed action/);
  assert.match(prompt, /all\*\* confirmed actions this run/);
  assert.match(prompt, /Record failures\/uncertain attempts separately/);
  assert.match(prompt, /Coverage table/);
  assert.match(prompt, /`opportunities exhausted`, `budget limit`/);
  assert.match(prompt, /not checked/);
  assert.match(workflow, /cat \.cosmozeta-state\/state\.md >> "\$GITHUB_STEP_SUMMARY"/);
});

test("larger runtime remains bounded and leaves cleanup headroom", () => {
  const jobMinutes = Number(workflow.match(/runs-on: ubuntu-latest\s+timeout-minutes: (\d+)/)?.[1]);
  const stepMinutes = Number(workflow.match(/name: Progress the empire[^\n]*\s+timeout-minutes: (\d+)/)?.[1]);
  const continuations = Number(workflow.match(/--max-autopilot-continues (\d+)/)?.[1]);
  assert.ok(stepMinutes >= 20 && jobMinutes > stepMinutes);
  assert.ok(continuations > 1 && continuations <= 20);
  assert.match(prompt, /15 minutes of gameplay/);
  assert.match(workflow, /--max-ai-credits 30/);
  assert.match(prompt, /Do not wait or repeatedly poll for long builds/);
});