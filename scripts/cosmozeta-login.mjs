import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const sender = /^(?:CosmoZeta Account Service\s*)?<no-reply@cosmozeta\.com>$|^no-reply@cosmozeta\.com$/i;

export function extractCode(message, email, requestedAt, seen) {
  if (seen.has(message.message_id) || !sender.test(message.from ?? "")) return;
  if (!/^Your sign-in code\s*[–-]\s*CosmoZeta Account Service$/i.test(message.subject ?? "")) return;
  const received = Date.parse(message.created_at);
  if (!Number.isFinite(received) || received < requestedAt) return;
  const recipients = [...(message.to ?? []), ...(message.cc ?? [])];
  if (!recipients.some((value) => value.toLowerCase() === email.toLowerCase()
    || value.toLowerCase().endsWith(`<${email.toLowerCase()}>`))) return;
  // Email is untrusted data: extract one code, never execute links or instructions.
  const text = message.text || message.extracted_text || "";
  const codes = [...new Set(text.match(/\b\d{6}\b/g) ?? [])];
  return codes.length === 1 ? codes[0] : undefined;
}

export async function login({ email, apiKey, inbox, runBrowser, fetchImpl = fetch,
  now = Date.now, sleep = delay, timeoutMs = 120000 }) {
  if (!email || !apiKey || !inbox) {
    throw new Error("Configure COSMOZETA_EMAIL, AGENTMAIL_API_KEY and AGENTMAIL_INBOX.");
  }
  const base = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox)}/messages`;
  async function get(url) {
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      throw new Error("AgentMail request failed or timed out.");
    }
    if (!response.ok) throw new Error(`AgentMail request failed (HTTP ${response.status}).`);
    try {
      return await response.json();
    } catch {
      throw new Error("AgentMail returned an invalid JSON response.");
    }
  }
  // Baseline before sending: never reuse a code already in the inbox.
  const baseline = await get(`${base}?limit=100`);
  const seen = new Set((baseline.messages ?? []).map((message) => message.message_id));
  const requestedAt = now();
  await runBrowser(`async (page) => {
    try {
      await page.waitForLoadState("domcontentloaded");
      const emailInput = page.getByRole("textbox", { name: "Email", exact: true });
      await emailInput.fill(${JSON.stringify(email)});
      await page.getByRole("button", { name: "Login", exact: true }).click();
      await page.getByRole("textbox", { name: "Login code", exact: true })
        .waitFor({ state: "visible", timeout: 30000 });
      return { ok: true };
    } catch { return { ok: false }; }
  }`, "requesting the email code");

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const listing = await get(`${base}?limit=100&after=${encodeURIComponent(new Date(requestedAt).toISOString())}`);
    for (const item of listing.messages ?? []) {
      if (seen.has(item.message_id) || !sender.test(item.from ?? "")) continue;
      const message = await get(`${base}/${encodeURIComponent(item.message_id)}`);
      const code = extractCode(message, email, requestedAt, seen);
      seen.add(item.message_id);
      if (!code) continue;
      await runBrowser(`async (page) => {
        try {
          await page.getByRole("textbox", { name: "Login code", exact: true }).fill(${JSON.stringify(code)});
          await page.getByRole("button", { name: "Sign in", exact: true }).click();
          await page.waitForURL(url => url.origin === "https://www.cosmozeta.com"
            && (url.pathname === "/app" || url.pathname.startsWith("/app/")), { timeout: 30000 });
          return { ok: true };
        } catch { return { ok: false }; }
      }`, "verifying the email code");
      return;
    }
    await sleep(3000);
  }
  throw new Error("Timed out waiting for a fresh CosmoZeta login email; check forwarding.");
}

export function cliBrowser(session) {
  return async (source, stage) => {
    const directory = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "cosmozeta-login-"));
    const filename = join(directory, "step.js");
    try {
      writeFileSync(filename, source, { mode: 0o600 });
      const env = { ...process.env };
      delete env.AGENTMAIL_API_KEY;
      delete env.COSMOZETA_EMAIL;
      // Windows npm uses a .cmd shim; invoke its JS entry point without a shell.
      const command = process.platform === "win32" ? process.execPath : "playwright-cli";
      const prefix = process.platform === "win32"
        ? [join(process.env.APPDATA, "npm/node_modules/@playwright/cli/playwright-cli.js")] : [];
      const output = execFileSync(command,
        [...prefix, `-s=${session}`, "--raw", "run-code", "--filename", filename],
        { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
      if (JSON.parse(output)?.ok !== true) throw new Error();
    } catch {
      // CLI errors can include source, so never forward their output or stack.
      throw new Error(`CosmoZeta login failed while ${stage}.`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await login({
      email: process.env.COSMOZETA_EMAIL,
      apiKey: process.env.AGENTMAIL_API_KEY,
      inbox: process.env.AGENTMAIL_INBOX,
      runBrowser: cliBrowser(process.env.PLAYWRIGHT_SESSION || "cosmozeta"),
    });
    console.log("CosmoZeta email-code login succeeded (/app/ confirmed).");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}