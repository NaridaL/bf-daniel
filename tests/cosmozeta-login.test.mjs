import test from "node:test";
import assert from "node:assert/strict";
import { extractCode, login } from "../scripts/cosmozeta-login.mjs";

const email = "commander@example.com";
const requestedAt = Date.parse("2026-10-25T18:00:00Z");
const message = {
  message_id: "fresh", from: "CosmoZeta Account Service <no-reply@cosmozeta.com>",
  subject: "Your sign-in code – CosmoZeta Account Service", to: [email],
  created_at: new Date(requestedAt + 1000).toISOString(),
  text: "Your sign-in verification code is:\n012345\nThis code is valid for 10 minutes.",
};

test("extracts a six-digit code including leading zero", () => {
  assert.equal(extractCode(message, email, requestedAt, new Set()), "012345");
});

for (const [name, change] of [
  ["wrong sender", { from: "attacker@other.example" }],
  ["spoofed sender suffix", { from: "CosmoZeta <no-reply@cosmozeta.com.evil>" }],
  ["wrong subject", { subject: "Forwarding confirmation" }],
  ["wrong recipient", { to: ["other@example.com"] }],
  ["old message", { created_at: new Date(requestedAt - 1).toISOString() }],
  ["invalid timestamp", { created_at: "unknown" }],
  ["ambiguous codes", { text: "012345 or 654321" }],
  ["no code", { text: "Follow this link instead" }],
]) {
  test(`rejects ${name}`, () => {
    assert.equal(extractCode({ ...message, ...change }, email, requestedAt, new Set()), undefined);
  });
}

test("rejects baseline message IDs even with fresh timestamps", () => {
  assert.equal(extractCode(message, email, requestedAt, new Set([message.message_id])), undefined);
});

function harness({ responses, status = 200, browserFailure = false } = {}) {
  const requests = [];
  const calls = [];
  let clock = requestedAt;
  return {
    requests, calls,
    options: {
      email, apiKey: "test-key-not-a-secret", inbox: "forward@example.com",
      now: () => clock, sleep: async (ms) => { clock += ms; }, timeoutMs: 6000,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: status === 200, status, json: async () => responses?.shift() ?? { messages: [] } };
      },
      runBrowser: async (source, stage) => {
        calls.push(stage);
        if (browserFailure) throw new Error("Browser failed");
        // Execute the generated callback against a minimal Playwright-shaped page.
        const callback = (0, eval)(`(${source})`);
        const page = {
          waitForLoadState: async () => {},
          getByRole: (role, { name }) => ({
            fill: async (value) => assert.equal(value, name === "Email" ? email : "012345"),
            click: async () => {}, waitFor: async () => {},
          }),
          waitForURL: async (predicate) => {
            assert.equal(predicate(new URL("https://www.cosmozeta.com/app/overview")), true);
            assert.equal(predicate(new URL("https://attacker.example/app/overview")), false);
            assert.equal(predicate(new URL("https://www.cosmozeta.com/")), false);
          },
        };
        assert.deepEqual(await callback(page), { ok: true });
      },
    },
  };
}

test("baseline, poll and verify use the same controller as the workflow", async () => {
  const h = harness({ responses: [
    { messages: [{ ...message, message_id: "old" }] },
    { messages: [] },
    { messages: [message] }, message,
  ] });
  await login(h.options);
  assert.deepEqual(h.calls, ["requesting the email code", "verifying the email code"]);
  assert.equal(h.requests.length, 4);
  assert.match(h.requests[2].url, /after=/);
  assert.equal(h.requests[0].options.headers.Authorization, "Bearer test-key-not-a-secret");
  assert.equal(h.requests[0].options.redirect, "error");
});

test("missing configuration fails before sending a code", async () => {
  const h = harness();
  await assert.rejects(login({ ...h.options, apiKey: "" }), /Configure/);
  assert.equal(h.requests.length, 0);
  assert.equal(h.calls.length, 0);
});

test("expired API key fails before sending a code without leaking response content", async () => {
  const h = harness({ status: 401 });
  await assert.rejects(login(h.options), /^Error: AgentMail request failed \(HTTP 401\)\.$/);
  assert.equal(h.calls.length, 0);
});

test("network failures are sanitized", async () => {
  const h = harness();
  await assert.rejects(login({ ...h.options, fetchImpl: async () => {
    throw new Error("sensitive request details");
  } }), /^Error: AgentMail request failed or timed out\.$/);
});

test("missing forwarded email times out without verifying or resending", async () => {
  const h = harness();
  await assert.rejects(login(h.options), /Timed out waiting/);
  assert.deepEqual(h.calls, ["requesting the email code"]);
});

test("invalid API JSON never leaks response content", async () => {
  const h = harness();
  await assert.rejects(login({ ...h.options, fetchImpl: async () => ({
    ok: true, json: async () => { throw new Error("sensitive response content"); },
  }) }), /^Error: AgentMail returned an invalid JSON response\.$/);
});

test("browser failure stops authentication", async () => {
  const h = harness({ browserFailure: true });
  await assert.rejects(login(h.options), /Browser failed/);
  assert.equal(h.requests.length, 1);
});