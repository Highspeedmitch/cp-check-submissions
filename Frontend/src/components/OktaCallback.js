import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeOktaLogin } from "../services/okta";

export default function OktaCallback({ setUser }) {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    completeOktaLogin()
      .then(({ data, returnTo }) => {
        setUser(true);
        if (data.platformRole === "platform_admin") {
          navigate(returnTo.startsWith("/platform") ? returnTo : "/platform", { replace: true });
        }
        else if (data.role === "client") navigate("/client/dashboard", { replace: true });
        else navigate(returnTo || "/dashboard", { replace: true });
      })
      .catch((callbackError) => setError(callbackError.message));
  }, [navigate, setUser]);

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>Secure sign-in</h2>
        {error ? <p className="error" role="alert">{error}</p> : <p>Verifying your identity…</p>}
      </div>
    </div>
  );
}
