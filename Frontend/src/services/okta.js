import { OktaAuth } from "@okta/okta-auth-js";
import { apiUrl } from "./api";
import { storeAuthentication } from "./session";

const issuer = process.env.REACT_APP_OKTA_ISSUER;
const clientId = process.env.REACT_APP_OKTA_CLIENT_ID;

export const oktaConfigured = Boolean(issuer && clientId);

function client() {
  if (!oktaConfigured) throw new Error("Okta sign-in is not configured.");
  return new OktaAuth({
    issuer,
    clientId,
    redirectUri: `${window.location.origin}/login/callback`,
    scopes: ["openid", "profile", "email"],
    pkce: true,
    tokenManager: { storage: "sessionStorage" },
  });
}

export async function beginOktaLogin({ loginHint = "", returnTo = "" } = {}) {
  const challengeResponse = await fetch(apiUrl("/api/auth/okta/challenge"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  const challenge = await challengeResponse.json();
  if (!challengeResponse.ok || !challenge.nonce) {
    throw new Error(challenge.message || "Unable to start secure sign-in.");
  }
  sessionStorage.setItem("afterlightOktaReturnTo", returnTo || "");
  await client().signInWithRedirect({ loginHint, nonce: challenge.nonce });
}

export async function completeOktaLogin() {
  const okta = client();
  const tokens = await okta.token.parseFromUrl();
  const idToken = tokens.tokens.idToken?.idToken;
  if (!idToken) throw new Error("Okta did not return an identity token.");
  const response = await fetch(apiUrl("/api/auth/okta"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Secure sign-in failed.");
  storeAuthentication(data);
  const returnTo = sessionStorage.getItem("afterlightOktaReturnTo") || "";
  sessionStorage.removeItem("afterlightOktaReturnTo");
  return { data, returnTo };
}
