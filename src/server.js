import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROPOSED_INITIAL_SUBREDDITS,
  APP_NAME,
  HOST,
  OAUTH_SCOPES,
  PORT,
  REDIRECT_URI,
  SCAN_LIMITS,
  validateRedditName,
} from "./config.js";
import {
  buildAuthorizationUrl,
  createOAuthState,
  disconnectReddit,
  exchangeAuthorizationCode,
  verifyOAuthState,
} from "./oauth.js";
import { getIdentity, submitComment, submitPost } from "./reddit.js";
import { runOpportunityScan } from "./scan.js";
import {
  configurationStatus,
  saveSetup,
} from "./secret-store.js";
import { executePreparedWrite, prepareWrite } from "./write-safety.js";

const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const csrfToken = randomUUID();
const oauthStates = new Map();

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
});

function commonHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://www.reddit.com",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    ...extra,
  };
}

function sendJson(response, status, payload) {
  response.writeHead(
    status,
    commonHeaders({ "Content-Type": "application/json; charset=utf-8" }),
  );
  response.end(JSON.stringify(payload));
}

function sendHtml(response, status, html) {
  response.writeHead(
    status,
    commonHeaders({ "Content-Type": "text/html; charset=utf-8" }),
  );
  response.end(html);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function assertLocalMutation(request) {
  if (request.headers["x-opportunity-scout-csrf"] !== csrfToken) {
    throw new Error("Local request verification failed. Refresh the page.");
  }
  const origin = request.headers.origin;
  if (
    origin &&
    origin !== `http://localhost:${PORT}` &&
    origin !== `http://${HOST}:${PORT}`
  ) {
    throw new Error("Cross-origin requests are blocked.");
  }
}

async function bootstrap() {
  return {
    appName: APP_NAME,
    ...(await configurationStatus()),
    csrfToken,
    redirectUri: REDIRECT_URI,
    scopes: OAUTH_SCOPES,
    scanLimits: SCAN_LIMITS,
    proposedInitialSubreddits: PROPOSED_INITIAL_SUBREDDITS,
    writesRequireFreshTypedConfirmation: true,
    policyNotice:
      "API calls remain disabled until Reddit approves this non-commercial personal use case and the owner has valid OAuth credentials for the approved app.",
  };
}

function pruneOAuthStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, createdAt] of oauthStates) {
    if (createdAt < cutoff) oauthStates.delete(state);
  }
}

async function serveStatic(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  try {
    const data = await readFile(filePath);
    response.writeHead(
      200,
      commonHeaders({
        "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      }),
    );
    response.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || HOST}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      return sendJson(response, 200, await bootstrap());
    }

    if (request.method === "POST" && url.pathname === "/api/setup") {
      assertLocalMutation(request);
      const body = await readJson(request);
      validateRedditName(body.username, "Reddit username");
      await saveSetup(body);
      return sendJson(response, 200, await bootstrap());
    }

    if (request.method === "GET" && url.pathname === "/auth/reddit") {
      pruneOAuthStates();
      const status = await configurationStatus();
      if (!status.configured) throw new Error("Finish secure setup first.");
      const state = createOAuthState();
      oauthStates.set(state, Date.now());
      response.writeHead(302, { Location: await buildAuthorizationUrl(state) });
      return response.end();
    }

    if (request.method === "GET" && url.pathname === "/oauth/callback") {
      const error = url.searchParams.get("error");
      if (error) throw new Error(`Reddit authorization was not granted: ${error}`);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const expectedState = [...oauthStates.keys()].find((candidate) =>
        verifyOAuthState(candidate, state),
      );
      if (!expectedState) {
        throw new Error("OAuth state verification failed.");
      }
      oauthStates.delete(expectedState);
      if (!code) throw new Error("Reddit did not return an authorization code.");
      await exchangeAuthorizationCode(code);
      return sendHtml(
        response,
        200,
        "<!doctype html><meta charset='utf-8'><title>Connected</title><p>Reddit is connected. You may close this tab and return to Opportunity Scout.</p>",
      );
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      return sendJson(response, 200, await getIdentity());
    }

    if (request.method === "POST" && url.pathname === "/api/scan") {
      assertLocalMutation(request);
      return sendJson(response, 200, await runOpportunityScan(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/writes/prepare") {
      assertLocalMutation(request);
      return sendJson(response, 200, prepareWrite(await readJson(request)));
    }

    if (request.method === "POST" && url.pathname === "/api/writes/execute") {
      assertLocalMutation(request);
      const result = await executePreparedWrite(await readJson(request), {
        submitPost,
        submitComment,
      });
      return sendJson(response, 200, { ok: true, result });
    }

    if (request.method === "POST" && url.pathname === "/api/disconnect") {
      assertLocalMutation(request);
      await disconnectReddit();
      return sendJson(response, 200, await bootstrap());
    }

    if (request.method === "GET" && (await serveStatic(url.pathname, response))) {
      return;
    }

    return sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 422;
    return sendJson(response, status, { error: error.message || "Request failed." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`${APP_NAME} is running at http://localhost:${PORT}`);
  console.log("Reddit API calls require explicit Reddit approval and OAuth credentials.");
});
