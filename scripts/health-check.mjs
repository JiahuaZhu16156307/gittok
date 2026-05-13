import fs from "node:fs";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const baseUrl = (process.env.TEST_BASE_URL || process.argv[2] || DEFAULT_BASE_URL).replace(/\/$/, "");
const failures = [];
const warnings = [];

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return {};
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return env;
}

const fileEnv = {
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.local"),
  ...process.env,
};

function record(ok, label, detail = "") {
  const line = `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`;
  console.log(line);
  if (!ok) failures.push(line);
}

function warn(label, detail = "") {
  const line = `WARN ${label}${detail ? ` - ${detail}` : ""}`;
  console.log(line);
  warnings.push(line);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return { res, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

console.log(`Health check target: ${baseUrl}`);

const nextAuthUrl = fileEnv.NEXTAUTH_URL;
if (nextAuthUrl) {
  record(
    sameOrigin(baseUrl, nextAuthUrl),
    "NEXTAUTH_URL matches tested browser origin",
    `NEXTAUTH_URL=${nextAuthUrl}, tested=${baseUrl}`
  );
} else {
  warn("NEXTAUTH_URL is not set", "GitHub OAuth callback may fail.");
}

let pageText = "";
try {
  const { res, ms } = await fetchWithTimeout(`${baseUrl}/`, {}, 15000);
  pageText = await res.text();
  record(res.ok && ms < 3000, "home page responds", `${res.status}, ${ms}ms`);
} catch (error) {
  record(false, "home page responds", error.message);
}

const cssHref = pageText.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
if (cssHref) {
  try {
    const cssUrl = new URL(cssHref, baseUrl).toString();
    const { res, ms } = await fetchWithTimeout(cssUrl, {}, 8000);
    const css = await res.text();
    record(res.ok && css.includes("bg-black"), "compiled CSS is available", `${res.status}, ${ms}ms`);
  } catch (error) {
    record(false, "compiled CSS is available", error.message);
  }
} else {
  record(false, "compiled CSS is available", "no stylesheet link found");
}

try {
  const { res: csrfRes } = await fetchWithTimeout(`${baseUrl}/api/auth/csrf`, {}, 3000);
  const csrfCookie = csrfRes.headers.get("set-cookie")?.split(";")[0] ?? "";
  const csrf = await csrfRes.json();
  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken,
    callbackUrl: `${baseUrl}/`,
  });
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/auth/signin/github`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: csrfCookie,
      },
      body,
      redirect: "manual",
    },
    5000
  );
  const location = res.headers.get("location") ?? "";
  const redirectUri = new URL(location).searchParams.get("redirect_uri") ?? "";
  const scope = new URL(location).searchParams.get("scope") ?? "";
  record(
    res.status === 302 &&
      location.startsWith("https://github.com/login/oauth/authorize") &&
      sameOrigin(redirectUri, baseUrl) &&
      redirectUri.endsWith("/api/auth/callback/github") &&
      scope.includes("public_repo") &&
      scope.includes("user:follow"),
    "GitHub OAuth signin redirects to the tested origin",
    `${res.status}, ${ms}ms, redirect_uri=${redirectUri}`
  );
} catch (error) {
  record(false, "GitHub OAuth signin redirects to the tested origin", error.message);
}

try {
  const callbackUrl = `${baseUrl}/?repo=vercel%2Fnext.js`;
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/login?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    {},
    5000
  );
  const html = await res.text();
  record(
    res.ok && html.includes("GitTok") && html.includes("GitHub"),
    "login page accepts a callback URL",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "login page accepts a callback URL", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(`${baseUrl}/api/feed?limit=10&page=1`, {}, 8000);
  const data = await res.json();
  record(
    res.ok && Array.isArray(data.cards) && data.cards.length > 0 && ms < 2000,
    "feed API returns cards quickly",
    `${res.status}, ${ms}ms, cards=${data.cards?.length ?? 0}`
  );
} catch (error) {
  record(false, "feed API returns cards quickly", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/feed?limit=100&page=1&seed=health-large-batch`,
    {},
    8000
  );
  const data = await res.json();
  record(
    res.ok && Array.isArray(data.cards) && data.cards.length === 100 && data.hasMore === true,
    "feed API supports 100-card recommendation batches",
    `${res.status}, ${ms}ms, cards=${data.cards?.length ?? 0}`
  );
} catch (error) {
  record(false, "feed API supports 100-card recommendation batches", error.message);
}

try {
  const [first, second] = await Promise.all([
    fetchWithTimeout(`${baseUrl}/api/feed?limit=8&page=1&seed=health-a`, {}, 8000),
    fetchWithTimeout(`${baseUrl}/api/feed?limit=8&page=1&seed=health-b`, {}, 8000),
  ]);
  const firstData = await first.res.json();
  const secondData = await second.res.json();
  const firstOrder = Array.isArray(firstData.cards)
    ? firstData.cards.map((card) => card.fullName).join("|")
    : "";
  const secondOrder = Array.isArray(secondData.cards)
    ? secondData.cards.map((card) => card.fullName).join("|")
    : "";
  record(
    first.res.ok &&
      second.res.ok &&
      firstData.cards?.length > 0 &&
      secondData.cards?.length > 0 &&
      firstOrder !== secondOrder,
    "feed refresh seed changes the recommendation order",
    `${first.res.status}/${second.res.status}, first=${firstData.cards?.[0]?.fullName ?? "none"}, second=${secondData.cards?.[0]?.fullName ?? "none"}`
  );
} catch (error) {
  record(false, "feed refresh seed changes the recommendation order", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/feed?limit=10&page=8&seed=health-infinite`,
    {},
    8000
  );
  const data = await res.json();
  record(
    res.ok &&
      Array.isArray(data.cards) &&
      data.cards.length === 10 &&
      data.hasMore === true &&
      new Set(data.cards.map((card) => card.id)).size === data.cards.length,
    "recommendation feed keeps producing cards after deep paging",
    `${res.status}, ${ms}ms, cards=${data.cards?.length ?? 0}, hasMore=${data.hasMore}`
  );
} catch (error) {
  record(false, "recommendation feed keeps producing cards after deep paging", error.message);
}

try {
  const feedContainerSource = fs.readFileSync("src/components/feed/FeedContainer.tsx", "utf8");
  record(
    !feedContainerSource.includes("没有更多了") &&
      !feedContainerSource.includes("已经看到底啦"),
    "recommendation feed does not render a terminal no-more page"
  );
} catch (error) {
  record(false, "recommendation feed does not render a terminal no-more page", error.message);
}

try {
  const feedContainerSource = fs.readFileSync("src/components/feed/FeedContainer.tsx", "utf8");
  const feedStoreSource = fs.readFileSync("src/stores/feed-store.ts", "utf8");
  const feedRouteSource = fs.readFileSync("src/app/api/feed/route.ts", "utf8");
  record(
    feedContainerSource.includes("TAIL_PREFETCH_CARDS") &&
      feedContainerSource.includes("const TAIL_PREFETCH_CARDS = 50") &&
      feedContainerSource.includes("onScroll={handleFeedScroll}") &&
      feedContainerSource.includes("currentIndex >= cards.length - 1") &&
      feedContainerSource.includes("正在加载更多") &&
      feedStoreSource.includes("const BATCH_SIZE = 100") &&
      feedStoreSource.includes("const PREFETCH_THRESHOLD = 50") &&
      feedRouteSource.includes("const MAX_LIMIT = 100"),
    "recommendation feed uses large buffered tail loading"
  );
} catch (error) {
  record(false, "recommendation feed uses large buffered tail loading", error.message);
}

try {
  const repoCardSource = fs.readFileSync("src/components/feed/RepoCard.tsx", "utf8");
  record(
    repoCardSource.includes("buildGeneratedSummary(repo)") &&
      !repoCardSource.includes('isEnrichmentLoading ? "\\u6b63\\u5728\\u751f\\u6210 README \\u6458\\u8981..." : ""'),
    "repo card keeps a non-empty Chinese summary fallback"
  );
} catch (error) {
  record(false, "repo card keeps a non-empty Chinese summary fallback", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/feed/enrich?owner=facebook&repo=react`,
    {},
    9000
  );
  const data = await res.json();
  record(
    res.ok && /[\u4e00-\u9fff]/.test(data.summary || "") && ms < 7000,
    "README enrichment returns Chinese",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "README enrichment returns Chinese", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/feed/enrich?owner=excalidraw&repo=excalidraw`,
    {},
    9000
  );
  const data = await res.json();
  const imageUrl = data.imageUrl;
  const imageLike =
    imageUrl === null ||
    /\.(png|jpe?g|gif|svg|webp|avif)(?:[?#].*)?$/i.test(new URL(imageUrl).pathname) ||
    /(^|\.)githubusercontent\.com$/.test(new URL(imageUrl).hostname) ||
    new URL(imageUrl).hostname === "github.com";
  record(
    res.ok && imageLike && imageUrl !== "https://vercel.com" && ms < 9000,
    "README image extraction skips non-image links",
    `${res.status}, ${ms}ms, image=${imageUrl ?? "none"}`
  );
} catch (error) {
  record(false, "README image extraction skips non-image links", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/github/discussions?owner=denoland&repo=deno`,
    {},
    3000
  );
  const data = await res.json();
  record(
    res.status === 401 &&
      data.needsLogin === true &&
      typeof data.error === "string" &&
      !data.error.includes("GraphQL") &&
      !data.error.includes("401") &&
      ms < 3000,
    "discussion list auth error is user-facing",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "discussion list auth error is user-facing", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/github/discussions/count?owner=vercel&repo=next.js`,
    {},
    3000
  );
  const data = await res.json();
  record(
    res.ok &&
      Object.prototype.hasOwnProperty.call(data, "discussionsTotalCount") &&
      ms < 3000,
    "discussion count API returns a safe count payload",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "discussion count API returns a safe count payload", error.message);
}

try {
  const source = fs.readFileSync("src/hooks/useDiscussionCount.ts", "utf8");
  const interactionBarSource = fs.readFileSync("src/components/feed/InteractionBar.tsx", "utf8");
  record(
    source.includes("/api/gittok/comments") &&
      source.includes("/api/github/discussions/count") &&
      source.includes("siteCount") &&
      source.includes("officialCount") &&
      source.includes("totalCount"),
    "comment button count combines GitTok and official discussions"
  );
} catch (error) {
  record(false, "comment button count combines GitTok and official discussions", error.message);
}

try {
  const interactionBarSource = fs.readFileSync("src/components/feed/InteractionBar.tsx", "utf8");
  const hookSource = fs.readFileSync("src/hooks/useDiscussionCount.ts", "utf8");
  record(
    interactionBarSource.includes("label={formatCount(discussionCount)}") &&
      !interactionBarSource.includes('? "评论"') &&
      hookSource.includes("totalCount: 0") &&
      hookSource.includes("fetchCount("),
    "comment rail always renders a numeric count label"
  );
} catch (error) {
  record(false, "comment rail always renders a numeric count label", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/gittok/comments?repoFullName=health-check%2Fgittok-comments`,
    {},
    5000
  );
  const data = await res.json();
  record(
    res.ok && Array.isArray(data.comments) && typeof data.totalCount === "number" && ms < 5000,
    "GitTok comments API loads independently of GitHub",
    `${res.status}, ${ms}ms, comments=${data.comments?.length ?? 0}`
  );
} catch (error) {
  record(false, "GitTok comments API loads independently of GitHub", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/gittok/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repoFullName: "health-check/gittok-comments",
        body: `health-check ${Date.now()}`,
      }),
    },
    5000
  );
  const data = await res.json();
  record(
    res.ok && data.comment?.body?.startsWith("health-check") && ms < 5000,
    "GitTok comments API can post without GitHub organization permission",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "GitTok comments API can post without GitHub organization permission", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/github/discussions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repositoryId: "health-check",
        categoryId: "health-check",
        title: "health-check",
        body: "health-check",
      }),
    },
    3000
  );
  record(
    (res.status === 401 || res.status === 400 || res.status === 502) && ms < 3000,
    "discussion create API fails fast when unauthenticated/invalid",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "discussion create API fails fast when unauthenticated/invalid", error.message);
}

try {
  const { res, ms } = await fetchWithTimeout(
    `${baseUrl}/api/github/discussions/comment`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        discussionId: "health-check",
        body: "health-check",
      }),
    },
    3000
  );
  const data = await res.json();
  record(
    res.status === 401 &&
      data.needsLogin === true &&
      typeof data.error === "string" &&
      /[\u4e00-\u9fff]/.test(data.error) &&
      ms < 3000,
    "discussion comment API reports login requirement clearly",
    `${res.status}, ${ms}ms`
  );
} catch (error) {
  record(false, "discussion comment API reports login requirement clearly", error.message);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} health check(s) failed.`);
  process.exit(1);
}

console.log(`\nAll health checks passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);
