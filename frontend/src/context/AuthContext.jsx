import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import {
  signIn,
  signUp,
  confirmSignUp,
  signOut,
  getCurrentUser,
  fetchUserAttributes,
  signInWithRedirect,
  resetPassword,
  confirmResetPassword,
} from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { SUPER_ADMIN_EMAILS, checkIsSuperAdmin } from "../config";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const isSuperAdmin = useMemo(() => checkIsSuperAdmin(currentUser), [currentUser]);

  const checkAuth = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      const email = attrs.email || user.username;
      const isAdmin = SUPER_ADMIN_EMAILS.includes(email.toLowerCase()) || email.toLowerCase().startsWith("bryan");
      setCurrentUser({
        userId: user.userId,
        email,
        name: attrs.name || (email ? email.split("@")[0] : "Reader"),
        isAdmin
      });
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // After a Google SSO redirect, Amplify exchanges the auth code for tokens in
  // the background and fires "signInWithRedirect" (NOT "signedIn" — that event
  // is only for direct signIn() calls). We listen for both so React state
  // updates and the UI reflects the authenticated user. "signInWithRedirect_failure"
  // is also handled so a broken OAuth exchange surfaces an error instead of
  // failing silently.
  useEffect(() => {
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn" || payload.event === "signInWithRedirect") {
        checkAuth();
        setAuthModalOpen(false);
        setAuthError("");
      } else if (payload.event === "signInWithRedirect_failure") {
        setAuthError("Google sign-in failed. Please try again.");
        setAuthLoading(false);
      }
    });
    return unsubscribe;
  }, [checkAuth]);

  const openAuth = useCallback((mode = "signin") => {
    setAuthMode(mode);
    setAuthError("");
    setAuthModalOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthModalOpen(false);
    setAuthError("");
  }, []);

  const handleSignIn = async (email, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await signIn({ username: email.trim(), password });
      await checkAuth();
      setAuthModalOpen(false);
      return { success: true };
    } catch (err) {
      if (err.name === "UserNotConfirmedException") {
        setAuthMode("confirm");
        setAuthError("Account not confirmed. Enter verification code sent to your email.");
        return { needConfirm: true };
      } else {
        const msg = err.message || "Failed to sign in. Verify credentials.";
        setAuthError(msg);
        return { error: msg };
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (name, email, password) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await signUp({
        username: email.trim(),
        password,
        options: {
          userAttributes: {
            email: email.trim(),
            name: name.trim() || email.split("@")[0]
          }
        }
      });
      setAuthMode("confirm");
      setAuthError("");
      return { success: true };
    } catch (err) {
      const msg = err.message || "Failed to create account.";
      setAuthError(msg);
      return { error: msg };
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmSignUp = async (email, password, code) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await confirmSignUp({
        username: email.trim(),
        confirmationCode: code.trim()
      });
      try {
        await signIn({ username: email.trim(), password });
      } catch {}
      await checkAuth();
      setAuthModalOpen(false);
      return { success: true };
    } catch (err) {
      const msg = err.message || "Invalid confirmation code.";
      setAuthError(msg);
      return { error: msg };
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async (email) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await resetPassword({ username: email.trim() });
      setAuthMode("resetPassword");
      return { success: true };
    } catch (err) {
      setAuthError(err.message || "Failed to send reset code.");
      return { error: err.message };
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmReset = async (email, code, newPassword) => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await confirmResetPassword({ username: email.trim(), confirmationCode: code.trim(), newPassword });
      setAuthMode("signin");
      setAuthError("");
      return { success: true };
    } catch (err) {
      setAuthError(err.message || "Failed to reset password.");
      return { error: err.message };
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSSO = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await signInWithRedirect({ provider: "Google" });
    } catch (err) {
      if (err.name === "UserAlreadyAuthenticatedException") {
        // Token is already valid in Amplify's store but React state didn't update
        await checkAuth();
        setAuthModalOpen(false);
      } else {
        setAuthError("Google SSO: " + (err.message || "Configure Google OAuth Client ID in Cognito."));
      }
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    authChecked,
    isSuperAdmin,
    authModalOpen,
    authMode,
    authLoading,
    authError,
    setAuthMode,
    setAuthError,
    openAuth,
    closeAuth,
    checkAuth,
    handleSignIn,
    handleSignUp,
    handleConfirmSignUp,
    handleGoogleSSO,
    handleForgotPassword,
    handleConfirmReset,
    handleSignOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
