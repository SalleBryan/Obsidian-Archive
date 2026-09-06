import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { resendSignUpCode } from "aws-amplify/auth";
import { useAuth } from "../context/AuthContext";

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18" style={{ flexShrink: 0 }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
  </svg>
);

const Divider = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
    <span style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>OR</span>
    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
  </div>
);

function PasswordInput({ value, onChange, placeholder, id }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        placeholder={placeholder || "••••••••"}
        value={value}
        onChange={onChange}
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", color: "#71717a", padding: 0,
          display: "flex", alignItems: "center"
        }}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function AuthModal() {
  const {
    authModalOpen, authMode, authLoading, authError,
    setAuthMode, setAuthError, closeAuth,
    handleSignIn, handleSignUp, handleConfirmSignUp,
    handleGoogleSSO, handleForgotPassword, handleConfirmReset,
  } = useAuth();

  const [form, setForm] = useState({ email: "", password: "", name: "", code: "", newPassword: "" });
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);

  const getFocusable = () => {
    const node = modalRef.current;
    if (!node) return [];
    return Array.from(
      node.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    );
  };

  useEffect(() => {
    if (!authModalOpen) return;
    previousFocusRef.current = document.activeElement;
    const focusable = getFocusable();
    if (focusable.length) focusable[0].focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        closeAuth();
        return;
      }
      if (e.key === "Tab") {
        const items = getFocusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocusRef.current && previousFocusRef.current.focus) {
        previousFocusRef.current.focus();
      }
    };
  }, [authModalOpen, closeAuth]);

  const pass = form.password || "";
  const policyChecks = {
    length: pass.length >= 8,
    upper: /[A-Z]/.test(pass),
    lower: /[a-z]/.test(pass),
    digit: /[0-9]/.test(pass),
  };

  const f = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const onSubmitSignIn = async (e) => {
    e.preventDefault();
    const res = await handleSignIn(form.email, form.password);
    if (res.success) setForm({ email: "", password: "", name: "", code: "", newPassword: "" });
  };

  const onSubmitSignUp = async (e) => {
    e.preventDefault();
    await handleSignUp(form.name, form.email, form.password);
  };

  const onSubmitConfirm = async (e) => {
    e.preventDefault();
    const res = await handleConfirmSignUp(form.email, form.password, form.code);
    if (res.success) setForm({ email: "", password: "", name: "", code: "", newPassword: "" });
  };

  const onSubmitForgot = async (e) => {
    e.preventDefault();
    await handleForgotPassword(form.email);
  };

  const onSubmitReset = async (e) => {
    e.preventDefault();
    const res = await handleConfirmReset(form.email, form.code, form.newPassword);
    if (res.success) setForm({ email: "", password: "", name: "", code: "", newPassword: "" });
  };

  const title = {
    signin: "Welcome Back",
    signup: "Create Account",
    confirm: "Verify Account",
    forgot: "Forgot Password",
    resetPassword: "Reset Password",
  }[authMode] || "Welcome";

  return (
    <AnimatePresence>
      {authModalOpen && (
        <div className="modal-overlay" onClick={closeAuth}>
          <motion.div
            className="modal-box"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            ref={modalRef}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 id="auth-modal-title" style={{ fontSize: 22, fontWeight: 800, color: "#ffcd5b" }}>{title}</h2>
              <button className="icon-btn" onClick={closeAuth} aria-label="Close dialog"><X size={20} /></button>
            </div>

            {authError && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 13, marginBottom: 16, border: "1px solid rgba(248,113,113,0.3)" }}>
                {authError}
              </div>
            )}

            {authMode === "signin" && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "100%", justifyContent: "center", gap: 10 }}
                  onClick={handleGoogleSSO}
                  disabled={authLoading}
                >
                  <GoogleIcon /> Continue with Google
                </button>
                <Divider />
                <form onSubmit={onSubmitSignIn}>
                  <div className="field">
                    <label htmlFor="signin-email">Email Address</label>
                    <input id="signin-email" type="email" required placeholder="name@example.com" value={form.email} onChange={f("email")} />
                  </div>
                  <div className="field">
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <label htmlFor="signin-password">Password</label>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: 12, color: "#ffcd5b", cursor: "pointer", fontWeight: 600 }}
                        onClick={() => { setAuthMode("forgot"); setAuthError(""); }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <PasswordInput id="signin-password" value={form.password} onChange={f("password")} />
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Sign In"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#a1a1aa", marginTop: 16 }}>
                    Don't have an account?{" "}
                    <button type="button" style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: "inherit", color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Sign Up</button>
                  </p>
                </form>
              </>
            )}

            {authMode === "signup" && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: "100%", justifyContent: "center", gap: 10 }}
                  onClick={handleGoogleSSO}
                  disabled={authLoading}
                >
                  <GoogleIcon /> Sign up with Google
                </button>
                <Divider />
                <form onSubmit={onSubmitSignUp}>
                  <div className="field">
                    <label htmlFor="signup-name">Your Name</label>
                    <input id="signup-name" type="text" required placeholder="Bryan Salle" value={form.name} onChange={f("name")} />
                  </div>
                  <div className="field">
                    <label htmlFor="signup-email">Email Address</label>
                    <input id="signup-email" type="email" required placeholder="name@example.com" value={form.email} onChange={f("email")} />
                  </div>
                  <div className="field">
                    <label htmlFor="signup-password">Password</label>
                    <PasswordInput id="signup-password" value={form.password} onChange={f("password")} placeholder="Create secure password" />
                  </div>
                  <div className="policy-checklist">
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#ffcd5b", textTransform: "uppercase" }}>Password Checklist:</div>
                    {[["length", "8+ characters"], ["upper", "At least 1 uppercase (A-Z)"], ["lower", "At least 1 lowercase (a-z)"], ["digit", "At least 1 number (0-9)"]].map(([k, label]) => (
                      <div key={k} className={`policy-item ${policyChecks[k] ? "valid" : ""}`}>
                        {policyChecks[k] ? <CheckCircle2 size={13} /> : <Circle size={13} />} {label}
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                    disabled={authLoading || !policyChecks.length || !policyChecks.upper || !policyChecks.lower || !policyChecks.digit}
                  >
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Create Account"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#a1a1aa", marginTop: 16 }}>
                    Already have an account?{" "}
                    <button type="button" style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: "inherit", color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signin"); setAuthError(""); }}>Sign In</button>
                  </p>
                </form>
              </>
            )}

            {authMode === "confirm" && (
              <form onSubmit={onSubmitConfirm}>
                <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16, lineHeight: 1.5 }}>
                  Enter the 6-digit confirmation code sent to <strong>{form.email}</strong>.
                </p>
                <div className="field">
                  <label htmlFor="confirm-code">Confirmation Code</label>
                  <input id="confirm-code" type="text" required placeholder="123456" value={form.code} onChange={f("code")} />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                  {authLoading ? <Loader2 size={16} className="spin" /> : "Verify Code & Continue"}
                </button>
                <p style={{ textAlign: "center", fontSize: 12, marginTop: 16 }}>
                  <button type="button" style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: "inherit", color: "#71717a", cursor: "pointer" }} onClick={() => resendSignUpCode({ username: form.email })}>
                    Didn't receive code? Resend
                  </button>
                </p>
              </form>
            )}

            {authMode === "forgot" && (
              <form onSubmit={onSubmitForgot}>
                <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16, lineHeight: 1.5 }}>
                  Enter your email and we'll send a reset code.
                </p>
                <div className="field">
                  <label htmlFor="forgot-email">Email Address</label>
                  <input id="forgot-email" type="email" required placeholder="name@example.com" value={form.email} onChange={f("email")} />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                  {authLoading ? <Loader2 size={16} className="spin" /> : "Send Reset Code"}
                </button>
                <p style={{ textAlign: "center", fontSize: 13, marginTop: 16 }}>
                  <button type="button" style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit", fontSize: "inherit", color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signin"); setAuthError(""); }}>← Back to Sign In</button>
                </p>
              </form>
            )}

            {authMode === "resetPassword" && (
              <form onSubmit={onSubmitReset}>
                <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16, lineHeight: 1.5 }}>
                  Enter the code sent to <strong>{form.email}</strong> and your new password.
                </p>
                <div className="field">
                  <label htmlFor="reset-code">Reset Code</label>
                  <input id="reset-code" type="text" required placeholder="123456" value={form.code} onChange={f("code")} />
                </div>
                <div className="field">
                  <label htmlFor="reset-new-password">New Password</label>
                  <PasswordInput id="reset-new-password" value={form.newPassword} onChange={f("newPassword")} placeholder="New secure password" />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                  {authLoading ? <Loader2 size={16} className="spin" /> : "Reset Password"}
                </button>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
