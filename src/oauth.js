import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  OAUTH_SCOPES,
  REDIRECT_URI,
  userAgent,
  validateRedditName,
} from "./config.js";
import {
  deleteRefreshToken,
  getCredentials,
  saveRefreshToken,
} from "./secret-store.js";

const AUTHORIZE_URL = "https://www.reddit.com/api/v1/authorize";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const REVOKE_URL = "https://www.reddit.com/api/v1/revoke_token";

let accessTokenCache = null;

function basicAuthorization(clientId, clientSecret) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function parseTokenResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    const reason = payload.error_description || payload.error || "unknown OAuth error";
    throw new Error(`Reddit OAuth failed (${response.status}): ${reason}`);
  }
  if (!payload.access_token) {
    throw new Error("Reddit OAuth response did not contain an access token.");
  }
  return payload;
}

async function tokenRequest(form) {
  const credentials = await getCredentials();
  if (!credentials.clientId || !credentials.clientSecret || !credentials.username) {
    throw new Error("Finish secure client setup before connecting Reddit.");
  }
  validateRedditName(credentials.username, "Reddit username");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(
        credentials.clientId,
        credentials.clientSecret,
      ),
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent(credentials.username),
    },
    body: new URLSearchParams(form),
  });
  return parseTokenResponse(response);
}

export function createOAuthState() {
  return randomBytes(32).toString("base64url");
}

export function verifyOAuthState(expected, received) {
  return safeEqual(expected, received);
}

export async function buildAuthorizationUrl(state) {
  const { clientId } = await getCredentials();
  if (!clientId) throw new Error("Client ID is not configured.");

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("duration", "permanent");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  return url.toString();
}

export async function exchangeAuthorizationCode(code) {
  const payload = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });
  await saveRefreshToken(payload.refresh_token);
  accessTokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return { scope: payload.scope || OAUTH_SCOPES.join(" ") };
}

export async function getAccessToken({ forceRefresh = false } = {}) {
  if (
    !forceRefresh &&
    accessTokenCache?.value &&
    accessTokenCache.expiresAt - Date.now() > 60_000
  ) {
    return accessTokenCache.value;
  }

  const { refreshToken } = await getCredentials();
  if (!refreshToken) throw new Error("Connect Reddit before making API requests.");

  const payload = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  // Reddit's documented refresh flow normally retains the original token, but
  // safely store a replacement if the service ever rotates it.
  if (payload.refresh_token) await saveRefreshToken(payload.refresh_token);
  accessTokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  };
  return accessTokenCache.value;
}

export async function disconnectReddit() {
  const credentials = await getCredentials();
  accessTokenCache = null;
  if (
    credentials.refreshToken &&
    credentials.clientId &&
    credentials.clientSecret &&
    credentials.username
  ) {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthorization(
          credentials.clientId,
          credentials.clientSecret,
        ),
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent(credentials.username),
      },
      body: new URLSearchParams({
        token: credentials.refreshToken,
        token_type_hint: "refresh_token",
      }),
    }).catch(() => null);
  }
  await deleteRefreshToken();
}
