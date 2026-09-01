import React from "react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, BookOpen, X, Library, Loader2, Globe, User, LogIn, LogOut, Bell, MessageSquarePlus, Shield, CheckCircle2, Circle, Bookmark, ChevronDown, Home } from "lucide-react";
import { signIn, signUp, confirmSignUp, signOut, getCurrentUser, fetchUserAttributes, resendSignUpCode, signInWithRedirect } from "aws-amplify/auth";
import { api } from "./api";
import { SUPER_ADMIN_EMAILS, checkIsSuperAdmin } from "./config";
import { BookDetailPage } from "./pages/BookDetailPage";
import { EditBookPage } from "./pages/EditBookPage";
import { MyCollectionPage } from "./pages/MyCollectionPage";
import { OnlineReaderPage } from "./pages/OnlineReaderPage";
import { PublicLibraryPage } from "./pages/PublicLibraryPage";
import { RequestsBoardPage } from "./pages/RequestsBoardPage";
import { UploadBookPage } from "./pages/UploadBookPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { STYLES } from "./styles";
import "./amplifyConfig";

// ── ROOT APPLICATION ─────────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();

  // User State
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "", code: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Topbar Dropdowns
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  const isSuperAdmin = useMemo(() => checkIsSuperAdmin(currentUser), [currentUser]);

  // Auth Initialization
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

  const loadNotifications = useCallback(async () => {
    if (!currentUser) return;
    const notifs = await api.getNotifications();
    setNotifications(notifs);
  }, [currentUser]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (currentUser) {
      loadNotifications();
      const timer = setInterval(loadNotifications, 30000); // 30s poll
      return () => clearInterval(timer);
    }
  }, [currentUser, loadNotifications]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  // Auth Handlers
  const handleSignIn = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      await signIn({ username: authForm.email.trim(), password: authForm.password });
      await checkAuth();
      setAuthModalOpen(false);
      setAuthForm({ email: "", password: "", name: "", code: "" });
    } catch (err) {
      if (err.name === "UserNotConfirmedException") {
        setAuthMode("confirm");
        setAuthError("Account not confirmed. Enter verification code sent to your email.");
      } else {
        setAuthError(err.message || "Failed to sign in. Verify credentials.");
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      await signUp({
        username: authForm.email.trim(),
        password: authForm.password,
        options: {
          userAttributes: {
            email: authForm.email.trim(),
            name: authForm.name.trim() || authForm.email.split("@")[0]
          }
        }
      });
      setAuthMode("confirm");
      setAuthError("");
    } catch (err) {
      setAuthError(err.message || "Failed to create account.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConfirmSignUp = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      await confirmSignUp({
        username: authForm.email.trim(),
        confirmationCode: authForm.code.trim()
      });
      try {
        await signIn({ username: authForm.email.trim(), password: authForm.password });
      } catch {}
      await checkAuth();
      setAuthModalOpen(false);
      setAuthForm({ email: "", password: "", name: "", code: "" });
    } catch (err) {
      setAuthError(err.message || "Invalid confirmation code.");
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
      setAuthError("Google SSO: " + (err.message || "Configure Google OAuth Client ID in Cognito."));
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCurrentUser(null);
    setUserMenuOpen(false);
    navigate("/library");
  };

  const openAuth = (mode = "signin") => {
    setAuthMode(mode);
    setAuthError("");
    setAuthModalOpen(true);
  };

  const pass = authForm.password || "";
  const policyChecks = {
    length: pass.length >= 8,
    upper: /[A-Z]/.test(pass),
    lower: /[a-z]/.test(pass),
    digit: /[0-9]/.test(pass),
  };

  // If we are in online reader mode (/read/:bookId), hide normal shell to give maximum reading area
  const isReaderMode = location.pathname.startsWith("/read/");

  if (isReaderMode) {
    return (
      <>
        <style>{STYLES}</style>
        <Routes>
          <Route path="/read/:bookId" element={<OnlineReaderPage currentUser={currentUser} authChecked={authChecked} />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">
        {/* DESKTOP SIDEBAR */}
        <aside className="sidebar">
          <div>
            <div className="sidebar-brand" onClick={() => navigate("/library")}>
              <div className="sidebar-brand-icon"><BookOpen size={24} /></div>
              <div>
                <div className="sidebar-brand-title">Obsidian</div>
                <div className="sidebar-brand-sub">For Book Lovers</div>
              </div>
            </div>

            <nav className="sidebar-nav">
              <Link
                to="/library"
                className={`nav-item ${location.pathname === "/library" || location.pathname === "/" ? "active" : ""}`}
              >
                <Globe size={18} /> Public Library
              </Link>
              <Link
                to="/collection"
                className={`nav-item ${location.pathname === "/collection" ? "active" : ""}`}
                onClick={(e) => { if (!currentUser) { e.preventDefault(); openAuth("signin"); } }}
              >
                <Library size={18} /> My Collection
              </Link>
              <Link
                to="/requests"
                className={`nav-item ${location.pathname === "/requests" ? "active" : ""}`}
              >
                <MessageSquarePlus size={18} /> Book Requests
              </Link>
              {currentUser && (
                <Link
                  to="/profile"
                  className={`nav-item ${location.pathname === "/profile" ? "active" : ""}`}
                >
                  <User size={18} /> My Profile
                </Link>
              )}
            </nav>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
            {currentUser ? (
              <button className="nav-item" onClick={handleSignOut} style={{ color: "#f87171" }}>
                <LogOut size={18} /> Sign Out
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => openAuth("signin")}
              >
                <LogIn size={16} /> Sign In
              </button>
            )}
          </div>
        </aside>

        {/* MAIN AREA */}
        <div className="main-area">
          {/* DESKTOP STICKY TOPBAR */}
          <header className="topbar">
            <div className="topbar-brand" onClick={() => navigate("/library")}>
              <BookOpen size={22} /> Obsidian
            </div>

            <div className="topbar-search">
              <Search className="topbar-search-icon" size={18} />
              <input
                type="text"
                placeholder="Search books by title, author, series…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="topbar-actions">
              {currentUser ? (
                <>
                  {/* NOTIFICATION BELL */}
                  <button
                    className="icon-btn"
                    onClick={() => { setNotifMenuOpen(!notifMenuOpen); setUserMenuOpen(false); }}
                    title="Notifications"
                  >
                    <Bell size={19} />
                    {unreadCount > 0 && <span className="badge-dot" />}
                  </button>

                  {/* UPLOAD BUTTON (Desktop) */}
                  <button
                    className="btn btn-primary topbar-desktop-upload"
                    onClick={() => navigate("/upload")}
                  >
                    <Plus size={16} /> Upload Book
                  </button>

                  {/* USER PILL */}
                  <div
                    className="user-nav-pill"
                    onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifMenuOpen(false); }}
                  >
                    <div className="user-nav-avatar">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-nav-name">{currentUser.name}</div>
                    {isSuperAdmin && <span className="admin-badge">Admin</span>}
                    <ChevronDown size={14} color="#a1a1aa" className="user-nav-chevron" />
                  </div>
                </>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => openAuth("signin")}
                >
                  <LogIn size={16} /> Sign In
                </button>
              )}
            </div>
          </header>

          {/* GOOGLE PLAY BOOKS STYLE MOBILE TOP SEARCH PILL */}
          <div className="mobile-search-pill-container">
            <div className="mobile-search-pill">
              <Search size={18} className="search-pill-icon" />
              <input
                type="text"
                placeholder="Search Obsidian Archive"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {currentUser ? (
                <div
                  className="search-pill-avatar"
                  onClick={() => { setUserMenuOpen(!userMenuOpen); setNotifMenuOpen(false); }}
                  title={currentUser.name}
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
              ) : (
                <button className="search-pill-signin" onClick={() => openAuth("signin")}>
                  <LogIn size={13} /> Sign In
                </button>
              )}
            </div>
          </div>

          {/* NOTIFICATIONS DROPDOWN */}
          <AnimatePresence>
            {notifMenuOpen && (
              <motion.div
                className="notif-dropdown"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#ffcd5b" }}>Notifications</span>
                  <span style={{ fontSize: 11, color: "#a1a1aa" }}>{unreadCount} unread</span>
                </div>
                {notifications.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", padding: "16px 0" }}>
                    No notifications yet.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.notificationId}
                      className={`notif-item ${!n.isRead ? "unread" : ""}`}
                      onClick={() => {
                        api.markNotificationRead(n.notificationId);
                        setNotifMenuOpen(false);
                        if (n.bookId) navigate(`/books/${n.bookId}`);
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7" }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{n.message}</div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* USER MENU DROPDOWN */}
          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                className="user-menu-dropdown"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div style={{ padding: "8px 12px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{currentUser?.name || "Guest"}</div>
                  <div style={{ fontSize: 11, color: "#a1a1aa" }}>{currentUser?.email || ""}</div>
                  {isSuperAdmin && (
                    <div style={{ marginTop: 6 }}>
                      <span className="admin-badge"><Shield size={10} /> Super Admin</span>
                    </div>
                  )}
                </div>
                <button className="menu-item" onClick={() => { setUserMenuOpen(false); navigate("/profile"); }}>
                  <User size={15} /> My Profile
                </button>
                <button className="menu-item" onClick={() => { setUserMenuOpen(false); navigate("/collection"); }}>
                  <Library size={15} /> My Collection
                </button>
                <button className="menu-item" onClick={() => { setUserMenuOpen(false); navigate("/requests"); }}>
                  <MessageSquarePlus size={15} /> Book Requests
                </button>
                <button className="menu-item" onClick={handleSignOut} style={{ color: "#f87171" }}>
                  <LogOut size={15} /> Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ROUTES */}
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route
              path="/library"
              element={<PublicLibraryPage searchQuery={searchQuery} currentUser={currentUser} onOpenAuth={openAuth} isSuperAdmin={isSuperAdmin} />}
            />
            <Route
              path="/collection"
              element={<MyCollectionPage searchQuery={searchQuery} currentUser={currentUser} onOpenAuth={openAuth} isSuperAdmin={isSuperAdmin} />}
            />
            <Route
              path="/requests"
              element={<RequestsBoardPage currentUser={currentUser} onOpenAuth={openAuth} isSuperAdmin={isSuperAdmin} />}
            />
            <Route
              path="/upload"
              element={<UploadBookPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/books/:bookId"
              element={<BookDetailPage currentUser={currentUser} onOpenAuth={openAuth} isSuperAdmin={isSuperAdmin} authChecked={authChecked} />}
            />
            <Route
              path="/books/:bookId/edit"
              element={<EditBookPage currentUser={currentUser} isSuperAdmin={isSuperAdmin} />}
            />
            <Route
              path="/profile"
              element={<UserProfilePage currentUser={currentUser} onOpenAuth={openAuth} isSuperAdmin={isSuperAdmin} />}
            />
          </Routes>
        </div>

        {/* GOOGLE PLAY BOOKS STYLE MOBILE BOTTOM NAVIGATION */}
        <nav className="gplay-bottom-nav">
          <Link to="/library" className={`gplay-nav-item ${location.pathname === "/library" || location.pathname === "/" ? "active" : ""}`}>
            <div className="gplay-nav-icon-wrap"><Home size={19} /></div>
            <span>Home</span>
          </Link>
          <Link
            to="/collection"
            className={`gplay-nav-item ${location.pathname === "/collection" ? "active" : ""}`}
            onClick={(e) => { if (!currentUser) { e.preventDefault(); openAuth("signin"); } }}
          >
            <div className="gplay-nav-icon-wrap"><Library size={19} /></div>
            <span>Library</span>
          </Link>
          <Link
            to="/upload"
            className={`gplay-nav-item ${location.pathname === "/upload" ? "active" : ""}`}
            onClick={(e) => { if (!currentUser) { e.preventDefault(); openAuth("signin"); } }}
          >
            <div className="gplay-nav-icon-wrap"><Plus size={20} /></div>
            <span>Upload</span>
          </Link>
          <Link to="/requests" className={`gplay-nav-item ${location.pathname === "/requests" ? "active" : ""}`}>
            <div className="gplay-nav-icon-wrap"><Bookmark size={19} /></div>
            <span>Wishlist</span>
          </Link>
          {currentUser ? (
            <Link to="/profile" className={`gplay-nav-item ${location.pathname === "/profile" ? "active" : ""}`}>
              <div className="gplay-nav-icon-wrap"><User size={19} /></div>
              <span>Profile</span>
            </Link>
          ) : (
            <button className="gplay-nav-item" onClick={() => openAuth("signin")}>
              <div className="gplay-nav-icon-wrap"><LogIn size={19} /></div>
              <span>Sign In</span>
            </button>
          )}
        </nav>
      </div>

      {/* AUTH MODAL */}
      <AnimatePresence>
        {authModalOpen && (
          <div className="modal-overlay" onClick={() => setAuthModalOpen(false)}>
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
                <button className="icon-btn" onClick={() => setAuthModalOpen(false)}><X size={20} /></button>
              </div>

              {authError && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 13, marginBottom: 16, border: "1px solid rgba(248,113,113,0.3)" }}>
                  {authError}
                </div>
              )}



              {authMode === "signin" && (
                <form onSubmit={handleSignIn}>
                  <div className="field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
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
                <form onSubmit={handleSignUp}>
                  <div className="field">
                    <label>Your Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Bryan Salle"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input
                      type="password"
                      required
                      placeholder="Create secure password"
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
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
                <form onSubmit={handleConfirmSignUp}>
                  <p style={{ fontSize: 14, color: "#a1a1aa", marginBottom: 16, lineHeight: 1.5 }}>
                    Enter the 6-digit confirmation code sent to <strong>{authForm.email}</strong>.
                  </p>
                  <div className="field">
                    <label>Confirmation Code</label>
                    <input
                      type="text"
                      required
                      placeholder="123456"
                      value={authForm.code}
                      onChange={(e) => setAuthForm({ ...authForm, code: e.target.value })}
                    />
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Verify Code & Continue"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 12, color: "#71717a", marginTop: 16, cursor: "pointer" }} onClick={() => resendSignUpCode({ username: authForm.email })}>
                    Didn't receive code? Resend
                  </p>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

