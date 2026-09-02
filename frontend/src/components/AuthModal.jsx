import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle2, Circle } from "lucide-react";
import { resendSignUpCode } from "aws-amplify/auth";
import { useAuth } from "../context/AuthContext";

export function AuthModal() {
  const {
    authModalOpen,
    authMode,
    authLoading,
    authError,
    setAuthMode,
    setAuthError,
    closeAuth,
    handleSignIn,
    handleSignUp,
    handleConfirmSignUp
  } = useAuth();

  const [form, setForm] = useState({ email: "", password: "", name: "", code: "" });

  const pass = form.password || "";
  const policyChecks = {
    length: pass.length >= 8,
    upper: /[A-Z]/.test(pass),
    lower: /[a-z]/.test(pass),
    digit: /[0-9]/.test(pass),
  };

  const onSubmitSignIn = async (e) => {
    e.preventDefault();
    const res = await handleSignIn(form.email, form.password);
    if (res.success) {
      setForm({ email: "", password: "", name: "", code: "" });
    }
  };

  const onSubmitSignUp = async (e) => {
    e.preventDefault();
    await handleSignUp(form.name, form.email, form.password);
  };

  const onSubmitConfirm = async (e) => {
    e.preventDefault();
    const res = await handleConfirmSignUp(form.email, form.password, form.code);
    if (res.success) {
      setForm({ email: "", password: "", name: "", code: "" });
    }
  };

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
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#ffcd5b" }}>
                {authMode === "signin" ? "Welcome Back" : authMode === "signup" ? "Create Account" : "Verify Account"}
              </h2>
              <button className="icon-btn" onClick={closeAuth}><X size={20} /></button>
            </div>

            {authError && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 13, marginBottom: 16, border: "1px solid rgba(248,113,113,0.3)" }}>
                {authError}
              </div>
            )}

            {authMode === "signin" && (
              <form onSubmit={onSubmitSignIn}>
                <div className="field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                  {authLoading ? <Loader2 size={16} className="spin" /> : "Sign In"}
                </button>
                <p style={{ textAlign: "center", fontSize: 13, color: "#a1a1aa", marginTop: 16 }}>
                  Don't have an account?{" "}
                  <span style={{ color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>
                    Sign Up
                  </span>
                </p>
              </form>
            )}

            {authMode === "signup" && (
              <form onSubmit={onSubmitSignUp}>
                <div className="field">
                  <label>Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Bryan Salle"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Create secure password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>

                <div className="policy-checklist">
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#ffcd5b", textTransform: "uppercase" }}>
                    Password Checklist:
                  </div>
                  <div className={`policy-item ${policyChecks.length ? "valid" : ""}`}>
                    {policyChecks.length ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    8+ characters
                  </div>
                  <div className={`policy-item ${policyChecks.upper ? "valid" : ""}`}>
                    {policyChecks.upper ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    At least 1 uppercase letter (A-Z)
                  </div>
                  <div className={`policy-item ${policyChecks.lower ? "valid" : ""}`}>
                    {policyChecks.lower ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    At least 1 lowercase letter (a-z)
                  </div>
                  <div className={`policy-item ${policyChecks.digit ? "valid" : ""}`}>
                    {policyChecks.digit ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                    At least 1 number (0-9)
                  </div>
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
                  <span style={{ color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signin"); setAuthError(""); }}>
                    Sign In
                  </span>
                </p>
              </form>
            )}

            {authMode === "confirm" && (
              <form onSubmit={onSubmitConfirm}>
                <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16, lineHeight: 1.5 }}>
                  Enter the 6-digit confirmation code sent to <strong>{form.email}</strong>.
                </p>
                <div className="field">
                  <label>Confirmation Code</label>
                  <input
                    type="text"
                    required
                    placeholder="123456"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                  {authLoading ? <Loader2 size={16} className="spin" /> : "Verify Code & Continue"}
                </button>
                <p style={{ textAlign: "center", fontSize: 12, color: "#71717a", marginTop: 16, cursor: "pointer" }} onClick={() => resendSignUpCode({ username: form.email })}>
                  Didn't receive code? Resend
                </p>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
