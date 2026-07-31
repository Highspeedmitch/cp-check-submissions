import React, { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { storeAuthentication } from "../services/session";
import { apiUrl } from "../services/api";
import { beginOktaLogin, oktaLoginEnabled } from "../services/okta";
import { LOGIN_UNAVAILABLE_MESSAGE, loginFailureMessage } from "../services/authMessages";
import ThemeToggle from "./ui/ThemeToggle";

function Login({ setUser }) {
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfa, setMfa] = useState(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [pendingAuthentication, setPendingAuthentication] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturnTo = new URLSearchParams(location.search).get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
    ? requestedReturnTo
    : "";

  const completeAuthentication = (data) => {
    storeAuthentication(data);
    localStorage.setItem("loginTime", new Date().toISOString());
    if (setUser) setUser(true);
    if (data.platformRole === "platform_admin") navigate("/platform");
    else if (data.role === "client") navigate("/client/dashboard");
    else navigate(returnTo || "/dashboard");
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const decoded = JSON.parse(atob(token.split(".")[1]));
      if (decoded.exp && decoded.exp > Date.now() / 1000) {
        navigate(
          decoded.platformRole === "platform_admin"
            ? "/platform"
            : decoded.role === "client"
              ? "/client/dashboard"
              : returnTo || "/dashboard"
        );
      }
    } catch (decodeError) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
    }
  }, [navigate, returnTo]);

  const startEnrollment = async (challengeToken) => {
    const response = await fetch(apiUrl("/api/auth/mfa/enrollment/start"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeToken }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Unable to start MFA enrollment.");
    setMfa({ mode: "enrollment", challengeToken, ...data });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      const response = await fetch(apiUrl("/api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
        credentials: "include",
      });
      const data = await response.json();
      if (response.ok && response.status !== 202) {
        completeAuthentication(data);
      } else if (data.code === "MFA_ENROLLMENT_REQUIRED") {
        await startEnrollment(data.challengeToken);
        setPassword("");
      } else if (data.code === "MFA_REQUIRED") {
        setMfa({ mode: "verification", challengeToken: data.challengeToken });
        setPassword("");
      } else if (data.code === "OKTA_REQUIRED") {
        await beginOktaLogin({ loginHint: email.toLowerCase(), returnTo });
      } else {
        setError(loginFailureMessage(response.status));
      }
    } catch (_loginError) {
      setError(LOGIN_UNAVAILABLE_MESSAGE);
    } finally {
      setWorking(false);
    }
  };

  const verifyMfa = async (event) => {
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      const endpoint = mfa.mode === "enrollment"
        ? "/api/auth/mfa/enrollment/confirm"
        : "/api/auth/mfa/verify";
      const response = await fetch(apiUrl(endpoint), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: mfa.challengeToken, code: mfaCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "MFA verification failed.");
      if (data.recoveryCodes?.length) {
        setPendingAuthentication(data);
        setRecoveryCodes(data.recoveryCodes);
      } else {
        completeAuthentication(data);
      }
    } catch (verificationError) {
      setError(verificationError.message);
    } finally {
      setWorking(false);
    }
  };

  const downloadRecoveryCodes = () => {
    const blob = new Blob([
      `Afterlight recovery codes for ${email}\n\n${recoveryCodes.join("\n")}\n\nEach code can be used once. Store these somewhere safe.\n`,
    ], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "afterlight-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const restartLogin = () => {
    setMfa(null);
    setMfaCode("");
    setRecoveryCodes([]);
    setPendingAuthentication(null);
    setError("");
  };

  const loginContent = () => {
    if (recoveryCodes.length) {
      return (
        <div className="afterlight-auth-content afterlight-auth-content-wide">
          <p className="afterlight-auth-eyebrow">Account recovery</p>
          <h2>Save your recovery codes</h2>
          <p className="afterlight-auth-intro">
            These are the only way to sign in if you lose access to your authenticator.
            Each code can be used once.
          </p>
          <div className="afterlight-recovery-codes" aria-label="Recovery codes">
            {recoveryCodes.map((code) => <code key={code}>{code}</code>)}
          </div>
          <div className="afterlight-auth-actions">
            <button type="button" className="afterlight-button afterlight-button-secondary" onClick={downloadRecoveryCodes}>
              Download codes
            </button>
            <button type="button" className="afterlight-button" onClick={() => completeAuthentication(pendingAuthentication)}>
              I have saved my codes
            </button>
          </div>
        </div>
      );
    }

    if (mfa) {
      const enrollment = mfa.mode === "enrollment";
      return (
        <div className={`afterlight-auth-content ${enrollment ? "afterlight-auth-content-wide" : ""}`}>
          <p className="afterlight-auth-eyebrow">Secure sign-in</p>
          <h2>{enrollment ? "Set up your authenticator" : "Verify your sign-in"}</h2>
          <p className="afterlight-auth-intro">
            {enrollment
              ? "Scan the QR code with any authenticator app, then enter the six-digit code it provides."
              : "Enter the six-digit code from your authenticator app, or use one of your recovery codes."}
          </p>
          {enrollment && (
            <>
              <div className="afterlight-enrollment-setup">
                <div className="afterlight-qr-frame">
                  <img src={mfa.qrCodeDataUrl} alt="Authenticator setup QR code" />
                </div>
                <div className="afterlight-manual-key">
                  <span>Cannot scan the code?</span>
                  <strong>Enter this setup key manually:</strong>
                  <code>{mfa.manualKey}</code>
                </div>
              </div>
            </>
          )}
          {error && <p className="afterlight-auth-alert" role="alert">{error}</p>}
          <form className="afterlight-auth-form" onSubmit={verifyMfa}>
            <label className="afterlight-auth-field">
              <span>Authentication code</span>
              <input
                type="text"
                inputMode={enrollment ? "numeric" : "text"}
                autoComplete="one-time-code"
                placeholder={enrollment ? "000000" : "Six-digit or recovery code"}
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                required
                autoFocus
              />
            </label>
            <button className="afterlight-button" type="submit" disabled={working}>
              {working ? "Verifying..." : "Verify and continue"}
            </button>
          </form>
          <button type="button" className="afterlight-text-button" onClick={restartLogin}>
            Back to sign in
          </button>
        </div>
      );
    }

    return (
      <div className="afterlight-auth-content">
        <p className="afterlight-auth-eyebrow">Secure workspace</p>
        <h2>Welcome back</h2>
        <p className="afterlight-auth-intro">Sign in to continue to Afterlight.</p>
        {error && <p className="afterlight-auth-alert" role="alert">{error}</p>}
        <form className="afterlight-auth-form" onSubmit={handleLogin}>
          <label className="afterlight-auth-field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="afterlight-auth-field">
            <span className="afterlight-password-label">
              <span>Password</span>
              <Link to="/forgot-password">Forgot password?</Link>
            </span>
            <span className="afterlight-password-input">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="afterlight-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>
          <button className="afterlight-button" type="submit" disabled={working}>
            {working ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {oktaLoginEnabled && (
          <button type="button" className="afterlight-button afterlight-button-secondary" onClick={() => beginOktaLogin({ loginHint: email.toLowerCase(), returnTo }).catch(() => setError("Secure sign-in could not be started. Please try again."))}>
            Sign in with Okta
          </button>
        )}
        <div className="afterlight-auth-footer">
          <p>Have an invitation? <Link to="/join">Create your account</Link></p>
          <Link className="afterlight-owner-link" to="/join">Property owner invitation <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    );
  };

  return (
    <div className="afterlight-login-page">
      <main className="afterlight-login-shell">
        <aside className="afterlight-login-brand">
          <div>
            <div className="afterlight-login-wordmark">
              <img src="/apple-touch-icon.png" alt="" />
              <span>Afterlight</span>
            </div>
            <p className="afterlight-login-brand-eyebrow">Property intelligence after hours</p>
            <h1>See what happens after the workday ends.</h1>
            <p className="afterlight-login-brand-copy">
              Keep inspections, reporting, and property follow-through connected in one workspace.
            </p>
          </div>
          <ul className="afterlight-login-capabilities" aria-label="Afterlight capabilities">
            <li><span aria-hidden="true">✓</span> Documented property observations</li>
            <li><span aria-hidden="true">✓</span> Assignment and invoice visibility</li>
            <li><span aria-hidden="true">✓</span> Secure, role-based access</li>
          </ul>
        </aside>
        <section className="afterlight-login-card">
          {loginContent()}
          <p className="afterlight-security-note">
            <span aria-hidden="true">MFA</span> Secure sign-in protected by multi-factor authentication
          </p>
          <ThemeToggle className="afterlight-theme-toggle" />
        </section>
      </main>
    </div>
  );
}

export default Login;
