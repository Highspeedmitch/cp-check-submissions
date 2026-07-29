import {
  tokenNeedsRefresh,
  storeAuthentication,
  clearAuthentication,
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
  });
  expect(localStorage.getItem("userId")).toBe("user-1");
  expect(localStorage.getItem("role")).toBe("property_manager");
  clearAuthentication();
  expect(localStorage.getItem("token")).toBeNull();
  expect(localStorage.getItem("role")).toBeNull();
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
