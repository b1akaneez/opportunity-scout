let bootstrapState;
let pendingWrite;

const statusNode = document.querySelector("#status");
const setupForm = document.querySelector("#setup-form");
const scanForm = document.querySelector("#scan-form");
const scanOutput = document.querySelector("#scan-output");
const writeForm = document.querySelector("#write-form");
const writeReview = document.querySelector("#write-review");
const connectLink = document.querySelector("#connect-link");
const disconnectButton = document.querySelector("#disconnect-button");
const oauthDetails = document.querySelector("#oauth-details");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(bootstrapState?.csrfToken
        ? { "X-Opportunity-Scout-CSRF": bootstrapState.csrfToken }
        : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

function showError(node, error) {
  node.innerHTML = `<div class="notice error">${escapeHtml(error.message || error)}</div>`;
}

function updateStatus(state) {
  bootstrapState = state;
  const label = state.connected
    ? `Connected as u/${state.username}`
    : state.configured
      ? "OAuth client saved — Reddit authorization pending"
      : "Waiting for Reddit approval and OAuth credentials";
  statusNode.textContent = label;
  statusNode.classList.toggle("ready", state.connected);
  connectLink.classList.toggle("disabled", !state.configured);
  disconnectButton.disabled = !state.connected;
  oauthDetails.textContent = `Redirect URI: ${state.redirectUri} · Scopes: ${state.scopes.join(
    ", ",
  )} · ${state.policyNotice}`;
  if (state.username) setupForm.elements.username.value = state.username;
  if (!scanForm.elements.subreddits.value) {
    scanForm.elements.subreddits.value = state.proposedInitialSubreddits.join(", ");
  }
}

async function refreshBootstrap() {
  updateStatus(await api("/api/bootstrap"));
}

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(setupForm));
    updateStatus(
      await api("/api/setup", { method: "POST", body: JSON.stringify(data) }),
    );
    setupForm.elements.clientSecret.value = "";
  } catch (error) {
    showError(oauthDetails, error);
  }
});

disconnectButton.addEventListener("click", async () => {
  if (!window.confirm("Revoke the refresh token and disconnect Reddit?")) return;
  try {
    updateStatus(await api("/api/disconnect", { method: "POST", body: "{}" }));
  } catch (error) {
    showError(oauthDetails, error);
  }
});

scanForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  scanOutput.innerHTML = '<div class="notice">Scanning within the configured limits…</div>';
  const form = new FormData(scanForm);
  const body = {
    queries: String(form.get("queries"))
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
    subreddits: String(form.get("subreddits"))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    time: form.get("time"),
    maxPosts: Number(form.get("maxPosts")),
  };
  try {
    const result = await api("/api/scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const items = result.evidence
      .map(
        (item) => `
          <article class="evidence">
            <h3>${escapeHtml(item.title)}</h3>
            <div class="metrics">
              <span>r/${escapeHtml(item.subreddit)}</span>
              <span>friction ${item.complaintScore}</span>
              <span>${item.upvotes} votes</span>
              <span>${item.commentsCount} comments</span>
            </div>
            <p>${escapeHtml(item.postExcerpt || "No post body.")}</p>
            <p>Signals: ${escapeHtml(item.signals.join(", ") || "engagement only")}</p>
            <a href="${escapeHtml(item.permalink)}" target="_blank" rel="noreferrer">Verify source thread</a>
          </article>`,
      )
      .join("");
    const warnings = result.warnings
      .map((warning) => `<div class="notice error">${escapeHtml(warning)}</div>`)
      .join("");
    scanOutput.innerHTML = `
      <div class="notice">${result.uniquePostsFound} unique posts found in ${result.durationSeconds}s. No API response or usernames were stored on disk.</div>
      ${warnings}
      ${items || '<div class="notice">No qualifying evidence found.</div>'}
    `;
  } catch (error) {
    showError(scanOutput, error);
  }
});

document.querySelector("#write-kind").addEventListener("change", (event) => {
  const isComment = event.target.value === "comment";
  document.querySelector("#subreddit-field").classList.toggle("hidden", isComment);
  document.querySelector("#title-field").classList.toggle("hidden", isComment);
  document.querySelector("#url-field").classList.toggle("hidden", isComment);
  document.querySelector("#parent-field").classList.toggle("hidden", !isComment);
});

writeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const body = Object.fromEntries(new FormData(writeForm));
    pendingWrite = await api("/api/writes/prepare", {
      method: "POST",
      body: JSON.stringify(body),
    });
    writeReview.innerHTML = `
      <div class="review">
        <p><strong>Nothing has been published.</strong> Review the exact draft above and the destination's rules.</p>
        <p>To publish this one action, type <code>${escapeHtml(pendingWrite.confirmationPhrase)}</code>.</p>
        <form id="execute-write-form">
          <label>Confirmation phrase<input name="confirmationPhrase" autocomplete="off" required /></label>
          <div class="actions"><button class="danger" type="submit">Publish this exact draft</button></div>
        </form>
      </div>`;
    document
      .querySelector("#execute-write-form")
      .addEventListener("submit", executeWrite);
  } catch (error) {
    showError(writeReview, error);
  }
});

async function executeWrite(event) {
  event.preventDefault();
  const confirmationPhrase = new FormData(event.target).get("confirmationPhrase");
  if (!window.confirm("Publish this exact content to Reddit now?")) return;
  try {
    await api("/api/writes/execute", {
      method: "POST",
      body: JSON.stringify({ id: pendingWrite.id, confirmationPhrase }),
    });
    pendingWrite = null;
    writeReview.innerHTML = '<div class="notice">Published successfully.</div>';
    writeForm.reset();
  } catch (error) {
    showError(writeReview, error);
  }
}

refreshBootstrap().catch((error) => showError(statusNode, error));
