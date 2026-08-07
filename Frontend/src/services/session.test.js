import {
  tokenNeedsRefresh,
  storeAuthentication,
  clearAuthentication,
  restoreSession,
  refreshAccessToken,
  isExpiredAuthResponse,
} from "./session";

function tokenWithExpiration(exp) {
  const encode = (value) => window.btoa(JSON.stringify(value))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode({ exp, userId: "user-1" })}.signature`;
}

beforeEach(() => localStorage.clear());

test("access tokens are refreshed shortly before expiration", () => {
  const now = Math.floor(Date.now() / 1000);
  expect(tokenNeedsRefresh(tokenWithExpiration(now + 60))).toBe(true);
  expect(tokenNeedsRefresh(tokenWithExpiration(now + 3600))).toBe(false);
});

test("authentication metadata is stored and cleared together", () => {
  const token = tokenWithExpiration(Math.floor(Date.now() / 1000) + 3600);
  storeAuthentication({
    token,
    orgName: "PICOR",
    organizationId: "org-1",
    orgType: "COM",
    role: "property_manager",
    engagementType: "customer_contractor",
    accountScope: "afterlight_resource",
    availableWorkspaces: ["organization", "afterlight_resource"],
  });
  expect(localStorage.getItem("userId")).toBe("user-1");
  expect(localStorage.getItem("role")).toBe("property_manager");
  expect(localStorage.getItem("engagementType")).toBe("customer_contractor");
  expect(localStorage.getItem("accountScope")).toBe("afterlight_resource");
  expect(JSON.parse(localStorage.getItem("availableWorkspaces"))).toEqual([
    "organization",
    "afterlight_resource",
  ]);
  clearAuthentication();
  expect(localStorage.getItem("token")).toBeNull();
  expect(localStorage.getItem("role")).toBeNull();
  expect(localStorage.getItem("engagementType")).toBeNull();
  expect(localStorage.getItem("accountScope")).toBeNull();
  expect(localStorage.getItem("availableWorkspaces")).toBeNull();
});

test("assumed organization metadata is stored and cleared", () => {
  const token = tokenWithExpiration(Math.floor(Date.now() / 1000) + 3600);
  storeAuthentication({
    token,
    orgName: "Tenant",
    organizationId: "org-2",
    orgType: "STR",
    role: "admin",
    platformRole: "platform_admin",
    assumedOrganization: true,
    platformSessionId: "session-1",
  });
  expect(localStorage.getItem("platformRole")).toBe("platform_admin");
  expect(localStorage.getItem("assumedOrganization")).toBe("true");
  expect(localStorage.getItem("platformSessionId")).toBe("session-1");
  clearAuthentication();
  expect(localStorage.getItem("platformRole")).toBeNull();
  expect(localStorage.getItem("platformSessionId")).toBeNull();
});

test("temporary refresh failures preserve an existing signed-in session", async () => {
  const expiredToken = tokenWithExpiration(Math.floor(Date.now() / 1000) - 60);
  storeAuthentication({
    token: expiredToken,
    orgName: "PICOR",
    organizationId: "org-1",
    orgType: "COM",
    role: "user",
  });

  const authenticated = await restoreSession(jest.fn().mockRejectedValue(new TypeError("offline")));

  expect(authenticated).toBe(true);
  expect(localStorage.getItem("token")).toBe(expiredToken);
  expect(localStorage.getItem("role")).toBe("user");
});

test("a confirmed invalid refresh session clears authentication", async () => {
  const expiredToken = tokenWithExpiration(Math.floor(Date.now() / 1000) - 60);
  storeAuthentication({
    token: expiredToken,
    orgName: "PICOR",
    organizationId: "org-1",
    orgType: "COM",
    role: "user",
  });
  const response = new Response(JSON.stringify({ message: "Session expired." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

  const authenticated = await restoreSession(jest.fn().mockResolvedValue(response));

  expect(authenticated).toBe(false);
  expect(localStorage.getItem("token")).toBeNull();
  expect(localStorage.getItem("role")).toBeNull();
});

test("a tab reuses a token refreshed by another tab instead of rotating twice", async () => {
  const staleToken = tokenWithExpiration(Math.floor(Date.now() / 1000) - 60);
  const currentToken = tokenWithExpiration(Math.floor(Date.now() / 1000) + 3600);
  localStorage.setItem("token", currentToken);
  const request = jest.fn((name, callback) => callback());
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });
  const nativeFetch = jest.fn();

  await expect(refreshAccessToken(nativeFetch, {
    force: true,
    staleToken,
  })).resolves.toBe(currentToken);

  expect(request).toHaveBeenCalledWith("afterlight-session-refresh", expect.any(Function));
  expect(nativeFetch).not.toHaveBeenCalled();
  delete navigator.locks;
});

test("a workspace cookie error does not invalidate a still-valid access token", async () => {
  const response = new Response(JSON.stringify({
    code: "SESSION_REFRESH_UNAVAILABLE",
    message: "Your secure session is unavailable on this device.",
  }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

  await expect(isExpiredAuthResponse(response)).resolves.toBe(false);
});

test("an ordinary unauthorized response still triggers session refresh", async () => {
  const response = new Response(JSON.stringify({ message: "Session expired." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });

  await expect(isExpiredAuthResponse(response)).resolves.toBe(true);
});
