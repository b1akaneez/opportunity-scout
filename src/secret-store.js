import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { KEYCHAIN_SERVICE, normalizeUsername } from "./config.js";

const execFileAsync = promisify(execFile);

const ACCOUNTS = Object.freeze({
  clientId: "reddit-client-id",
  clientSecret: "reddit-client-secret",
  username: "reddit-username",
  refreshToken: "reddit-refresh-token",
});

const ENV_KEYS = Object.freeze({
  clientId: "REDDIT_CLIENT_ID",
  clientSecret: "REDDIT_CLIENT_SECRET",
  username: "REDDIT_USERNAME",
  refreshToken: "REDDIT_REFRESH_TOKEN",
});

async function keychainGet(account) {
  if (process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/security",
      ["find-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE, "-w"],
      { timeout: 10_000, maxBuffer: 64 * 1024 },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function keychainSet(account, value) {
  if (process.platform !== "darwin") {
    throw new Error(
      "Secure setup storage is implemented with macOS Keychain. Use environment variables on this platform.",
    );
  }
  await execFileAsync(
    "/usr/bin/security",
    [
      "add-generic-password",
      "-U",
      "-a",
      account,
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
      value,
    ],
    { timeout: 10_000, maxBuffer: 64 * 1024 },
  );
}

async function keychainDelete(account) {
  if (process.platform !== "darwin") return;
  try {
    await execFileAsync(
      "/usr/bin/security",
      ["delete-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE],
      { timeout: 10_000, maxBuffer: 64 * 1024 },
    );
  } catch {
    // Deleting an absent item is already the desired state.
  }
}

async function getValue(name) {
  const environmentValue = process.env[ENV_KEYS[name]]?.trim();
  return environmentValue || keychainGet(ACCOUNTS[name]);
}

export async function getCredentials() {
  const [clientId, clientSecret, username, refreshToken] = await Promise.all([
    getValue("clientId"),
    getValue("clientSecret"),
    getValue("username"),
    getValue("refreshToken"),
  ]);
  return {
    clientId,
    clientSecret,
    username: normalizeUsername(username),
    refreshToken,
  };
}

export async function saveSetup({ clientId, clientSecret, username }) {
  if (!clientId?.trim() || !clientSecret?.trim() || !username?.trim()) {
    throw new Error("Client ID, client secret, and Reddit username are required.");
  }
  await Promise.all([
    keychainSet(ACCOUNTS.clientId, clientId.trim()),
    keychainSet(ACCOUNTS.clientSecret, clientSecret.trim()),
    keychainSet(ACCOUNTS.username, normalizeUsername(username)),
  ]);
}

export async function saveRefreshToken(refreshToken) {
  if (!refreshToken?.trim()) {
    throw new Error("Reddit did not return a refresh token. Reauthorize with permanent duration.");
  }
  await keychainSet(ACCOUNTS.refreshToken, refreshToken.trim());
}

export async function deleteRefreshToken() {
  await keychainDelete(ACCOUNTS.refreshToken);
}

export async function configurationStatus() {
  const credentials = await getCredentials();
  return {
    configured: Boolean(
      credentials.clientId && credentials.clientSecret && credentials.username,
    ),
    connected: Boolean(credentials.refreshToken),
    username: credentials.username || null,
  };
}
