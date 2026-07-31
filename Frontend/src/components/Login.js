import React, { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { storeAuthentication } from "../services/session";
import { apiUrl } from "../services/api";
import { beginOktaLogin, oktaLoginEnabled } from "../services/okta";

function Login({ setUser }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
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
        setError(data.message || "Unable to sign in.");
      }
    } catch (loginError) {
      setError(loginError.message || "Server error. Please try again.");
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
        <>
          <h2>Save your recovery codes</h2>
          <p>These are the only way to sign in if you lose access to your authenticator. Each code works once.</p>
          <div className="beta-dialog-note" style={{ textAlign: "left" }}>
            {recoveryCodes.map((code) => <div key={code}><code>{code}</code></div>)}
          </div>
          <button type="button" onClick={downloadRecoveryCodes}>Download codes</button>
          <button type="button" className="register-btn" onClick={() => completeAuthentication(pendingAuthentication)}>
            I have saved my codes
          </button>
        </>
      );
    }

    if (mfa) {
      return (
        <>
          <h2>{mfa.mode === "enrollment" ? "Set up multi-factor authentication" : "Verify your sign-in"}</h2>
          {mfa.mode === "enrollment" && (
            <>
              <p>Scan this QR code with any authenticator app, then enter the six-digit code.</p>
              <img src={mfa.qrCodeDataUrl} alt="Authenticator setup QR code" style={{ width: 220, maxWidth: "100%" }} />
              <p>Manual setup key:</p>
              <code style={{ wordBreak: "break-all" }}>{mfa.manualKey}</code>
            </>
          )}
          {mfa.mode === "verification" && (
            <p>Enter the six-digit code from your authenticator app, or one of your recovery codes.</p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <form onSubmit={verifyMfa}>
            <input
              type="text"
              inputMode={mfa.mode === "enrollment" ? "numeric" : "text"}
              autoComplete="one-time-code"
              placeholder="Authentication code"
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              required
              autoFocus
            />
            <button type="submit" disabled={working}>{working ? "Verifying..." : "Verify"}</button>
          </form>
          <button type="button" className="register-btn" onClick={restartLogin}>Back to login</button>
        </>
      );
    }

    return (
      <>
        <h2>Login</h2>
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={handleLogin}>
          <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button type="submit" disabled={working}>{working ? "Signing in..." : "Login"}</button>
        </form>
        {oktaLoginEnabled && (
          <button type="button" className="register-btn" onClick={() => beginOktaLogin({ loginHint: email.toLowerCase(), returnTo }).catch((loginError) => setError(loginError.message))}>
            Sign in with Okta
          </button>
        )}
        <div className="link-container"><Link to="/forgot-password" className="link">Forgot Password?</Link></div>
        <div className="register-container">
          <span>Don't have an account?</span>
          <Link to="/register"><button type="button" className="register-btn">Register</button></Link>
          <div className="link-container"><Link to="/client-registration" className="link">Property Owner?</Link></div>
        </div>
      </>
    );
  };

  return (
    <div className="login-container">
      <div className="login-banner">
        <img src="/apple-touch-icon.png" alt="Afterlight logo" className="login-logo" />
        <h1 className="brand-title">Afterlight</h1>
      </div>
      <div className="login-box">{loginContent()}</div>
    </div>
  );
}

export default Login;
