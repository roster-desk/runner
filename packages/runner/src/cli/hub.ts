export const RUNNER_VERSION = "0.2.0";
export const DEFAULT_HUB = "wss://roster-desk-hub.fly.dev/runner";

export function resolveHubUrl(override?: string, env: NodeJS.ProcessEnv = process.env) {
  return override?.trim() || env.HUB_WS_URL?.trim() || env.HUB_WS?.trim() || DEFAULT_HUB;
}

export function healthUrl(wsUrl: string) {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function isOlder(current: string, minimum: string) {
  const left = current.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const have = left[index] ?? 0;
    const need = right[index] ?? 0;
    if (Number.isNaN(have) || Number.isNaN(need)) return false;
    if (have < need) return true;
    if (have > need) return false;
  }
  return false;
}

export async function updateNotice(wsUrl: string, version: string, fetchImpl: typeof fetch = fetch) {
  const minimum = await readMinimum(wsUrl, fetchImpl);
  if (!minimum || !isOlder(version, minimum)) return "";
  return "업데이트가 필요해요. npx @rosterdesk/runner@latest start";
}

async function readMinimum(wsUrl: string, fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl(healthUrl(wsUrl), { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return "";
    const body = (await response.json()) as { minRunnerVersion?: unknown };
    return typeof body.minRunnerVersion === "string" ? body.minRunnerVersion : "";
  } catch {
    return "";
  }
}
