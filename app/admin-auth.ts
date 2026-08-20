export type AdminRuntimeEnv = {
  BASE_MAP_OWNER_EMAIL?: string;
  SHARED_ADMIN_PASSWORD?: string;
  SHARED_ADMIN_SESSION_TOKEN?: string;
};

export type AdminAccess = {
  allowed: boolean;
  actor: string | null;
  method: "owner" | "shared" | null;
};

const ADMIN_COOKIE = "jfac_map_admin";
const PUBLIC_VIEW_COOKIE = "jfac_map_public_view";
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

function fixedTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

export function adminAccess(request: Request, runtime: AdminRuntimeEnv): AdminAccess {
  if (cookieValue(request, PUBLIC_VIEW_COOKIE) === "1") {
    return { allowed: false, actor: null, method: null };
  }

  const ownerEmail = runtime.BASE_MAP_OWNER_EMAIL?.trim().toLowerCase() ?? "";
  const currentEmail = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase() ?? "";
  if (ownerEmail && currentEmail && fixedTimeEqual(currentEmail, ownerEmail)) {
    return { allowed: true, actor: currentEmail, method: "owner" };
  }

  const expectedToken = runtime.SHARED_ADMIN_SESSION_TOKEN?.trim() ?? "";
  const presentedToken = cookieValue(request, ADMIN_COOKIE);
  if (expectedToken.length >= 32 && presentedToken && fixedTimeEqual(presentedToken, expectedToken)) {
    return { allowed: true, actor: "shared-admin", method: "shared" };
  }

  return { allowed: false, actor: null, method: null };
}

export function sharedPasswordMatches(password: string, runtime: AdminRuntimeEnv) {
  const expectedPassword = runtime.SHARED_ADMIN_PASSWORD ?? "";
  return expectedPassword.length >= 10 && fixedTimeEqual(password, expectedPassword);
}

export function sharedAdminSessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearSharedAdminSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}
