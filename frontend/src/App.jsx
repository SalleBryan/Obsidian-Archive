import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Pencil, Trash2, ArrowLeft,
  BookOpen, X, Library, Loader2, Save,
  AlertTriangle, Check, RefreshCw, UploadCloud, Settings,
  Lock, Globe, User, LogIn, LogOut, FileText, Bell, MessageSquarePlus, Share2
} from "lucide-react";
import {
  signIn,
  signUp,
  confirmSignUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  resendSignUpCode
} from "aws-amplify/auth";
import "./amplifyConfig";

// ── API CONFIGURATION ─────────────────────────────────────────────────────────
const API_BASE = "https://drcuyr2lz3.execute-api.us-east-1.amazonaws.com/prod";
const EP = {
  books: `${API_BASE}/books`,
  booksMine: `${API_BASE}/books/mine`,
  uploadCover: `${API_BASE}/upload/cover`,
  uploadBook: `${API_BASE}/upload/book`,
  requests: `${API_BASE}/requests`,
  profile: `${API_BASE}/profile`,
};

// ── THEME CONSTANTS ───────────────────────────────────────────────────────────
const CATEGORIES = ["Fiction", "Sci-Fi", "Fantasy", "Non-Fiction", "Biography", "Education", "Uncategorized"];

const CAT_COLORS = {
  "Fiction":       "#ffcd5b",
  "Sci-Fi":        "#b9c8de",
  "Fantasy":       "#ffc6c1",
  "Non-Fiction":   "#4ADE80",
  "Biography":     "#fb923c",
  "Education":     "#38bdf8",
  "Uncategorized": "#9b8f7b",
};
const getCatColor = (cat) => CAT_COLORS[cat] || "#ffcd5b";

// ── API CLIENT ────────────────────────────────────────────────────────────────
async function getAuthHeader() {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

const api = {
  getPublicBooks: async () => {
    const res = await fetch(`${EP.books}?visibility=public`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.books || [];
  },
  getMyBooks: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.booksMine, { headers });
    if (!res.ok) throw new Error("Failed to load your books");
    const data = await res.json();
    return data.books || [];
  },
  createBook: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.books, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "CREATE_BOOK", payload })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create book");
    }
    return res.json();
  },
  updateBook: async (bookId, payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.books}/${bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "UPDATE_BOOK", payload: { bookId, ...payload } })
    });
    if (!res.ok) throw new Error("Failed to update book");
    return res.json();
  },
  deleteBook: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.books}/${bookId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "DELETE_BOOK", payload: { bookId } })
    });
    if (!res.ok) throw new Error("Failed to delete book");
    return res.json();
  },
  uploadCover: async (file) => {
    const headers = await getAuthHeader();
    const ext = file.name.split(".").pop().toLowerCase();
    const contentType = file.type || `image/${ext}`;
    const res = await fetch(EP.uploadCover, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ extension: ext, contentType })
    });
    if (!res.ok) throw new Error("Failed to get cover upload URL");
    const { uploadUrl, coverKey, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!uploadRes.ok) throw new Error("S3 cover upload failed");
    return { coverKey, publicUrl };
  },
  uploadBookFile: async (file) => {
    const headers = await getAuthHeader();
    const ext = file.name.split(".").pop().toLowerCase();
    const contentType = file.type || "application/octet-stream";
    const res = await fetch(EP.uploadBook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        extension: ext,
        contentType,
        fileSizeBytes: file.size
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to get book file upload URL");
    }
    const { uploadUrl, fileKey } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!uploadRes.ok) throw new Error("S3 book file upload failed");
    return { fileKey, fileType: ext, fileSizeBytes: file.size };
  },
  getRequests: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.requests, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.requests || [];
  },
  createRequest: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.requests, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "CREATE_REQUEST", payload })
    });
    if (!res.ok) throw new Error("Failed to create request");
    return res.json();
  },
  deleteRequest: async (requestId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.requests}/${requestId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "DELETE_REQUEST", payload: { requestId } })
    });
    if (!res.ok) throw new Error("Failed to delete request");
    return res.json();
  },
  fulfillRequest: async (requestId, fulfilledBookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.requests}/${requestId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "FULFILL_REQUEST", payload: { requestId, fulfilledBookId } })
    });
    if (!res.ok) throw new Error("Failed to fulfill request");
    return res.json();
  },
  getProfile: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.profile, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || null;
  },
  updateProfile: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.profile, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to update profile");
    return res.json();
  }
};

// ── GLOBAL STYLES ─────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #111317;
    font-family: 'Plus Jakarta Sans', sans-serif;
    color: #e2e2e6;
    min-height: 100vh;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .shell { display: flex; min-height: 100vh; }
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 280px;
    background: #1e2023; border-right: 1px solid rgba(78,70,53,0.3);
    display: flex; flex-direction: column; padding: 24px 16px; z-index: 40;
  }
  @media(max-width: 768px) { .sidebar { display: none; } }
  .sidebar-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; padding: 0 8px; cursor: pointer; }
  .sidebar-brand-icon {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(255,205,91,0.15); display: flex; align-items: center; justify-content: center; color: #ffcd5b;
  }
  .sidebar-brand-title { font-size: 16px; font-weight: 700; color: #ffcd5b; line-height: 1.2; }
  .sidebar-brand-sub { font-size: 12px; color: #d2c5af; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px;
    font-size: 14px; font-weight: 500; color: #d2c5af; cursor: pointer; transition: all 0.15s;
    border: none; background: transparent; text-decoration: none; width: 100%; font-family: inherit;
  }
  .nav-item:hover { background: #282a2d; color: #e2e2e6; }
  .nav-item.active { background: rgba(255,205,91,0.1); color: #ffcd5b; font-weight: 700; }
  .sidebar-user {
    padding: 12px; background: rgba(255,205,91,0.05); border: 1px solid rgba(255,205,91,0.15);
    border-radius: 10px; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
  }
  .sidebar-user-avatar {
    width: 34px; height: 34px; border-radius: 50%; background: #ffcd5b;
    color: #111317; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 13px;
  }
  .sidebar-user-info { flex: 1; overflow: hidden; }
  .sidebar-user-name { font-size: 13px; font-weight: 600; color: #e2e2e6; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
  .sidebar-user-email { font-size: 11px; color: #9b8f7b; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
  .main-area { flex: 1; margin-left: 280px; display: flex; flex-direction: column; min-height: 100vh; }
  @media(max-width: 768px) { .main-area { margin-left: 0; } }
  .topbar {
    position: sticky; top: 0; z-index: 30; height: 72px;
    background: rgba(17,19,23,0.88); backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(78,70,53,0.2);
    display: flex; align-items: center; justify-content: space-between; padding: 0 48px;
  }
  @media(max-width: 768px) { .topbar { padding: 0 16px; } }
  .topbar-brand { display: none; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; color: #ffcd5b; cursor: pointer; }
  @media(max-width: 768px) { .topbar-brand { display: flex; } }
  .topbar-search { position: relative; flex: 1; max-width: 440px; margin: 0 24px; }
  .topbar-search input {
    width: 100%; height: 42px; padding: 0 16px 0 44px; background: #1e2023;
    border: 1px solid rgba(78,70,53,0.4); border-radius: 999px; color: #e2e2e6;
    font-family: inherit; font-size: 14px; outline: none; transition: all 0.2s;
  }
  .topbar-search input:focus { border-color: #ffcd5b; }
  .topbar-search-icon { position: absolute; left: 14px; top: 12px; color: #d2c5af; }
  .topbar-actions { display: flex; align-items: center; gap: 12px; }
  .icon-btn {
    width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent;
    color: #d2c5af; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { background: #1e2023; color: #ffcd5b; }
  .page { padding: 40px 48px 100px; max-width: 1440px; width: 100%; }
  @media(max-width: 768px) { .page { padding: 24px 16px 100px; } }
  .page-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .eyebrow-line { width: 48px; height: 3px; background: #ffcd5b; border-radius: 999px; }
  .eyebrow-text { font-size: 11px; font-weight: 700; color: #ffcd5b; text-transform: uppercase; letter-spacing: 0.12em; }
  .page-title { font-size: 44px; font-weight: 700; color: #e2e2e6; letter-spacing: -0.02em; line-height: 1.1; }
  .page-sub { font-size: 15px; color: rgba(210,197,175,0.6); margin-top: 6px; }
  .page-header { margin-bottom: 32px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; align-items: center; }
  .cat-chip {
    padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: all 0.15s; border: 1px solid rgba(78,70,53,0.5);
    background: transparent; color: #d2c5af; white-space: nowrap; font-family: inherit;
  }
  .cat-chip:hover { border-color: #ffcd5b; color: #e2e2e6; }
  .cat-chip.active { background: rgba(255,205,91,0.12); border-color: rgba(255,205,91,0.5); color: #ffcd5b; font-weight: 700; }
  .book-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 24px; }
  .book-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 2/3;
    background: #1e2023; border: 1px solid rgba(78,70,53,0.2); box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    transition: transform 0.3s, box-shadow 0.3s;
  }
  .book-card:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 28px 48px rgba(0,0,0,0.7); }
  .book-card-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 10; }
  .book-card-badge {
    position: absolute; top: 10px; right: 10px; z-index: 10; padding: 3px 8px; border-radius: 999px;
    background: rgba(0,0,0,0.75); backdrop-filter: blur(8px); font-size: 10px; font-weight: 600;
    display: flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.1);
  }
  .book-card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; display: block; }
  .book-card:hover .book-card-img { transform: scale(1.06); }
  .book-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 55%, transparent 100%);
    display: flex; flex-direction: column; justify-content: flex-end; padding: 14px;
  }
  .book-title-text { font-size: 15px; font-weight: 600; color: #fff; line-height: 1.25; }
  .book-author-text { font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; }
  .add-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 2/3;
    background: #1e2023; border: 2px dashed rgba(78,70,53,0.5);
    display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s;
  }
  .add-card:hover { border-color: #ffcd5b; background: #282a2d; }
  .add-card-icon {
    width: 56px; height: 56px; border-radius: 50%; background: #333538;
    display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #d2c5af;
  }
  .add-card:hover .add-card-icon { background: rgba(255,205,91,0.15); color: #ffcd5b; }
  .add-card-label { font-size: 14px; font-weight: 500; color: #d2c5af; text-align: center; padding: 0 12px; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 22px;
    border-radius: 999px; font-family: inherit; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; border: none;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #ffcd5b; color: #3f2e00; box-shadow: 0 4px 14px rgba(226,177,60,0.2); }
  .btn-primary:hover:not(:disabled) { background: #f2bf49; }
  .btn-danger { background: transparent; color: #d2c5af; border: 1px solid rgba(78,70,53,0.6); }
  .btn-danger:hover:not(:disabled) { color: #ffb4ab; border-color: rgba(255,180,171,0.4); background: rgba(255,180,171,0.08); }
  .btn-secondary { background: transparent; color: #d2c5af; border: 1px solid rgba(78,70,53,0.6); }
  .btn-secondary:hover:not(:disabled) { background: #282a2d; color: #e2e2e6; }
  .glass-panel {
    background: rgba(22,24,29,0.7); backdrop-filter: blur(12px);
    border: 1px solid rgba(148,163,184,0.08); box-shadow: 0 4px 20px rgba(226,177,60,0.05);
  }
  .detail-grid { display: grid; grid-template-columns: 280px 1fr; gap: 48px; align-items: start; }
  @media(max-width: 768px) { .detail-grid { grid-template-columns: 1fr; gap: 28px; } }
  .cover-wrapper {
    width: 100%; aspect-ratio: 2/3; border-radius: 12px; overflow: hidden;
    background: #1e2023; border: 1px solid rgba(78,70,53,0.3); box-shadow: 0 20px 60px rgba(0,0,0,0.7); position: relative;
  }
  .cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .detail-title { font-size: 40px; font-weight: 700; line-height: 1.15; margin-bottom: 8px; }
  .detail-author { font-size: 17px; color: #d2c5af; margin-bottom: 24px; }
  .detail-description { font-size: 15px; line-height: 1.75; color: rgba(226,226,230,0.8); margin-bottom: 32px; max-width: 650px; }
  .detail-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  @media(max-width: 768px) { .editor-grid { grid-template-columns: 1fr; } }
  .editor-card { border-radius: 12px; padding: 32px; position: relative; }
  .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .field label { font-size: 11px; font-weight: 700; color: #d2c5af; text-transform: uppercase; letter-spacing: 0.1em; }
  .field input, .field select, .field textarea {
    background: #1e2023; border: 1px solid rgba(78,70,53,0.45); padding: 12px 16px; border-radius: 8px;
    color: #e2e2e6; font-family: inherit; font-size: 14px; width: 100%; outline: none; transition: all 0.2s;
  }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: #ffcd5b; }
  .field select option { background: #1e2023; }
  .upload-zone {
    border: 2px dashed rgba(78,70,53,0.5); border-radius: 10px; min-height: 140px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; background: #1e2023; padding: 16px;
  }
  .upload-zone:hover { border-color: #ffcd5b; background: rgba(255,205,91,0.04); }
  .upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
  }
  .modal-box {
    background: #1e2023; border: 1px solid rgba(78,70,53,0.4); border-radius: 16px;
    width: 100%; max-width: 440px; padding: 32px; box-shadow: 0 24px 64px rgba(0,0,0,0.8);
  }
  .req-card {
    background: #1e2023; border: 1px solid rgba(78,70,53,0.3); border-radius: 12px; padding: 20px;
    display: flex; flex-direction: column; gap: 12px; transition: transform 0.2s;
  }
  .req-card:hover { transform: translateY(-4px); border-color: #ffcd5b; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  .loading-center { display: flex; align-items: center; justify-content: center; min-height: 300px; }
  .mobile-nav {
    display: none; position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e2023; border-top: 1px solid rgba(78,70,53,0.3); z-index: 50;
  }
  @media(max-width: 768px) { .mobile-nav { display: flex; justify-content: space-around; height: 64px; align-items: center; } }
  .mobile-nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: #d2c5af; font-size: 10px; font-weight: 500; cursor: pointer; flex: 1;
    padding: 8px 0; border: none; background: transparent; font-family: inherit;
  }
  .mobile-nav-item.active { color: #ffcd5b; }
`;

export default function App() {
  const [view, setView] = useState("explore"); // "explore" | "my-library" | "requests" | "detail" | "add" | "edit" | "settings"
  const [books, setBooks] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [loading, setLoading] = useState(true);

  // Auth State
  const [currentUser, setCurrentUser] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup" | "confirm"
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "", code: "" });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Request Modal
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [reqForm, setReqForm] = useState({ title: "", author: "", description: "" });
  const [reqLoading, setReqLoading] = useState(false);

  // Profile Settings
  const [profile, setProfile] = useState({ displayName: "", requestNotifications: true });

  // ── AUTH INITIALIZATION ──────────────────────────────────────────────────────
  const checkAuth = async () => {
    try {
      const user = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      setCurrentUser({
        userId: user.userId,
        email: attrs.email || user.username,
        name: attrs.name || (attrs.email ? attrs.email.split("@")[0] : "Reader")
      });
      loadProfile();
    } catch {
      setCurrentUser(null);
    }
  };

  const loadProfile = async () => {
    try {
      const p = await api.getProfile();
      if (p) setProfile({ displayName: p.displayName || "", requestNotifications: p.requestNotifications ?? true });
    } catch (e) {
      console.warn("Could not load profile", e);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // ── DATA LOADING ─────────────────────────────────────────────────────────────
  const loadBooks = async () => {
    setLoading(true);
    try {
      if (view === "my-library" && currentUser) {
        setBooks(await api.getMyBooks());
      } else {
        setBooks(await api.getPublicBooks());
      }
    } catch (e) {
      console.error(e);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      setRequests(await api.getRequests());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === "requests") {
      if (!currentUser) {
        setAuthModalOpen(true);
      } else {
        loadRequests();
      }
    } else if (view === "explore" || view === "my-library") {
      if (view === "my-library" && !currentUser) {
        setAuthModalOpen(true);
      } else {
        loadBooks();
      }
    }
  }, [view, currentUser]);

  // ── AUTH HANDLERS ────────────────────────────────────────────────────────────
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
        setAuthError("Please confirm your account with the verification code sent to your email.");
      } else {
        setAuthError(err.message || "Failed to sign in");
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
      setAuthError(err.message || "Failed to sign up");
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
      await signIn({ username: authForm.email.trim(), password: authForm.password });
      await checkAuth();
      setAuthModalOpen(false);
      setAuthForm({ email: "", password: "", name: "", code: "" });
    } catch (err) {
      setAuthError(err.message || "Verification code invalid");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCurrentUser(null);
    setView("explore");
  };

  // ── BOOK REQUEST CREATION ────────────────────────────────────────────────────
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!currentUser) { setAuthModalOpen(true); return; }
    setReqLoading(true);
    try {
      await api.createRequest(reqForm);
      setReqModalOpen(false);
      setReqForm({ title: "", author: "", description: "" });
      setTimeout(loadRequests, 1000);
    } catch (err) {
      alert(err.message || "Error submitting request");
    } finally {
      setReqLoading(false);
    }
  };

  // ── FILTERS ──────────────────────────────────────────────────────────────────
  const filteredBooks = books.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q);
    const matchesCat = filterCat === "All" || b.category === filterCat;
    return matchesSearch && matchesCat;
  });

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand" onClick={() => setView("explore")}>
            <div className="sidebar-brand-icon"><BookOpen size={20} /></div>
            <div>
              <div className="sidebar-brand-title">Obsidian Archive</div>
              <div className="sidebar-brand-sub">Universal Library</div>
            </div>
          </div>

          {currentUser && (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{currentUser.name}</div>
                <div className="sidebar-user-email">{currentUser.email}</div>
              </div>
            </div>
          )}

          <nav className="sidebar-nav">
            <button
              className={`nav-item ${view === "explore" ? "active" : ""}`}
              onClick={() => setView("explore")}
            >
              <Globe size={18} /> Public Library
            </button>
            <button
              className={`nav-item ${view === "my-library" ? "active" : ""}`}
              onClick={() => {
                if (!currentUser) setAuthModalOpen(true);
                else setView("my-library");
              }}
            >
              <Library size={18} /> My Collection
            </button>
            <button
              className={`nav-item ${view === "requests" ? "active" : ""}`}
              onClick={() => {
                if (!currentUser) setAuthModalOpen(true);
                else setView("requests");
              }}
            >
              <MessageSquarePlus size={18} /> Book Requests
            </button>
            {currentUser && (
              <button
                className={`nav-item ${view === "settings" ? "active" : ""}`}
                onClick={() => setView("settings")}
              >
                <Settings size={18} /> Settings
              </button>
            )}
          </nav>

          <div style={{ borderTop: "1px solid rgba(78,70,53,0.3)", paddingTop: 16 }}>
            {currentUser ? (
              <button className="nav-item" onClick={handleSignOut} style={{ color: "#ffb4ab" }}>
                <LogOut size={18} /> Sign Out
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => { setAuthMode("signin"); setAuthModalOpen(true); }}
              >
                <LogIn size={16} /> Sign In
              </button>
            )}
          </div>
        </aside>

        {/* MAIN AREA */}
        <div className="main-area">
          {/* TOPBAR */}
          <header className="topbar">
            <div className="topbar-brand" onClick={() => setView("explore")}>
              <BookOpen size={22} /> Obsidian
            </div>

            {(view === "explore" || view === "my-library") && (
              <div className="topbar-search">
                <Search className="topbar-search-icon" size={18} />
                <input
                  type="text"
                  placeholder="Search by title, author…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            )}

            <div className="topbar-actions">
              {(view === "explore" || view === "my-library") && (
                <button className="icon-btn" onClick={loadBooks} title="Refresh">
                  <RefreshCw size={18} className={loading ? "spin" : ""} />
                </button>
              )}
              {currentUser ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setView("add")}
                >
                  <Plus size={16} /> Upload Book
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => { setAuthMode("signin"); setAuthModalOpen(true); }}
                >
                  <LogIn size={16} /> Sign In to Upload
                </button>
              )}
            </div>
          </header>

          {/* VIEWS */}
          <AnimatePresence mode="wait">
            {/* EXPLORE & MY LIBRARY */}
            {(view === "explore" || view === "my-library") && (
              <motion.div
                key={view}
                className="page"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
              >
                <div className="page-header">
                  <div className="page-eyebrow">
                    <div className="eyebrow-line" />
                    <span className="eyebrow-text">
                      {view === "my-library" ? "Private Vault" : "Universal Archive"}
                    </span>
                  </div>
                  <div className="page-title">
                    {view === "my-library" ? "My Collection" : "Public Library"}
                  </div>
                  <div className="page-sub">
                    {books.length} {books.length === 1 ? "tome" : "tomes"} catalogued
                  </div>
                </div>

                <div className="toolbar">
                  <button
                    className={`cat-chip ${filterCat === "All" ? "active" : ""}`}
                    onClick={() => setFilterCat("All")}
                  >
                    All Genres
                  </button>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className={`cat-chip ${filterCat === cat ? "active" : ""}`}
                      onClick={() => setFilterCat(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {loading ? (
                  <div className="loading-center">
                    <Loader2 size={40} style={{ color: "#ffcd5b" }} className="spin" />
                  </div>
                ) : (
                  <motion.div layout className="book-grid">
                    <AnimatePresence>
                      {filteredBooks.map((book) => (
                        <motion.div
                          key={book.bookId}
                          layout
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.88 }}
                          className="book-card"
                          onClick={() => { setSelectedBook(book); setView("detail"); }}
                        >
                          <div
                            className="book-card-top-bar"
                            style={{ background: getCatColor(book.category) }}
                          />
                          <div className="book-card-badge">
                            {book.visibility === "private" ? (
                              <><Lock size={10} color="#ffb4ab" /> Private</>
                            ) : (
                              <><Globe size={10} color="#4ADE80" /> Public</>
                            )}
                          </div>

                          {book.coverKey ? (
                            <img
                              src={`https://obsidian-covers-12345.s3.amazonaws.com/${book.coverKey}`}
                              className="book-card-img"
                              alt={book.title}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%", height: "100%", background: "#1e2023",
                                display: "flex", alignItems: "center", justifyContent: "center"
                              }}
                            >
                              <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
                            </div>
                          )}

                          <div className="book-overlay">
                            <div className="book-title-text">{book.title}</div>
                            <div className="book-author-text">{book.author || "Unknown Author"}</div>
                            {book.fileType && (
                              <div style={{ fontSize: 10, color: "#ffcd5b", marginTop: 4, textTransform: "uppercase" }}>
                                {book.fileType} Document
                              </div>
                            )}
                          </div>
                        </motion.div>
                      ))}

                      {currentUser && (
                        <motion.div
                          key="add-card"
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="add-card"
                          onClick={() => setView("add")}
                        >
                          <div className="add-card-icon"><Plus size={24} /></div>
                          <div className="add-card-label">Add to Archive</div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* REQUESTS BOARD */}
            {view === "requests" && (
              <motion.div
                key="requests"
                className="page"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
              >
                <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
                  <div>
                    <div className="page-eyebrow">
                      <div className="eyebrow-line" />
                      <span className="eyebrow-text">Community Wishlist</span>
                    </div>
                    <div className="page-title">Book Requests</div>
                    <div className="page-sub">Request books you are looking for or upload to help others.</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => setReqModalOpen(true)}>
                    <Plus size={16} /> Request a Book
                  </button>
                </div>

                {loading ? (
                  <div className="loading-center">
                    <Loader2 size={40} style={{ color: "#ffcd5b" }} className="spin" />
                  </div>
                ) : requests.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "64px 0", color: "#9b8f7b" }}>
                    <MessageSquarePlus size={48} style={{ margin: "0 auto 16px", opacity: 0.4 }} />
                    <h3>No active requests right now.</h3>
                    <p style={{ marginTop: 8 }}>Be the first to request a volume!</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                    {requests.map((r) => (
                      <div key={r.requestId} className="req-card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2e2e6" }}>{r.title}</h3>
                            <p style={{ fontSize: 13, color: "#d2c5af", marginTop: 2 }}>by {r.author || "Unknown"}</p>
                          </div>
                          <span style={{
                            padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                            background: r.status === "open" ? "rgba(255,205,91,0.15)" : "rgba(74,222,128,0.15)",
                            color: r.status === "open" ? "#ffcd5b" : "#4ADE80"
                          }}>
                            {r.status === "open" ? "Seeking" : "Fulfilled"}
                          </span>
                        </div>
                        {r.description && (
                          <p style={{ fontSize: 13, color: "rgba(226,226,230,0.7)", lineHeight: 1.5 }}>
                            {r.description}
                          </p>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, borderTop: "1px solid rgba(78,70,53,0.3)", paddingTop: 12 }}>
                          <span style={{ fontSize: 11, color: "#9b8f7b" }}>
                            Req by {r.requesterName || "Reader"}
                          </span>
                          {currentUser && currentUser.userId === r.requesterId && (
                            <button
                              className="btn btn-danger"
                              style={{ height: 32, padding: "0 12px", fontSize: 12 }}
                              onClick={async () => {
                                await api.deleteRequest(r.requestId);
                                loadRequests();
                              }}
                            >
                              <Trash2 size={13} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* DETAIL VIEW */}
            {view === "detail" && selectedBook && (
              <motion.div
                key="detail"
                className="page"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
              >
                <button className="btn btn-secondary" onClick={() => setView("explore")} style={{ marginBottom: 32 }}>
                  <ArrowLeft size={16} /> Back to Library
                </button>

                <div className="detail-grid">
                  <div className="cover-wrapper">
                    {selectedBook.coverKey ? (
                      <img
                        src={`https://obsidian-covers-12345.s3.amazonaws.com/${selectedBook.coverKey}`}
                        className="cover-img"
                        alt={selectedBook.title}
                      />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "#1e2023", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <BookOpen size={72} style={{ color: getCatColor(selectedBook.category), opacity: 0.28 }} />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="page-eyebrow">
                      <div className="eyebrow-line" />
                      <span className="eyebrow-text">
                        {selectedBook.category || "Uncategorized"} · {selectedBook.visibility === "private" ? "Private" : "Public"}
                      </span>
                    </div>
                    <h1 className="detail-title">{selectedBook.title}</h1>
                    <p className="detail-author">by {selectedBook.author || "Unknown Author"}</p>
                    {selectedBook.description && (
                      <p className="detail-description">{selectedBook.description}</p>
                    )}

                    <div className="detail-actions">
                      {selectedBook.fileKey && (
                        <button className="btn btn-primary">
                          <BookOpen size={16} /> Read Document ({selectedBook.fileType?.toUpperCase() || "FILE"})
                        </button>
                      )}
                      {currentUser && currentUser.userId === selectedBook.ownerId && (
                        <>
                          <button className="btn btn-secondary" onClick={() => setView("edit")}>
                            <Pencil size={16} /> Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={async () => {
                              if (confirm(`Delete "${selectedBook.title}" permanently?`)) {
                                await api.deleteBook(selectedBook.bookId);
                                setView("explore");
                                setTimeout(loadBooks, 1000);
                              }
                            }}
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ADD / EDIT VIEW */}
            {(view === "add" || view === "edit") && (
              <motion.div
                key="editor"
                className="page"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
              >
                <BookEditor
                  book={view === "edit" ? selectedBook : null}
                  onClose={() => { setView("explore"); loadBooks(); }}
                />
              </motion.div>
            )}

            {/* SETTINGS VIEW */}
            {view === "settings" && currentUser && (
              <motion.div
                key="settings"
                className="page"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
              >
                <div className="page-header">
                  <div className="page-eyebrow">
                    <div className="eyebrow-line" />
                    <span className="eyebrow-text">Preferences</span>
                  </div>
                  <div className="page-title">Account Settings</div>
                  <div className="page-sub">Manage your profile and notifications.</div>
                </div>

                <div className="editor-card glass-panel" style={{ maxWidth: 600 }}>
                  <div className="field">
                    <label>Display Name</label>
                    <input
                      type="text"
                      value={profile.displayName}
                      onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Email Address</label>
                    <input type="text" value={currentUser.email} disabled style={{ opacity: 0.6 }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0", borderTop: "1px solid rgba(78,70,53,0.3)", paddingTop: 20 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>Request Notifications</div>
                      <div style={{ fontSize: 12, color: "#9b8f7b", marginTop: 2 }}>
                        Notify me when other readers submit new book requests
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 20, height: 20, accentColor: "#ffcd5b", cursor: "pointer" }}
                      checked={profile.requestNotifications}
                      onChange={(e) => setProfile({ ...profile, requestNotifications: e.target.checked })}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      await api.updateProfile(profile);
                      alert("Profile saved!");
                    }}
                  >
                    <Save size={16} /> Save Changes
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* AUTH MODAL */}
      <AnimatePresence>
        {authModalOpen && (
          <div className="modal-overlay" onClick={() => setAuthModalOpen(false)}>
            <motion.div
              className="modal-box"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: "#ffcd5b" }}>
                  {authMode === "signin" ? "Welcome Back" : authMode === "signup" ? "Join Obsidian Archive" : "Verify Account"}
                </h2>
                <button className="icon-btn" onClick={() => setAuthModalOpen(false)}><X size={20} /></button>
              </div>

              {authError && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,180,171,0.15)", color: "#ffb4ab", fontSize: 13, marginBottom: 16, border: "1px solid rgba(255,180,171,0.3)" }}>
                  {authError}
                </div>
              )}

              {authMode === "signin" && (
                <form onSubmit={handleSignIn}>
                  <div className="field">
                    <label>Email</label>
                    <input
                      type="email"
                      required
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input
                      type="password"
                      required
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Sign In"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#d2c5af", marginTop: 16 }}>
                    Don't have an account?{" "}
                    <span style={{ color: "#ffcd5b", cursor: "pointer", fontWeight: 600 }} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>
                      Sign Up
                    </span>
                  </p>
                </form>
              )}

              {authMode === "signup" && (
                <form onSubmit={handleSignUp}>
                  <div className="field">
                    <label>Full Name</label>
                    <input
                      type="text"
                      required
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Email</label>
                    <input
                      type="email"
                      required
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Password (min 8 chars)</label>
                    <input
                      type="password"
                      required
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                  </div>
                  <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Create Account"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#d2c5af", marginTop: 16 }}>
                    Already have an account?{" "}
                    <span style={{ color: "#ffcd5b", cursor: "pointer", fontWeight: 600 }} onClick={() => { setAuthMode("signin"); setAuthError(""); }}>
                      Sign In
                    </span>
                  </p>
                </form>
              )}

              {authMode === "confirm" && (
                <form onSubmit={handleConfirmSignUp}>
                  <p style={{ fontSize: 14, color: "#d2c5af", marginBottom: 16 }}>
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
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Verify & Sign In"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 12, color: "#9b8f7b", marginTop: 16, cursor: "pointer" }} onClick={() => resendSignUpCode({ username: authForm.email })}>
                    Didn't receive code? Resend
                  </p>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* REQUEST MODAL */}
      <AnimatePresence>
        {reqModalOpen && (
          <div className="modal-overlay" onClick={() => setReqModalOpen(false)}>
            <motion.div
              className="modal-box"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: "#ffcd5b" }}>Request a Volume</h2>
                <button className="icon-btn" onClick={() => setReqModalOpen(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateRequest}>
                <div className="field">
                  <label>Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dune"
                    value={reqForm.title}
                    onChange={(e) => setReqForm({ ...reqForm, title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Author (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Frank Herbert"
                    value={reqForm.author}
                    onChange={(e) => setReqForm({ ...reqForm, author: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Notes / Why you want it</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Looking for EPUB format for my study…"
                    value={reqForm.description}
                    onChange={(e) => setReqForm({ ...reqForm, description: e.target.value })}
                  />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={reqLoading}>
                  {reqLoading ? <Loader2 size={16} className="spin" /> : "Submit Request"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── BOOK EDITOR COMPONENT ─────────────────────────────────────────────────────
function BookEditor({ book, onClose }) {
  const [formData, setFormData] = useState({
    title: book?.title || "",
    author: book?.author || "",
    category: book?.category || CATEGORIES[0],
    description: book?.description || "",
    visibility: book?.visibility || "public",
    coverKey: book?.coverKey || "",
    fileKey: book?.fileKey || "",
    fileType: book?.fileType || "",
    fileSizeBytes: book?.fileSizeBytes || 0
  });
  const [coverFile, setCoverFile] = useState(null);
  const [bookFile, setBookFile] = useState(null);
  const [previewCover, setPreviewCover] = useState(
    book?.coverKey ? `https://obsidian-covers-12345.s3.amazonaws.com/${book.coverKey}` : ""
  );
  const [saving, setSaving] = useState(false);
  const isNew = !book;

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalCoverKey = formData.coverKey;
      let finalFileKey = formData.fileKey;
      let finalFileType = formData.fileType;
      let finalFileSize = formData.fileSizeBytes;

      if (coverFile) {
        const { coverKey } = await api.uploadCover(coverFile);
        finalCoverKey = coverKey;
      }

      if (bookFile) {
        const { fileKey, fileType, fileSizeBytes } = await api.uploadBookFile(bookFile);
        finalFileKey = fileKey;
        finalFileType = fileType;
        finalFileSize = fileSizeBytes;
      }

      const payload = {
        ...formData,
        coverKey: finalCoverKey,
        fileKey: finalFileKey,
        fileType: finalFileType,
        fileSizeBytes: finalFileSize
      };

      if (isNew) {
        await api.createBook(payload);
      } else {
        await api.updateBook(book.bookId, payload);
      }

      setTimeout(onClose, 600);
    } catch (e) {
      alert(e.message || "Failed to save book.");
      setSaving(false);
    }
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={onClose} style={{ marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">{isNew ? "New Entry" : "Edit Volume"}</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 700 }}>
          {isNew ? "Catalog a Book" : `Edit: ${book.title}`}
        </h1>
      </div>

      <div className="editor-grid">
        <div className="editor-card glass-panel">
          <div className="field">
            <label>Title</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Red Rising"
            />
          </div>
          <div className="field">
            <label>Author</label>
            <input
              type="text"
              value={formData.author}
              onChange={(e) => setFormData({ ...formData, author: e.target.value })}
              placeholder="e.g. Pierce Brown"
            />
          </div>
          <div className="field">
            <label>Genre / Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Visibility</label>
            <select
              value={formData.visibility}
              onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
            >
              <option value="public">Public (Visible to everyone in archive)</option>
              <option value="private">Private (Vaulted to your library only)</option>
            </select>
          </div>
          <div className="field">
            <label>Synopsis / Description</label>
            <textarea
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="A brief overview of the book…"
            />
          </div>
        </div>

        <div className="editor-card glass-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Cover upload */}
          <div className="field">
            <label>Cover Image (PNG/JPG)</label>
            <div className="upload-zone">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) {
                    setCoverFile(f);
                    setPreviewCover(URL.createObjectURL(f));
                  }
                }}
              />
              {previewCover ? (
                <img src={previewCover} style={{ maxHeight: 120, objectFit: "contain" }} alt="Cover" />
              ) : (
                <div style={{ textAlign: "center", color: "#d2c5af" }}>
                  <UploadCloud size={32} style={{ margin: "0 auto 8px", color: "#ffcd5b" }} />
                  <p style={{ fontSize: 13 }}>Click to upload cover image</p>
                </div>
              )}
            </div>
          </div>

          {/* Book file upload */}
          <div className="field">
            <label>Document / Book File (EPUB, PDF up to 100MB)</label>
            <div className="upload-zone" style={{ minHeight: 100 }}>
              <input
                type="file"
                accept=".epub,.pdf,.mobi,.txt"
                onChange={(e) => {
                  const f = e.target.files[0];
                  if (f) setBookFile(f);
                }}
              />
              <div style={{ textAlign: "center", color: "#d2c5af" }}>
                <FileText size={32} style={{ margin: "0 auto 8px", color: "#ffcd5b" }} />
                <p style={{ fontSize: 13 }}>
                  {bookFile ? bookFile.name : formData.fileKey ? `File attached (${formData.fileType})` : "Click to select EPUB or PDF file"}
                </p>
                {bookFile && (
                  <p style={{ fontSize: 11, color: "#9b8f7b", marginTop: 4 }}>
                    {(bookFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !formData.title}
        >
          {saving ? <><Loader2 size={16} className="spin" /> Uploading & Cataloging…</> : <><Save size={16} /> Save Book</>}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </>
  );
}