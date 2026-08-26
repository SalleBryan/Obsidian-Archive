import React, { useState, useEffect, useCallback } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useParams,
  useSearchParams,
  Link
} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Pencil, Trash2, ArrowLeft,
  BookOpen, X, Library, Loader2, Save,
  AlertTriangle, Check, RefreshCw, UploadCloud, Settings,
  Lock, Globe, User, LogIn, LogOut, FileText, Bell, MessageSquarePlus, Share2,
  Shield, CheckCircle2, Circle, ExternalLink, Sparkles
} from "lucide-react";
import {
  signIn,
  signUp,
  confirmSignUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
  resendSignUpCode,
  signInWithRedirect
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
    try {
      const res = await fetch(`${EP.books}?visibility=public`);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data)) return data;
      return data.books || [];
    } catch {
      return [];
    }
  },
  getMyBooks: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.booksMine, { headers });
    if (!res.ok) throw new Error("Failed to load your collection");
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.books || [];
  },
  getBookById: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.books}/${bookId}`, { headers });
    if (!res.ok) {
      if (res.status === 403) throw new Error("This book is private to its author.");
      if (res.status === 404) throw new Error("Book not found.");
      throw new Error("Failed to load book details.");
    }
    return res.json();
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
    if (!res.ok) throw new Error("Failed to request cover upload signature");
    const { uploadUrl, coverKey, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!uploadRes.ok) throw new Error("Cover upload to S3 failed");
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
      throw new Error(err.error || "Failed to request book file upload signature");
    }
    const { uploadUrl, fileKey } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!uploadRes.ok) throw new Error("Document upload to S3 failed");
    return { fileKey, fileType: ext, fileSizeBytes: file.size };
  },
  getRequests: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.requests, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
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
  getProfile: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.profile, { headers });
    if (!res.ok) return null;
    return res.json();
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

// ── STYLES ───────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #111317;
    color: #e2e2e6;
    font-family: 'Plus Jakarta Sans', sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  a { color: inherit; text-decoration: none; }
  .shell { display: flex; min-height: 100vh; }
  .sidebar {
    width: 280px; background: #16181d; border-right: 1px solid rgba(78,70,53,0.3);
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 32px 24px; position: fixed; top: 0; bottom: 0; left: 0; z-index: 40;
  }
  @media(max-width: 768px) { .sidebar { display: none; } }
  .sidebar-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; cursor: pointer; }
  .sidebar-brand-icon {
    width: 42px; height: 42px; border-radius: 10px; background: rgba(255,205,91,0.12);
    border: 1px solid rgba(255,205,91,0.3); display: flex; align-items: center; justify-content: center;
    color: #ffcd5b; box-shadow: 0 4px 16px rgba(255,205,91,0.15);
  }
  .sidebar-brand-title { font-size: 19px; font-weight: 800; color: #ffcd5b; letter-spacing: -0.02em; }
  .sidebar-brand-sub { font-size: 11px; color: #9b8f7b; text-transform: uppercase; letter-spacing: 0.1em; }
  .sidebar-user {
    display: flex; align-items: center; gap: 12px; padding: 12px;
    background: #1e2025; border: 1px solid rgba(78,70,53,0.4); border-radius: 12px; margin-bottom: 24px;
  }
  .sidebar-user-avatar {
    width: 38px; height: 38px; border-radius: 50%; background: #ffcd5b; color: #1a1300;
    font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 16px;
  }
  .sidebar-user-info { overflow: hidden; flex: 1; }
  .sidebar-user-name { font-size: 14px; font-weight: 700; color: #e2e2e6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sidebar-user-email { font-size: 11px; color: #9b8f7b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 14px; padding: 12px 16px;
    border-radius: 10px; color: #d2c5af; font-size: 14px; font-weight: 600;
    transition: all 0.2s; border: none; background: transparent; cursor: pointer; width: 100%; text-align: left;
  }
  .nav-item:hover { background: #1e2025; color: #ffcd5b; }
  .nav-item.active { background: rgba(255,205,91,0.12); color: #ffcd5b; border-left: 3px solid #ffcd5b; }
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
    width: 100%; height: 42px; padding: 0 16px 0 44px; background: #1e2025;
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
  .icon-btn:hover { background: #1e2025; color: #ffcd5b; }
  .page { padding: 40px 48px 100px; max-width: 1440px; width: 100%; }
  @media(max-width: 768px) { .page { padding: 24px 16px 100px; } }
  .page-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .eyebrow-line { width: 48px; height: 3px; background: #ffcd5b; border-radius: 999px; }
  .eyebrow-text { font-size: 11px; font-weight: 700; color: #ffcd5b; text-transform: uppercase; letter-spacing: 0.12em; }
  .page-title { font-size: 42px; font-weight: 800; color: #e2e2e6; letter-spacing: -0.02em; line-height: 1.15; }
  .page-sub { font-size: 15px; color: rgba(210,197,175,0.7); margin-top: 6px; }
  .page-header { margin-bottom: 32px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; align-items: center; }
  .cat-chip {
    padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: all 0.15s; border: 1px solid rgba(78,70,53,0.5);
    background: transparent; color: #d2c5af; white-space: nowrap; font-family: inherit;
  }
  .cat-chip:hover { border-color: #ffcd5b; color: #e2e2e6; }
  .cat-chip.active { background: rgba(255,205,91,0.12); border-color: rgba(255,205,91,0.5); color: #ffcd5b; font-weight: 700; }
  .book-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 24px; }
  .book-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 2/3;
    background: #1e2025; border: 1px solid rgba(78,70,53,0.25); box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    transition: transform 0.3s, box-shadow 0.3s;
  }
  .book-card:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 28px 48px rgba(0,0,0,0.75); border-color: rgba(255,205,91,0.4); }
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
    background: linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.35) 55%, transparent 100%);
    display: flex; flex-direction: column; justify-content: flex-end; padding: 14px;
  }
  .book-title-text { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.25; }
  .book-author-text { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 2px; }
  .add-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 2/3;
    background: #1e2025; border: 2px dashed rgba(78,70,53,0.5);
    display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s;
  }
  .add-card:hover { border-color: #ffcd5b; background: #282a2d; }
  .add-card-icon {
    width: 56px; height: 56px; border-radius: 50%; background: #333538;
    display: flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #d2c5af;
  }
  .add-card:hover .add-card-icon { background: rgba(255,205,91,0.15); color: #ffcd5b; }
  .add-card-label { font-size: 14px; font-weight: 600; color: #d2c5af; text-align: center; padding: 0 12px; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 22px;
    border-radius: 999px; font-family: inherit; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: all 0.2s; border: none; text-decoration: none;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #ffcd5b; color: #231900; box-shadow: 0 4px 14px rgba(255,205,91,0.25); }
  .btn-primary:hover:not(:disabled) { background: #ffd875; transform: translateY(-1px); }
  .btn-danger { background: transparent; color: #d2c5af; border: 1px solid rgba(78,70,53,0.6); }
  .btn-danger:hover:not(:disabled) { color: #ffb4ab; border-color: rgba(255,180,171,0.4); background: rgba(255,180,171,0.08); }
  .btn-secondary { background: transparent; color: #d2c5af; border: 1px solid rgba(78,70,53,0.6); }
  .btn-secondary:hover:not(:disabled) { background: #282a2d; color: #e2e2e6; }
  .btn-google {
    background: #ffffff; color: #1f1f1f; border: 1px solid #dadce0; width: 100%;
    justify-content: center; margin-bottom: 16px; font-weight: 600;
  }
  .btn-google:hover:not(:disabled) { background: #f8f9fa; border-color: #c6c6c6; }
  .glass-panel {
    background: rgba(22,24,29,0.75); backdrop-filter: blur(14px);
    border: 1px solid rgba(255,205,91,0.12); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .detail-grid { display: grid; grid-template-columns: 300px 1fr; gap: 48px; align-items: start; }
  @media(max-width: 768px) { .detail-grid { grid-template-columns: 1fr; gap: 28px; } }
  .cover-wrapper {
    width: 100%; aspect-ratio: 2/3; border-radius: 12px; overflow: hidden;
    background: #1e2025; border: 1px solid rgba(78,70,53,0.3); box-shadow: 0 20px 60px rgba(0,0,0,0.7); position: relative;
  }
  .cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .detail-title { font-size: 38px; font-weight: 800; line-height: 1.15; margin-bottom: 8px; }
  .detail-author { font-size: 18px; color: #d2c5af; margin-bottom: 24px; font-weight: 500; }
  .detail-description { font-size: 15px; line-height: 1.8; color: rgba(226,226,230,0.85); margin-bottom: 32px; max-width: 680px; }
  .detail-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
  .editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  @media(max-width: 768px) { .editor-grid { grid-template-columns: 1fr; } }
  .editor-card { border-radius: 14px; padding: 32px; position: relative; }
  .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .field label { font-size: 11px; font-weight: 700; color: #d2c5af; text-transform: uppercase; letter-spacing: 0.1em; }
  .field input, .field select, .field textarea {
    background: #1e2025; border: 1px solid rgba(78,70,53,0.45); padding: 12px 16px; border-radius: 8px;
    color: #e2e2e6; font-family: inherit; font-size: 14px; width: 100%; outline: none; transition: all 0.2s;
  }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: #ffcd5b; }
  .field select option { background: #1e2025; }
  .upload-zone {
    border: 2px dashed rgba(78,70,53,0.5); border-radius: 10px; min-height: 140px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; background: #1e2025; padding: 16px;
  }
  .upload-zone:hover { border-color: #ffcd5b; background: rgba(255,205,91,0.04); }
  .upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
  }
  .modal-box {
    background: #181a1f; border: 1px solid rgba(255,205,91,0.25); border-radius: 18px;
    width: 100%; max-width: 460px; padding: 36px; box-shadow: 0 24px 64px rgba(0,0,0,0.9);
  }
  .req-card {
    background: #1e2025; border: 1px solid rgba(78,70,53,0.3); border-radius: 12px; padding: 20px;
    display: flex; flex-direction: column; gap: 12px; transition: transform 0.2s;
  }
  .req-card:hover { transform: translateY(-4px); border-color: #ffcd5b; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  .loading-center { display: flex; align-items: center; justify-content: center; min-height: 340px; }
  .mobile-nav {
    display: none; position: fixed; bottom: 0; left: 0; right: 0;
    background: #181a1f; border-top: 1px solid rgba(78,70,53,0.3); z-index: 50;
  }
  @media(max-width: 768px) { .mobile-nav { display: flex; justify-content: space-around; height: 64px; align-items: center; } }
  .mobile-nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: #d2c5af; font-size: 10px; font-weight: 500; cursor: pointer; flex: 1;
    padding: 8px 0; border: none; background: transparent; font-family: inherit; text-decoration: none;
  }
  .mobile-nav-item.active { color: #ffcd5b; }

  /* Empty state card */
  .empty-vault-card {
    border: 1px solid rgba(255,205,91,0.18); border-radius: 16px; padding: 56px 32px;
    background: rgba(26,28,34,0.6); text-align: center; max-width: 620px; margin: 40px auto;
    display: flex; flex-direction: column; align-items: center; gap: 16px;
  }
  .empty-vault-icon {
    width: 72px; height: 72px; border-radius: 50%; background: rgba(255,205,91,0.12);
    border: 1px solid rgba(255,205,91,0.3); display: flex; align-items: center; justify-content: center;
    color: #ffcd5b; margin-bottom: 8px;
  }
  .policy-checklist {
    background: #14161a; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
    padding: 12px 16px; margin: 12px 0 16px; display: flex; flex-direction: column; gap: 6px;
  }
  .policy-item {
    display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa;
  }
  .policy-item.valid { color: #4ADE80; font-weight: 600; }
`;

// ── MAIN APP ROOT COMPONENT ──────────────────────────────────────────────────
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

  // Global search & filters
  const [searchQuery, setSearchQuery] = useState("");

  // ── AUTH CHECK ─────────────────────────────────────────────────────────────
  const checkAuth = useCallback(async () => {
    try {
      const user = await getCurrentUser();
      const attrs = await fetchUserAttributes();
      setCurrentUser({
        userId: user.userId,
        email: attrs.email || user.username,
        name: attrs.name || (attrs.email ? attrs.email.split("@")[0] : "Reader")
      });
    } catch {
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // ── AUTH HANDLERS ──────────────────────────────────────────────────────────
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
        setAuthError("Account not confirmed. Please enter the verification code sent to your email.");
      } else {
        setAuthError(err.message || "Failed to sign in. Please verify credentials.");
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
      // Auto-sign in after successful verification
      try {
        await signIn({ username: authForm.email.trim(), password: authForm.password });
      } catch {
        // Sign in fallback
      }
      await checkAuth();
      setAuthModalOpen(false);
      setAuthForm({ email: "", password: "", name: "", code: "" });
    } catch (err) {
      setAuthError(err.message || "Invalid verification code.");
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
      setAuthError("Google SSO: " + (err.message || "Configure Google OAuth Client ID in Cognito to activate."));
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCurrentUser(null);
    navigate("/library");
  };

  const openAuth = (mode = "signin") => {
    setAuthMode(mode);
    setAuthError("");
    setAuthModalOpen(true);
  };

  // Password policy live checks
  const pass = authForm.password || "";
  const policyChecks = {
    length: pass.length >= 8,
    upper: /[A-Z]/.test(pass),
    lower: /[a-z]/.test(pass),
    digit: /[0-9]/.test(pass),
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">
        {/* DESKTOP SIDEBAR */}
        <aside className="sidebar">
          <div>
            <div className="sidebar-brand" onClick={() => navigate("/library")}>
              <div className="sidebar-brand-icon"><BookOpen size={22} /></div>
              <div>
                <div className="sidebar-brand-title">Obsidian Archive</div>
                <div className="sidebar-brand-sub">Universal Knowledge Vault</div>
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
              <Link
                to="/library"
                className={`nav-item ${location.pathname === "/library" || location.pathname === "/" ? "active" : ""}`}
              >
                <Globe size={18} /> Public Library
              </Link>
              <Link
                to="/collection"
                className={`nav-item ${location.pathname === "/collection" ? "active" : ""}`}
                onClick={(e) => {
                  if (!currentUser) {
                    e.preventDefault();
                    openAuth("signin");
                  }
                }}
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
                  to="/settings"
                  className={`nav-item ${location.pathname === "/settings" ? "active" : ""}`}
                >
                  <Settings size={18} /> Settings
                </Link>
              )}
            </nav>
          </div>

          <div style={{ borderTop: "1px solid rgba(78,70,53,0.3)", paddingTop: 16 }}>
            {currentUser ? (
              <button className="nav-item" onClick={handleSignOut} style={{ color: "#ffb4ab" }}>
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
          {/* STICKY TOPBAR */}
          <header className="topbar">
            <div className="topbar-brand" onClick={() => navigate("/library")}>
              <BookOpen size={22} /> Obsidian
            </div>

            <div className="topbar-search">
              <Search className="topbar-search-icon" size={18} />
              <input
                type="text"
                placeholder="Search catalog by title, author…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="topbar-actions">
              {currentUser ? (
                <button
                  className="btn btn-primary"
                  onClick={() => navigate("/upload")}
                >
                  <Plus size={16} /> Upload Book
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => openAuth("signin")}
                >
                  <LogIn size={16} /> Sign In
                </button>
              )}
            </div>
          </header>

          {/* MULTI-PAGE ROUTES */}
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route
              path="/library"
              element={<PublicLibraryPage searchQuery={searchQuery} currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/collection"
              element={<MyCollectionPage searchQuery={searchQuery} currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/requests"
              element={<RequestsBoardPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/upload"
              element={<UploadBookPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/books/:bookId"
              element={<BookDetailPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/books/:bookId/edit"
              element={<EditBookPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/settings"
              element={<SettingsPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
          </Routes>
        </div>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav className="mobile-nav">
          <Link to="/library" className={`mobile-nav-item ${location.pathname === "/library" ? "active" : ""}`}>
            <Globe size={18} />
            <span>Library</span>
          </Link>
          <Link
            to="/collection"
            className={`mobile-nav-item ${location.pathname === "/collection" ? "active" : ""}`}
            onClick={(e) => { if (!currentUser) { e.preventDefault(); openAuth("signin"); } }}
          >
            <Library size={18} />
            <span>Vault</span>
          </Link>
          <Link to="/requests" className={`mobile-nav-item ${location.pathname === "/requests" ? "active" : ""}`}>
            <MessageSquarePlus size={18} />
            <span>Requests</span>
          </Link>
          {currentUser && (
            <Link to="/settings" className={`mobile-nav-item ${location.pathname === "/settings" ? "active" : ""}`}>
              <Settings size={18} />
              <span>Settings</span>
            </Link>
          )}
        </nav>
      </div>

      {/* GLOBAL AUTH MODAL */}
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
                <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,180,171,0.15)", color: "#ffb4ab", fontSize: 13, marginBottom: 16, border: "1px solid rgba(255,180,171,0.3)" }}>
                  {authError}
                </div>
              )}

              {/* Google SSO Button on Sign In & Sign Up */}
              {authMode !== "confirm" && (
                <>
                  <button className="btn btn-google" onClick={handleGoogleSSO} disabled={authLoading}>
                    <svg width="18" height="18" viewBox="0 0 24 24" style={{ marginRight: 8 }}>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    Continue with Google
                  </button>

                  <div style={{ display: "flex", alignItems: "center", margin: "16px 0", gap: 12 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                    <span style={{ fontSize: 11, color: "#9b8f7b", textTransform: "uppercase", letterSpacing: "0.1em" }}>or with email</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
                  </div>
                </>
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
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Sign In to Vault"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#d2c5af", marginTop: 16 }}>
                    New to Obsidian Archive?{" "}
                    <span style={{ color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signup"); setAuthError(""); }}>
                      Create Account
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

                  {/* PASSWORD POLICY CHECKLIST */}
                  <div className="policy-checklist">
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#ffcd5b", textTransform: "uppercase", marginBottom: 4 }}>
                      Password Requirements:
                    </div>
                    <div className={`policy-item ${policyChecks.length ? "valid" : ""}`}>
                      {policyChecks.length ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      At least 8 characters
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
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Create Account & Send Code"}
                  </button>
                  <p style={{ textAlign: "center", fontSize: 13, color: "#d2c5af", marginTop: 16 }}>
                    Already have an account?{" "}
                    <span style={{ color: "#ffcd5b", cursor: "pointer", fontWeight: 700 }} onClick={() => { setAuthMode("signin"); setAuthError(""); }}>
                      Sign In
                    </span>
                  </p>
                </form>
              )}

              {authMode === "confirm" && (
                <form onSubmit={handleConfirmSignUp}>
                  <p style={{ fontSize: 14, color: "#d2c5af", marginBottom: 16, lineHeight: 1.5 }}>
                    Enter the 6-digit confirmation code sent to <strong>{authForm.email}</strong> from Obsidian Archive.
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
                    {authLoading ? <Loader2 size={16} className="spin" /> : "Verify Code & Open Vault"}
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
    </>
  );
}

// ── PAGE 1: PUBLIC LIBRARY PAGE ──────────────────────────────────────────────
function PublicLibraryPage({ searchQuery, currentUser, onOpenAuth }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("All");

  const loadBooks = async () => {
    setLoading(true);
    const data = await api.getPublicBooks();
    setBooks(data);
    setLoading(false);
  };

  useEffect(() => {
    loadBooks();
  }, []);

  const filteredBooks = books.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q);
    const matchesCat = filterCat === "All" || b.category === filterCat;
    return matchesSearch && matchesCat;
  });

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Universal Archive</span>
          </div>
          <div className="page-title">Public Library</div>
          <div className="page-sub">
            {books.length} {books.length === 1 ? "tome" : "tomes"} available for open exploration
          </div>
        </div>
        <button className="icon-btn" onClick={loadBooks} title="Refresh Library">
          <RefreshCw size={18} className={loading ? "spin" : ""} />
        </button>
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
      ) : filteredBooks.length === 0 ? (
        /* PUBLIC EMPTY STATE */
        <div className="empty-vault-card">
          <div className="empty-vault-icon">
            <Globe size={36} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#e2e2e6" }}>The Public Archive is Empty</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6 }}>
            No public tomes have been cataloged in this section yet. Be the first scholar or reader to contribute a volume to the universal library.
          </p>
          {currentUser ? (
            <button className="btn btn-primary" onClick={() => navigate("/upload?visibility=public")}>
              <Plus size={16} /> Contribute to Public Archive
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
              <LogIn size={16} /> Sign In to Contribute
            </button>
          )}
        </div>
      ) : (
        <motion.div layout className="book-grid">
          {filteredBooks.map((book) => (
            <motion.div
              key={book.bookId}
              layout
              className="book-card"
              onClick={() => navigate(`/books/${book.bookId}`)}
            >
              <div
                className="book-card-top-bar"
                style={{ background: getCatColor(book.category) }}
              />
              <div className="book-card-badge">
                <Globe size={10} color="#4ADE80" /> Public
              </div>

              {book.coverKey ? (
                <img
                  src={`https://obsidian-covers-12345.s3.amazonaws.com/${book.coverKey}`}
                  className="book-card-img"
                  alt={book.title}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "#1e2025", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
                </div>
              )}

              <div className="book-overlay">
                <div className="book-title-text">{book.title}</div>
                <div className="book-author-text">{book.author || "Unknown Author"}</div>
                {book.fileType && (
                  <div style={{ fontSize: 10, color: "#ffcd5b", marginTop: 4, textTransform: "uppercase", fontWeight: 700 }}>
                    {book.fileType} Document
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── PAGE 2: MY COLLECTION PAGE ───────────────────────────────────────────────
function MyCollectionPage({ searchQuery, currentUser, onOpenAuth }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("All");

  const loadBooks = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const data = await api.getMyBooks();
      setBooks(data);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadBooks();
    } else {
      setLoading(false);
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="page">
        <div className="empty-vault-card">
          <div className="empty-vault-icon"><Lock size={36} /></div>
          <h2>Sign In to Access Your Vault</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>Your personal collection is encrypted and private to your account.</p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const filteredBooks = books.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q);
    const matchesCat = filterCat === "All" || b.category === filterCat;
    return matchesSearch && matchesCat;
  });

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Private Vault</span>
          </div>
          <div className="page-title">My Collection</div>
          <div className="page-sub">
            {books.length} {books.length === 1 ? "tome" : "tomes"} in your encrypted sanctuary
          </div>
        </div>
        <button className="icon-btn" onClick={loadBooks} title="Refresh Collection">
          <RefreshCw size={18} className={loading ? "spin" : ""} />
        </button>
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
      ) : filteredBooks.length === 0 ? (
        /* MY COLLECTION EMPTY STATE */
        <div className="empty-vault-card">
          <div className="empty-vault-icon">
            <Shield size={36} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#e2e2e6" }}>Your Vault is Empty</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6 }}>
            Keep your research papers, personal manuscripts, and private documents secure in your personal vault where only you can read them.
          </p>
          <button className="btn btn-primary" onClick={() => navigate("/upload?visibility=private")}>
            <Plus size={16} /> Add to Archive
          </button>
        </div>
      ) : (
        <motion.div layout className="book-grid">
          {filteredBooks.map((book) => (
            <motion.div
              key={book.bookId}
              layout
              className="book-card"
              onClick={() => navigate(`/books/${book.bookId}`)}
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
                <div style={{ width: "100%", height: "100%", background: "#1e2025", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
                </div>
              )}

              <div className="book-overlay">
                <div className="book-title-text">{book.title}</div>
                <div className="book-author-text">{book.author || "Unknown Author"}</div>
                {book.fileType && (
                  <div style={{ fontSize: 10, color: "#ffcd5b", marginTop: 4, textTransform: "uppercase", fontWeight: 700 }}>
                    {book.fileType} Document
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          <div className="add-card" onClick={() => navigate("/upload")}>
            <div className="add-card-icon"><Plus size={24} /></div>
            <div className="add-card-label">Add to Archive</div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── PAGE 3: BOOK REQUESTS BOARD ──────────────────────────────────────────────
function RequestsBoardPage({ currentUser, onOpenAuth }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", description: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    const data = await api.getRequests();
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!currentUser) { onOpenAuth("signin"); return; }
    setSubmitting(true);
    try {
      await api.createRequest(form);
      setModalOpen(false);
      setForm({ title: "", author: "", description: "" });
      setTimeout(loadRequests, 1000);
    } catch (err) {
      alert(err.message || "Error creating request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Community Wishlist</span>
          </div>
          <div className="page-title">Book Requests</div>
          <div className="page-sub">Request manuscripts you need or help fulfill requests for fellow scholars.</div>
        </div>
        <button className="btn btn-primary" onClick={() => {
          if (!currentUser) onOpenAuth("signin");
          else setModalOpen(true);
        }}>
          <Plus size={16} /> Request a Book
        </button>
      </div>

      {loading ? (
        <div className="loading-center">
          <Loader2 size={40} style={{ color: "#ffcd5b" }} className="spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-vault-card">
          <div className="empty-vault-icon"><MessageSquarePlus size={36} /></div>
          <h2>No Active Requests</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>Be the first reader to submit a request for an elusive manuscript.</p>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Submit Request
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20 }}>
          {requests.map((r) => (
            <div key={r.requestId} className="req-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2e2e6" }}>{r.title}</h3>
                  <p style={{ fontSize: 13, color: "#d2c5af", marginTop: 2 }}>by {r.author || "Unknown Author"}</p>
                </div>
                <span style={{
                  padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: r.status === "open" ? "rgba(255,205,91,0.15)" : "rgba(74,222,128,0.15)",
                  color: r.status === "open" ? "#ffcd5b" : "#4ADE80"
                }}>
                  {r.status === "open" ? "Seeking" : "Fulfilled"}
                </span>
              </div>
              {r.description && (
                <p style={{ fontSize: 13, color: "rgba(226,226,230,0.75)", lineHeight: 1.5 }}>
                  {r.description}
                </p>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, borderTop: "1px solid rgba(78,70,53,0.3)", paddingTop: 12 }}>
                <span style={{ fontSize: 11, color: "#9b8f7b" }}>
                  Requested by {r.requesterName || "Reader"}
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

      {/* REQUEST MODAL */}
      <AnimatePresence>
        {modalOpen && (
          <div className="modal-overlay" onClick={() => setModalOpen(false)}>
            <motion.div
              className="modal-box"
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#ffcd5b" }}>Request a Volume</h2>
                <button className="icon-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateRequest}>
                <div className="field">
                  <label>Book Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dune"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Author (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Frank Herbert"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Notes / Format Requested</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Looking for EPUB or PDF version for research study…"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={submitting}>
                  {submitting ? <Loader2 size={16} className="spin" /> : "Post Request to Community"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── PAGE 4: UPLOAD / CATALOG BOOK PAGE ───────────────────────────────────────
function UploadBookPage({ currentUser, onOpenAuth }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultVisibility = searchParams.get("visibility") || "public";

  const [formData, setFormData] = useState({
    title: "",
    author: "",
    category: CATEGORIES[0],
    description: "",
    visibility: defaultVisibility
  });
  const [coverFile, setCoverFile] = useState(null);
  const [bookFile, setBookFile] = useState(null);
  const [previewCover, setPreviewCover] = useState("");
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  if (!currentUser) {
    return (
      <div className="page">
        <div className="empty-vault-card">
          <div className="empty-vault-icon"><Lock size={36} /></div>
          <h2>Authentication Required</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>Please sign in to upload manuscripts or catalog books.</p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In to Upload
          </button>
        </div>
      </div>
    );
  }

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return alert("Please enter a book title.");

    setUploading(true);
    setStatusMsg("Preparing upload signatures…");

    try {
      let finalCoverKey = "";
      let finalFileKey = "";
      let finalFileType = "";
      let finalFileSize = 0;

      // 1. Upload Cover Image if selected
      if (coverFile) {
        setStatusMsg("Uploading cover image to S3…");
        const { coverKey } = await api.uploadCover(coverFile);
        finalCoverKey = coverKey;
      }

      // 2. Upload Document File if selected
      if (bookFile) {
        setStatusMsg(`Uploading ${(bookFile.size / (1024 * 1024)).toFixed(1)}MB document to S3…`);
        const { fileKey, fileType, fileSizeBytes } = await api.uploadBookFile(bookFile);
        finalFileKey = fileKey;
        finalFileType = fileType;
        finalFileSize = fileSizeBytes;
      }

      // 3. Save Book Metadata via API Gateway & SQS
      setStatusMsg("Cataloging book into Obsidian Archive…");
      const payload = {
        title: formData.title.trim(),
        author: formData.author.trim(),
        category: formData.category,
        description: formData.description.trim(),
        visibility: formData.visibility,
        coverKey: finalCoverKey,
        fileKey: finalFileKey,
        fileType: finalFileType,
        fileSizeBytes: finalFileSize
      };

      await api.createBook(payload);
      setStatusMsg("Complete! Redirecting to archive…");

      setTimeout(() => {
        if (formData.visibility === "private") {
          navigate("/collection");
        } else {
          navigate("/library");
        }
      }, 1000);
    } catch (err) {
      alert(err.message || "Failed to upload and catalog book.");
      setUploading(false);
      setStatusMsg("");
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Catalog Volume</span>
        </div>
        <h1 className="page-title">Upload & Catalog a Book</h1>
        <p className="page-sub">Add a manuscript, PDF, or EPUB to your personal vault or share it with the world.</p>
      </div>

      <form onSubmit={handleSave}>
        <div className="editor-grid">
          {/* Metadata Card */}
          <div className="editor-card glass-panel">
            <div className="field">
              <label>Book Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Red Rising"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Author / Creator</label>
              <input
                type="text"
                placeholder="e.g. Pierce Brown"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
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
              <label>Privacy & Visibility</label>
              <select
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
              >
                <option value="public">Public (Visible to all scholars in library)</option>
                <option value="private">Private (Vaulted to your collection only)</option>
              </select>
            </div>
            <div className="field">
              <label>Synopsis / Description</label>
              <textarea
                rows={4}
                placeholder="Overview, notes, or abstract of the tome…"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          {/* S3 Media Uploads */}
          <div className="editor-card glass-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Cover Upload */}
            <div className="field">
              <label>Cover Image (Optional PNG/JPG)</label>
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
                  <img src={previewCover} style={{ maxHeight: 120, objectFit: "contain", borderRadius: 6 }} alt="Cover Preview" />
                ) : (
                  <div style={{ textAlign: "center", color: "#d2c5af" }}>
                    <UploadCloud size={32} style={{ margin: "0 auto 8px", color: "#ffcd5b" }} />
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Click to choose cover image</p>
                    <p style={{ fontSize: 11, color: "#9b8f7b", marginTop: 4 }}>PNG, JPG or WebP</p>
                  </div>
                )}
              </div>
            </div>

            {/* Document File Upload */}
            <div className="field">
              <label>Document File (Optional EPUB, PDF up to 100MB)</label>
              <div className="upload-zone" style={{ minHeight: 110 }}>
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
                  <p style={{ fontSize: 13, fontWeight: 600 }}>
                    {bookFile ? bookFile.name : "Click to select EPUB or PDF document"}
                  </p>
                  {bookFile && (
                    <p style={{ fontSize: 11, color: "#4ADE80", marginTop: 4, fontWeight: 700 }}>
                      {(bookFile.size / (1024 * 1024)).toFixed(2)} MB attached
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 32, display: "flex", gap: 14, alignItems: "center" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={uploading || !formData.title.trim()}
          >
            {uploading ? (
              <><Loader2 size={16} className="spin" /> {statusMsg || "Uploading…"}</>
            ) : (
              <><Save size={16} /> Save & Catalog Tome</>
            )}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={uploading}>
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── PAGE 5: BOOK DETAIL PAGE ─────────────────────────────────────────────────
function BookDetailPage({ currentUser, onOpenAuth }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchBook = async () => {
      setLoading(true);
      setError("");
      try {
        const b = await api.getBookById(bookId);
        setBook(b);
      } catch (err) {
        setError(err.message || "Failed to load book.");
      } finally {
        setLoading(false);
      }
    };
    fetchBook();
  }, [bookId]);

  if (loading) {
    return (
      <div className="loading-center">
        <Loader2 size={40} style={{ color: "#ffcd5b" }} className="spin" />
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="page">
        <div className="empty-vault-card">
          <div className="empty-vault-icon"><AlertTriangle size={36} /></div>
          <h2>Tome Unavailable</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>{error || "This volume could not be located in the archive."}</p>
          <button className="btn btn-secondary" onClick={() => navigate("/library")}>
            <ArrowLeft size={16} /> Back to Library
          </button>
        </div>
      </div>
    );
  }

  const isOwner = currentUser && currentUser.userId === book.ownerId;

  return (
    <motion.div className="page" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 32 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="detail-grid">
        <div className="cover-wrapper">
          {book.coverKey ? (
            <img
              src={`https://obsidian-covers-12345.s3.amazonaws.com/${book.coverKey}`}
              className="cover-img"
              alt={book.title}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#1e2025", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={72} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
            </div>
          )}
        </div>

        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">
              {book.category || "Uncategorized"} · {book.visibility === "private" ? "Private Vault" : "Public Archive"}
            </span>
          </div>
          <h1 className="detail-title">{book.title}</h1>
          <p className="detail-author">by {book.author || "Unknown Author"}</p>
          {book.description && (
            <p className="detail-description">{book.description}</p>
          )}

          <div className="detail-actions">
            {book.fileKey ? (
              <button className="btn btn-primary" onClick={() => alert(`Document (${book.fileType?.toUpperCase()}) will launch in online reader in upcoming update!`)}>
                <BookOpen size={16} /> Read Document ({book.fileType?.toUpperCase() || "FILE"})
              </button>
            ) : (
              <span style={{ fontSize: 13, color: "#9b8f7b", fontStyle: "italic" }}>
                Catalog reference entry (no document attached)
              </span>
            )}

            {isOwner && (
              <>
                <button className="btn btn-secondary" onClick={() => navigate(`/books/${book.bookId}/edit`)}>
                  <Pencil size={16} /> Edit
                </button>
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (window.confirm(`Delete "${book.title}" permanently from Obsidian Archive?`)) {
                      await api.deleteBook(book.bookId);
                      navigate("/library");
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
  );
}

// ── PAGE 6: EDIT BOOK PAGE ───────────────────────────────────────────────────
function EditBookPage({ currentUser }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchBook = async () => {
      try {
        const b = await api.getBookById(bookId);
        setFormData({
          title: b.title || "",
          author: b.author || "",
          category: b.category || CATEGORIES[0],
          description: b.description || "",
          visibility: b.visibility || "public"
        });
      } catch {
        navigate("/library");
      }
    };
    fetchBook();
  }, [bookId, navigate]);

  if (!formData) {
    return (
      <div className="loading-center">
        <Loader2 size={40} style={{ color: "#ffcd5b" }} className="spin" />
      </div>
    );
  }

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateBook(bookId, formData);
      navigate(`/books/${bookId}`);
    } catch (err) {
      alert(err.message || "Failed to update book.");
      setSaving(false);
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Modify Tome</span>
        </div>
        <h1 className="page-title">Edit: {formData.title}</h1>
      </div>

      <form onSubmit={handleUpdate} className="editor-card glass-panel" style={{ maxWidth: 640 }}>
        <div className="field">
          <label>Book Title</label>
          <input
            type="text"
            required
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Author</label>
          <input
            type="text"
            value={formData.author}
            onChange={(e) => setFormData({ ...formData, author: e.target.value })}
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
          <label>Privacy & Visibility</label>
          <select
            value={formData.visibility}
            onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
          >
            <option value="public">Public (Visible in public library)</option>
            <option value="private">Private (Vaulted to collection)</option>
          </select>
        </div>
        <div className="field">
          <label>Synopsis / Description</label>
          <textarea
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Updating…</> : <><Save size={16} /> Save Changes</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── PAGE 7: SETTINGS PAGE ────────────────────────────────────────────────────
function SettingsPage({ currentUser, onOpenAuth }) {
  const [profile, setProfile] = useState({ displayName: "", requestNotifications: true });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!currentUser) return;
      try {
        const p = await api.getProfile();
        if (p) setProfile({ displayName: p.displayName || "", requestNotifications: p.requestNotifications ?? true });
      } catch {
        // Fallback
      } finally {
        setLoaded(true);
      }
    };
    loadProfile();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="page">
        <div className="empty-vault-card">
          <div className="empty-vault-icon"><Lock size={36} /></div>
          <h2>Authentication Required</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14 }}>Sign in to manage your profile and notifications.</p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateProfile(profile);
      alert("Settings saved successfully!");
    } catch (err) {
      alert(err.message || "Failed to update settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Preferences</span>
        </div>
        <h1 className="page-title">Account Settings</h1>
        <p className="page-sub">Manage your public scholar profile and community notifications.</p>
      </div>

      <div className="editor-card glass-panel" style={{ maxWidth: 580 }}>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e2e6" }}>Request Notifications</div>
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
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <><Save size={16} /> Save Changes</>}
        </button>
      </div>
    </motion.div>
  );
}