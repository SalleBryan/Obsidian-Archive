import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  Shield, CheckCircle2, Circle, ExternalLink, Sparkles, Layers, Bookmark,
  Maximize2, Minimize2, Type, Sun, Moon, Coffee, ChevronDown, CheckCheck
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
  notifications: `${API_BASE}/notifications`,
};

// ── SUPER ADMIN CHECK ─────────────────────────────────────────────────────────
const SUPER_ADMIN_EMAILS = [
  "bryansalle17@gmail.com",
  "bryan@digisol.com"
];
export const checkIsSuperAdmin = (user) => {
  if (!user || !user.email) return false;
  const em = user.email.toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(em) || em.startsWith("bryansalle") || em.startsWith("bryan@");
};

// ── THEME CONSTANTS ───────────────────────────────────────────────────────────
const CATEGORIES = ["Fiction", "Sci-Fi", "Fantasy", "Non-Fiction", "Mystery", "Romance", "Biography", "Education", "Uncategorized"];

const CAT_COLORS = {
  "Fiction":       "#ffcd5b",
  "Sci-Fi":        "#b9c8de",
  "Fantasy":       "#ffc6c1",
  "Non-Fiction":   "#4ADE80",
  "Mystery":       "#c084fc",
  "Romance":       "#f472b6",
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
      if (res.status === 403) throw new Error("This book is in a private collection.");
      if (res.status === 404) throw new Error("Book not found.");
      throw new Error("Failed to load book details.");
    }
    return res.json();
  },
  getBookReadUrl: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.books}/${bookId}/read`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Unable to open reader for this book.");
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
    if (!res.ok) throw new Error("Failed to prepare cover upload");
    const { uploadUrl, coverKey, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!uploadRes.ok) throw new Error("Cover upload failed");
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
      throw new Error(err.error || "Failed to prepare document upload");
    }
    const { uploadUrl, fileKey } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: file
    });
    if (!uploadRes.ok) throw new Error("Book file upload failed");
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
  getNotifications: async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(EP.notifications, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return data.notifications || [];
    } catch {
      return [];
    }
  },
  markNotificationRead: async (notificationId) => {
    try {
      const headers = await getAuthHeader();
      await fetch(EP.notifications, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ operation: "MARK_NOTIFICATION_READ", notificationId })
      });
    } catch {}
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
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #0e1014;
    color: #e4e4e7;
    font-family: 'Plus Jakarta Sans', sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden;
  }
  a { color: inherit; text-decoration: none; }
  .shell { display: flex; min-height: 100vh; }
  
  /* SIDEBAR */
  .sidebar {
    width: 270px; background: #14161b; border-right: 1px solid rgba(255, 205, 91, 0.1);
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 28px 20px; position: fixed; top: 0; bottom: 0; left: 0; z-index: 40;
  }
  @media(max-width: 768px) { .sidebar { display: none; } }
  .sidebar-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; cursor: pointer; }
  .sidebar-brand-icon {
    width: 44px; height: 44px; border-radius: 12px; background: rgba(255,205,91,0.12);
    border: 1px solid rgba(255,205,91,0.3); display: flex; align-items: center; justify-content: center;
    color: #ffcd5b; box-shadow: 0 4px 20px rgba(255,205,91,0.2);
  }
  .sidebar-brand-title { font-size: 19px; font-weight: 800; color: #ffcd5b; letter-spacing: -0.02em; }
  .sidebar-brand-sub { font-size: 11px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
  
  .sidebar-nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 14px; padding: 12px 16px;
    border-radius: 10px; color: #d4d4d8; font-size: 14px; font-weight: 600;
    transition: all 0.2s; border: none; background: transparent; cursor: pointer; width: 100%; text-align: left;
  }
  .nav-item:hover { background: #1c1e24; color: #ffcd5b; }
  .nav-item.active { background: rgba(255,205,91,0.12); color: #ffcd5b; border-left: 3px solid #ffcd5b; }

  /* MAIN AREA */
  .main-area { flex: 1; margin-left: 270px; display: flex; flex-direction: column; min-height: 100vh; }
  @media(max-width: 768px) { .main-area { margin-left: 0; } }

  /* TOPBAR */
  .topbar {
    position: sticky; top: 0; z-index: 30; height: 72px;
    background: rgba(14,16,20,0.9); backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex; align-items: center; justify-content: space-between; padding: 0 40px;
  }
  @media(max-width: 768px) { .topbar { padding: 0 16px; } }
  .topbar-brand { display: none; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; color: #ffcd5b; cursor: pointer; }
  @media(max-width: 768px) { .topbar-brand { display: flex; } }
  .topbar-search { position: relative; flex: 1; max-width: 440px; margin: 0 24px; }
  .topbar-search input {
    width: 100%; height: 42px; padding: 0 16px 0 44px; background: #17191f;
    border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 999px; color: #e4e4e7;
    font-family: inherit; font-size: 14px; outline: none; transition: all 0.2s;
  }
  .topbar-search input:focus { border-color: #ffcd5b; box-shadow: 0 0 0 2px rgba(255,205,91,0.2); }
  .topbar-search-icon { position: absolute; left: 14px; top: 12px; color: #a1a1aa; }
  
  .topbar-actions { display: flex; align-items: center; gap: 14px; }
  .icon-btn {
    width: 40px; height: 40px; border-radius: 50%; border: none; background: transparent;
    color: #a1a1aa; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .icon-btn:hover { background: #1c1e24; color: #ffcd5b; }
  .badge-dot {
    position: absolute; top: 8px; right: 8px; width: 8px; height: 8px;
    background: #ef4444; border-radius: 50%; border: 2px solid #0e1014;
  }

  /* User Pill on Navbar */
  .user-nav-pill {
    display: flex; align-items: center; gap: 10px; padding: 6px 14px 6px 6px;
    background: #17191f; border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 999px;
    cursor: pointer; transition: all 0.2s; user-select: none;
  }
  .user-nav-pill:hover { border-color: #ffcd5b; background: #1f2128; }
  .user-nav-avatar {
    width: 32px; height: 32px; border-radius: 50%; background: #ffcd5b; color: #1a1300;
    font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center;
  }
  .user-nav-name { font-size: 13px; font-weight: 700; color: #e4e4e7; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  
  /* Super Admin Badge */
  .admin-badge {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
    background: rgba(255,205,91,0.18); border: 1px solid #ffcd5b; border-radius: 999px;
    font-size: 10px; font-weight: 800; color: #ffcd5b; text-transform: uppercase; letter-spacing: 0.08em;
  }

  /* PAGE LAYOUT */
  .page { padding: 36px 40px 100px; max-width: 1400px; width: 100%; }
  @media(max-width: 768px) { .page { padding: 20px 16px 100px; } }
  .page-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .eyebrow-line { width: 40px; height: 3px; background: #ffcd5b; border-radius: 999px; }
  .eyebrow-text { font-size: 11px; font-weight: 800; color: #ffcd5b; text-transform: uppercase; letter-spacing: 0.12em; }
  .page-title { font-size: 38px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.15; }
  .page-sub { font-size: 14px; color: #a1a1aa; margin-top: 6px; }
  .page-header { margin-bottom: 28px; }

  /* TOOLBAR & CHIPS */
  .toolbar { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; align-items: center; }
  .cat-chip {
    padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all 0.15s; border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent; color: #a1a1aa; white-space: nowrap; font-family: inherit;
  }
  .cat-chip:hover { border-color: #ffcd5b; color: #e4e4e7; }
  .cat-chip.active { background: rgba(255,205,91,0.14); border-color: #ffcd5b; color: #ffcd5b; font-weight: 700; }

  /* Toggle Pills */
  .view-toggle {
    display: inline-flex; padding: 4px; background: #17191f; border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 24px;
  }
  .toggle-btn {
    padding: 8px 18px; border-radius: 999px; font-size: 13px; font-weight: 700;
    border: none; background: transparent; color: #a1a1aa; cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; gap: 6px; font-family: inherit;
  }
  .toggle-btn.active { background: #ffcd5b; color: #14161b; shadow: 0 2px 10px rgba(255,205,91,0.25); }

  /* BOOK GRID & CARDS */
  .book-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); gap: 24px; }
  .book-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer; aspect-ratio: 2/3;
    background: #17191f; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
  }
  .book-card:hover { transform: translateY(-6px); box-shadow: 0 20px 40px rgba(0,0,0,0.7); border-color: rgba(255,205,91,0.4); }
  .book-card-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 10; }
  .book-card-badge {
    position: absolute; top: 10px; right: 10px; z-index: 10; padding: 3px 8px; border-radius: 999px;
    background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); font-size: 10px; font-weight: 700;
    display: flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.12);
  }
  .book-card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s; display: block; }
  .book-card:hover .book-card-img { transform: scale(1.05); }
  .book-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(14,16,20,0.95) 0%, rgba(14,16,20,0.3) 60%, transparent 100%);
    display: flex; flex-direction: column; justify-content: flex-end; padding: 14px;
  }
  .book-title-text { font-size: 15px; font-weight: 700; color: #fff; line-height: 1.25; }
  .book-author-text { font-size: 12px; color: rgba(255,255,255,0.65); margin-top: 2px; }
  .book-series-tag { font-size: 10px; color: #ffcd5b; font-weight: 700; margin-top: 4px; }

  /* Series Section */
  .series-section { margin-bottom: 40px; }
  .series-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; background: #17191f; border: 1px solid rgba(255, 205, 91, 0.2);
    border-radius: 12px; margin-bottom: 20px;
  }
  .series-title { font-size: 18px; font-weight: 800; color: #ffcd5b; display: flex; align-items: center; gap: 8px; }
  .series-count { font-size: 12px; color: #a1a1aa; font-weight: 600; }

  /* BUTTONS */
  .btn {
    display: inline-flex; align-items: center; gap: 8px; height: 42px; padding: 0 20px;
    border-radius: 999px; font-family: inherit; font-size: 13px; font-weight: 700;
    cursor: pointer; transition: all 0.2s; border: none; text-decoration: none;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #ffcd5b; color: #14161b; box-shadow: 0 4px 14px rgba(255,205,91,0.25); }
  .btn-primary:hover:not(:disabled) { background: #ffd875; transform: translateY(-1px); }
  .btn-danger { background: transparent; color: #f87171; border: 1px solid rgba(248,113,113,0.3); }
  .btn-danger:hover:not(:disabled) { background: rgba(248,113,113,0.12); border-color: #f87171; }
  .btn-secondary { background: #17191f; color: #e4e4e7; border: 1px solid rgba(255,255,255,0.12); }
  .btn-secondary:hover:not(:disabled) { background: #22252e; border-color: #ffcd5b; }
  .btn-google {
    background: #ffffff; color: #1f1f1f; border: 1px solid #dadce0; width: 100%;
    justify-content: center; margin-bottom: 16px; font-weight: 600;
  }
  .btn-google:hover:not(:disabled) { background: #f8f9fa; border-color: #c6c6c6; }

  /* GLASS PANEL & CARDS */
  .glass-panel {
    background: rgba(23,25,31,0.85); backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  }
  .detail-grid { display: grid; grid-template-columns: 280px 1fr; gap: 44px; align-items: start; }
  @media(max-width: 768px) { .detail-grid { grid-template-columns: 1fr; gap: 24px; } }
  .cover-wrapper {
    width: 100%; aspect-ratio: 2/3; border-radius: 12px; overflow: hidden;
    background: #17191f; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 60px rgba(0,0,0,0.7); position: relative;
  }
  .cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .detail-title { font-size: 36px; font-weight: 800; line-height: 1.15; margin-bottom: 6px; }
  .detail-author { font-size: 17px; color: #ffcd5b; margin-bottom: 20px; font-weight: 600; }
  .detail-description { font-size: 15px; line-height: 1.8; color: #d4d4d8; margin-bottom: 28px; max-width: 680px; }
  .detail-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

  /* EDITOR / FORMS */
  .editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  @media(max-width: 768px) { .editor-grid { grid-template-columns: 1fr; } }
  .editor-card { border-radius: 14px; padding: 28px; }
  .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
  .field label { font-size: 11px; font-weight: 700; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.08em; }
  .field input, .field select, .field textarea {
    background: #111317; border: 1px solid rgba(255, 255, 255, 0.12); padding: 12px 16px; border-radius: 8px;
    color: #e4e4e7; font-family: inherit; font-size: 14px; width: 100%; outline: none; transition: all 0.2s;
  }
  .field input:focus, .field select:focus, .field textarea:focus { border-color: #ffcd5b; box-shadow: 0 0 0 2px rgba(255,205,91,0.15); }
  .field select option { background: #17191f; }
  .upload-zone {
    border: 2px dashed rgba(255, 255, 255, 0.18); border-radius: 10px; min-height: 130px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; background: #111317; padding: 16px;
  }
  .upload-zone:hover { border-color: #ffcd5b; background: rgba(255,205,91,0.03); }
  .upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }

  /* MODALS & DROPDOWNS */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
  }
  .modal-box {
    background: #17191f; border: 1px solid rgba(255,205,91,0.25); border-radius: 16px;
    width: 100%; max-width: 440px; padding: 32px; box-shadow: 0 24px 64px rgba(0,0,0,0.9);
  }

  /* Notifications Dropdown */
  .notif-dropdown {
    position: absolute; top: 60px; right: 240px; width: 340px; max-height: 420px;
    background: #17191f; border: 1px solid rgba(255,205,91,0.25); border-radius: 14px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.8); z-index: 50; overflow-y: auto; padding: 12px;
  }
  .notif-item {
    padding: 12px; border-radius: 8px; background: #111317; border: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 8px; cursor: pointer; transition: all 0.2s;
  }
  .notif-item:hover { border-color: #ffcd5b; background: #1c1e24; }
  .notif-item.unread { border-left: 3px solid #ffcd5b; }

  /* User Menu Dropdown */
  .user-menu-dropdown {
    position: absolute; top: 60px; right: 40px; width: 220px;
    background: #17191f; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.8); z-index: 50; padding: 8px;
  }
  .menu-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 600; color: #e4e4e7; cursor: pointer; transition: all 0.15s;
    border: none; background: transparent; width: 100%; text-align: left;
  }
  .menu-item:hover { background: #22252e; color: #ffcd5b; }

  /* PROGRESS BAR */
  .progress-container { width: 100%; height: 8px; background: #111317; border-radius: 999px; overflow: hidden; margin: 16px 0; }
  .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #ffcd5b, #4ADE80); transition: width 0.3s ease; }

  /* ONLINE READER THEMES */
  .reader-shell { min-height: 100vh; display: flex; flex-direction: column; }
  .reader-theme-dark { background-color: #111317; color: #d4d4d8; }
  .reader-theme-sepia { background-color: #fbf0d9; color: #433422; }
  .reader-theme-light { background-color: #ffffff; color: #18181b; }

  .reader-header {
    height: 60px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; border-bottom: 1px solid rgba(128,128,128,0.2);
  }
  .reader-body { flex: 1; display: flex; justify-content: center; padding: 32px 20px; overflow-y: auto; }
  .reader-content { max-width: 780px; width: 100%; font-family: 'Lora', serif; line-height: 1.9; }

  /* Policy Checklist */
  .policy-checklist {
    background: #111317; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
    padding: 12px 14px; margin: 12px 0 16px; display: flex; flex-direction: column; gap: 6px;
  }
  .policy-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #a1a1aa; }
  .policy-item.valid { color: #4ADE80; font-weight: 600; }

  /* MOBILE NAV */
  .mobile-nav {
    display: none; position: fixed; bottom: 0; left: 0; right: 0;
    background: #14161b; border-top: 1px solid rgba(255,255,255,0.1); z-index: 50;
  }
  @media(max-width: 768px) { .mobile-nav { display: flex; justify-content: space-around; height: 64px; align-items: center; } }
  .mobile-nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: #a1a1aa; font-size: 10px; font-weight: 600; cursor: pointer; flex: 1;
    padding: 8px 0; border: none; background: transparent; font-family: inherit; text-decoration: none;
  }
  .mobile-nav-item.active { color: #ffcd5b; }
`;

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
          <Route path="/read/:bookId" element={<OnlineReaderPage currentUser={currentUser} />} />
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
          {/* STICKY TOPBAR */}
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

                  {/* UPLOAD BUTTON */}
                  <button
                    className="btn btn-primary"
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
                    <ChevronDown size={14} color="#a1a1aa" />
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
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{currentUser.name}</div>
                  <div style={{ fontSize: 11, color: "#a1a1aa" }}>{currentUser.email}</div>
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
              element={<BookDetailPage currentUser={currentUser} onOpenAuth={openAuth} isSuperAdmin={isSuperAdmin} />}
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
            <span>Collection</span>
          </Link>
          <Link to="/requests" className={`mobile-nav-item ${location.pathname === "/requests" ? "active" : ""}`}>
            <MessageSquarePlus size={18} />
            <span>Requests</span>
          </Link>
          {currentUser && (
            <Link to="/profile" className={`mobile-nav-item ${location.pathname === "/profile" ? "active" : ""}`}>
              <User size={18} />
              <span>Profile</span>
            </Link>
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
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
                    <span style={{ fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.08em" }}>or with email</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
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

// ── PAGE 1: PUBLIC LIBRARY ───────────────────────────────────────────────────
function PublicLibraryPage({ searchQuery, currentUser, onOpenAuth, isSuperAdmin }) {
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

  useEffect(() => { loadBooks(); }, []);

  const filteredBooks = books.filter((b) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.seriesName || "").toLowerCase().includes(q);
    const matchesCat = filterCat === "All" || b.category === filterCat;
    return matchesSearch && matchesCat;
  });

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Community Bookshelf</span>
          </div>
          <div className="page-title">Public Library</div>
          <div className="page-sub">
            {books.length} {books.length === 1 ? "book" : "books"} shared by readers around the world
          </div>
        </div>
        <button className="icon-btn" onClick={loadBooks} title="Refresh Books">
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
        <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>
      ) : filteredBooks.length === 0 ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 540, margin: "40px auto" }}>
          <Globe size={48} style={{ color: "#ffcd5b", margin: "0 auto 16px", opacity: 0.6 }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>The Public Library is Empty</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            No books have been shared in this category yet. Be the first reader to contribute a volume to the community!
          </p>
          <button className="btn btn-primary" onClick={() => currentUser ? navigate("/upload?visibility=public") : onOpenAuth("signin")}>
            <Plus size={16} /> Contribute a Book
          </button>
        </div>
      ) : (
        <div className="book-grid">
          {filteredBooks.map((book) => (
            <div
              key={book.bookId}
              className="book-card"
              onClick={() => navigate(`/books/${book.bookId}`)}
            >
              <div className="book-card-top-bar" style={{ background: getCatColor(book.category) }} />
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
                <div style={{ width: "100%", height: "100%", background: "#17191f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
                </div>
              )}

              <div className="book-overlay">
                <div className="book-title-text">{book.title}</div>
                <div className="book-author-text">{book.author || "Unknown Author"}</div>
                {book.seriesName && (
                  <div className="book-series-tag">
                    {book.seriesName} {book.seriesOrder ? `#${book.seriesOrder}` : ""}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── PAGE 2: MY COLLECTION (WITH SERIES GROUPING) ─────────────────────────────
function MyCollectionPage({ searchQuery, currentUser, onOpenAuth, isSuperAdmin }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("all"); // "all" | "series"

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
    if (currentUser) loadBooks();
    else setLoading(false);
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="page">
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <Lock size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>Sign In to Access Your Bookshelf</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8, marginBottom: 20 }}>
            Your personal collection is private and encrypted to your account.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const filteredBooks = books.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.seriesName || "").toLowerCase().includes(q)
    );
  });

  // Group books by Series
  const seriesGroups = useMemo(() => {
    const groups = {};
    const standalones = [];

    filteredBooks.forEach((book) => {
      if (book.seriesName && book.seriesName.trim()) {
        const sName = book.seriesName.trim();
        if (!groups[sName]) groups[sName] = [];
        groups[sName].push(book);
      } else {
        standalones.push(book);
      }
    });

    // Sort books within each series by seriesOrder
    Object.keys(groups).forEach((sName) => {
      groups[sName].sort((a, b) => (Number(a.seriesOrder) || 999) - (Number(b.seriesOrder) || 999));
    });

    return { groups, standalones };
  }, [filteredBooks]);

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Personal Sanctuary</span>
          </div>
          <div className="page-title">My Collection</div>
          <div className="page-sub">
            {books.length} {books.length === 1 ? "book" : "books"} on your bookshelf
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* VIEW TOGGLE */}
          <div className="view-toggle">
            <button
              className={`toggle-btn ${viewMode === "all" ? "active" : ""}`}
              onClick={() => setViewMode("all")}
            >
              <BookOpen size={14} /> All Books
            </button>
            <button
              className={`toggle-btn ${viewMode === "series" ? "active" : ""}`}
              onClick={() => setViewMode("series")}
            >
              <Layers size={14} /> By Series
            </button>
          </div>
          <button className="icon-btn" onClick={loadBooks} title="Refresh Collection">
            <RefreshCw size={18} className={loading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>
      ) : filteredBooks.length === 0 ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 540, margin: "40px auto" }}>
          <Library size={48} style={{ color: "#ffcd5b", margin: "0 auto 16px", opacity: 0.6 }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Your Collection is Empty</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            Keep your favorite novels, private manuscripts, or entire series neatly organized here.
          </p>
          <button className="btn btn-primary" onClick={() => navigate("/upload?visibility=private")}>
            <Plus size={16} /> Add to Collection
          </button>
        </div>
      ) : viewMode === "series" ? (
        /* SERIES GROUPED VIEW */
        <div>
          {Object.entries(seriesGroups.groups).map(([sName, sBooks]) => (
            <div key={sName} className="series-section">
              <div className="series-header">
                <div className="series-title">
                  <Layers size={20} /> {sName}
                </div>
                <div className="series-count">{sBooks.length} {sBooks.length === 1 ? "Volume" : "Volumes"}</div>
              </div>
              <div className="book-grid">
                {sBooks.map((book) => (
                  <BookCardItem key={book.bookId} book={book} onSelect={() => navigate(`/books/${book.bookId}`)} />
                ))}
              </div>
            </div>
          ))}

          {seriesGroups.standalones.length > 0 && (
            <div className="series-section">
              <div className="series-header">
                <div className="series-title">
                  <BookOpen size={20} /> Standalone Books
                </div>
                <div className="series-count">{seriesGroups.standalones.length} {seriesGroups.standalones.length === 1 ? "Book" : "Books"}</div>
              </div>
              <div className="book-grid">
                {seriesGroups.standalones.map((book) => (
                  <BookCardItem key={book.bookId} book={book} onSelect={() => navigate(`/books/${book.bookId}`)} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ALL BOOKS FLAT GRID */
        <div className="book-grid">
          {filteredBooks.map((book) => (
            <BookCardItem key={book.bookId} book={book} onSelect={() => navigate(`/books/${book.bookId}`)} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function BookCardItem({ book, onSelect }) {
  return (
    <div className="book-card" onClick={onSelect}>
      <div className="book-card-top-bar" style={{ background: getCatColor(book.category) }} />
      <div className="book-card-badge">
        {book.visibility === "private" ? (
          <><Lock size={10} color="#f87171" /> Private</>
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
        <div style={{ width: "100%", height: "100%", background: "#17191f", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
        </div>
      )}

      <div className="book-overlay">
        <div className="book-title-text">{book.title}</div>
        <div className="book-author-text">{book.author || "Unknown Author"}</div>
        {book.seriesName && (
          <div className="book-series-tag">
            {book.seriesName} {book.seriesOrder ? `#${book.seriesOrder}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PAGE 3: BOOK REQUESTS ────────────────────────────────────────────────────
function RequestsBoardPage({ currentUser, onOpenAuth, isSuperAdmin }) {
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

  useEffect(() => { loadRequests(); }, []);

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
      alert(err.message || "Error submitting request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Reader Wishlist</span>
          </div>
          <div className="page-title">Book Requests</div>
          <div className="page-sub">Request books you're looking for or upload a requested book to help others!</div>
        </div>
        <button className="btn btn-primary" onClick={() => currentUser ? setModalOpen(true) : onOpenAuth("signin")}>
          <Plus size={16} /> Request a Book
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>
      ) : requests.length === 0 ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <MessageSquarePlus size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>No Active Requests</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8 }}>Be the first book lover to submit a request!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 20 }}>
          {requests.map((r) => (
            <div key={r.requestId} className="editor-card glass-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800 }}>{r.title}</h3>
                  <p style={{ fontSize: 13, color: "#ffcd5b", marginTop: 2 }}>by {r.author || "Unknown"}</p>
                </div>
                <span style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: r.status === "open" ? "rgba(255,205,91,0.15)" : "rgba(74,222,128,0.15)",
                  color: r.status === "open" ? "#ffcd5b" : "#4ADE80"
                }}>
                  {r.status === "open" ? "Looking for Book" : "Fulfilled"}
                </span>
              </div>
              {r.description && (
                <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.5 }}>
                  {r.description}
                </p>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                <span style={{ fontSize: 11, color: "#71717a" }}>
                  Requested by {r.requesterName || "Reader"}
                </span>
                {(currentUser && (currentUser.userId === r.requesterId || isSuperAdmin)) && (
                  <button
                    className="btn btn-danger"
                    style={{ height: 30, padding: "0 10px", fontSize: 11 }}
                    onClick={async () => {
                      await api.deleteRequest(r.requestId);
                      loadRequests();
                    }}
                  >
                    <Trash2 size={12} /> Remove
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
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#ffcd5b" }}>Request a Book</h2>
                <button className="icon-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateRequest}>
                <div className="field">
                  <label>Book Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Red Rising"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Author (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Pierce Brown"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Notes / Format Preference</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Looking for EPUB or PDF to read this weekend…"
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

// ── PAGE 4: UPLOAD BOOK (WITH ANIMATED PROGRESS BAR & SERIES) ────────────────
function UploadBookPage({ currentUser, onOpenAuth }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultVisibility = searchParams.get("visibility") || "public";

  const [formData, setFormData] = useState({
    title: "",
    author: "",
    category: CATEGORIES[0],
    description: "",
    visibility: defaultVisibility,
    isSeries: false,
    seriesName: "",
    seriesOrder: 1
  });
  const [coverFile, setCoverFile] = useState(null);
  const [bookFile, setBookFile] = useState(null);
  const [previewCover, setPreviewCover] = useState("");

  // Upload Progress State (No Technical Jargon)
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");

  if (!currentUser) {
    return (
      <div className="page">
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <Lock size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>Sign In to Upload Books</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8, marginBottom: 20 }}>
            Sign in to upload manuscripts to your collection or the public library.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) return alert("Please enter a book title.");

    setUploading(true);
    setProgress(15);
    setStatusText("Preparing book for upload…");

    try {
      let finalCoverKey = "";
      let finalFileKey = "";
      let finalFileType = "";
      let finalFileSize = 0;

      // 1. Upload Cover
      if (coverFile) {
        setProgress(35);
        setStatusText("Uploading cover image…");
        const { coverKey } = await api.uploadCover(coverFile);
        finalCoverKey = coverKey;
      }

      // 2. Upload Document
      if (bookFile) {
        setProgress(65);
        setStatusText(`Uploading book document (${(bookFile.size / (1024 * 1024)).toFixed(1)} MB)…`);
        const { fileKey, fileType, fileSizeBytes } = await api.uploadBookFile(bookFile);
        finalFileKey = fileKey;
        finalFileType = fileType;
        finalFileSize = fileSizeBytes;
      }

      // 3. Catalog to Library
      setProgress(90);
      setStatusText("Adding book to your library…");

      const payload = {
        title: formData.title.trim(),
        author: formData.author.trim(),
        category: formData.category,
        description: formData.description.trim(),
        visibility: formData.visibility,
        coverKey: finalCoverKey,
        fileKey: finalFileKey,
        fileType: finalFileType,
        fileSizeBytes: finalFileSize,
        seriesName: formData.isSeries ? formData.seriesName.trim() : "",
        seriesOrder: formData.isSeries ? Number(formData.seriesOrder) : null
      };

      await api.createBook(payload);

      setProgress(100);
      setStatusText("Book added successfully!");

      setTimeout(() => {
        if (formData.visibility === "private") navigate("/collection");
        else navigate("/library");
      }, 800);
    } catch (err) {
      alert(err.message || "Failed to upload book.");
      setUploading(false);
      setProgress(0);
      setStatusText("");
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Add to Bookshelf</span>
        </div>
        <h1 className="page-title">Upload a Book</h1>
        <p className="page-sub">Add a document or standalone book to your collection or share it with the community.</p>
      </div>

      {uploading && (
        <div className="editor-card glass-panel" style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#ffcd5b" }}>{statusText}</span>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{progress}%</span>
          </div>
          <div className="progress-container">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="editor-grid">
          {/* Metadata */}
          <div className="editor-card glass-panel">
            <div className="field">
              <label>Book Title *</label>
              <input
                type="text"
                required
                placeholder="e.g. Golden Son"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                disabled={uploading}
              />
            </div>
            <div className="field">
              <label>Author</label>
              <input
                type="text"
                placeholder="e.g. Pierce Brown"
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                disabled={uploading}
              />
            </div>
            <div className="field">
              <label>Genre / Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                disabled={uploading}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Privacy</label>
              <select
                value={formData.visibility}
                onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                disabled={uploading}
              >
                <option value="public">Public (Visible to everyone in library)</option>
                <option value="private">Private (Vaulted to your collection only)</option>
              </select>
            </div>

            {/* SERIES TOGGLE */}
            <div style={{ background: "#111317", padding: "14px 16px", borderRadius: 8, margin: "16px 0", border: "1px solid rgba(255,255,255,0.08)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                <input
                  type="checkbox"
                  style={{ width: 18, height: 18, accentColor: "#ffcd5b", cursor: "pointer" }}
                  checked={formData.isSeries}
                  onChange={(e) => setFormData({ ...formData, isSeries: e.target.checked })}
                  disabled={uploading}
                />
                Part of a Book Series?
              </label>

              {formData.isSeries && (
                <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Series Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Red Rising Saga"
                      value={formData.seriesName}
                      onChange={(e) => setFormData({ ...formData, seriesName: e.target.value })}
                      disabled={uploading}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Book #</label>
                    <input
                      type="number"
                      min={1}
                      value={formData.seriesOrder}
                      onChange={(e) => setFormData({ ...formData, seriesOrder: e.target.value })}
                      disabled={uploading}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="field">
              <label>Synopsis</label>
              <textarea
                rows={3}
                placeholder="What is this book about?…"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={uploading}
              />
            </div>
          </div>

          {/* Files */}
          <div className="editor-card glass-panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="field">
              <label>Cover Image (Optional)</label>
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
                  disabled={uploading}
                />
                {previewCover ? (
                  <img src={previewCover} style={{ maxHeight: 130, objectFit: "contain", borderRadius: 8 }} alt="Preview" />
                ) : (
                  <div style={{ textAlign: "center", color: "#a1a1aa" }}>
                    <UploadCloud size={32} style={{ margin: "0 auto 8px", color: "#ffcd5b" }} />
                    <p style={{ fontSize: 13, fontWeight: 700 }}>Choose cover image</p>
                    <p style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>PNG, JPG or WebP</p>
                  </div>
                )}
              </div>
            </div>

            <div className="field">
              <label>Book Document (EPUB or PDF up to 100MB)</label>
              <div className="upload-zone" style={{ minHeight: 120 }}>
                <input
                  type="file"
                  accept=".epub,.pdf,.mobi,.txt"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) setBookFile(f);
                  }}
                  disabled={uploading}
                />
                <div style={{ textAlign: "center", color: "#a1a1aa" }}>
                  <FileText size={32} style={{ margin: "0 auto 8px", color: "#ffcd5b" }} />
                  <p style={{ fontSize: 13, fontWeight: 700 }}>
                    {bookFile ? bookFile.name : "Select EPUB or PDF document"}
                  </p>
                  {bookFile && (
                    <p style={{ fontSize: 11, color: "#4ADE80", marginTop: 4, fontWeight: 700 }}>
                      {(bookFile.size / (1024 * 1024)).toFixed(2)} MB selected
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 28, display: "flex", gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={uploading || !formData.title.trim()}>
            {uploading ? <><Loader2 size={16} className="spin" /> Uploading…</> : <><Save size={16} /> Save Book</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={uploading}>
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── PAGE 5: BOOK DETAIL (WITH OWNER/SUPER ADMIN PERMISSIONS) ─────────────────
function BookDetailPage({ currentUser, onOpenAuth, isSuperAdmin }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchBook = async () => {
      setLoading(true);
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
    return <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>;
  }

  if (error || !book) {
    return (
      <div className="page">
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <AlertTriangle size={44} style={{ color: "#f87171", margin: "0 auto 16px" }} />
          <h2>Book Unavailable</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8, marginBottom: 20 }}>{error}</p>
          <button className="btn btn-secondary" onClick={() => navigate("/library")}>
            <ArrowLeft size={16} /> Back to Library
          </button>
        </div>
      </div>
    );
  }

  // Permission: Owner or Super Admin can edit/delete
  const canModify = currentUser && (currentUser.userId === book.ownerId || isSuperAdmin);

  return (
    <motion.div className="page" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 28 }}>
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
            <div style={{ width: "100%", height: "100%", background: "#17191f", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={64} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
            </div>
          )}
        </div>

        <div>
          <div className="page-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">
              {book.category || "General"} · {book.visibility === "private" ? "Private Collection" : "Public Library"}
            </span>
          </div>

          <h1 className="detail-title">{book.title}</h1>
          <p className="detail-author">by {book.author || "Unknown Author"}</p>

          {book.seriesName && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,205,91,0.15)", borderRadius: 999, color: "#ffcd5b", fontSize: 12, fontWeight: 700, marginBottom: 20 }}>
              <Layers size={14} /> Part of {book.seriesName} {book.seriesOrder ? `(Book #${book.seriesOrder})` : ""}
            </div>
          )}

          {book.description && <p className="detail-description">{book.description}</p>}

          <div className="detail-actions">
            {book.fileKey ? (
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/read/${book.bookId}`)}
              >
                <BookOpen size={16} /> Read Online ({book.fileType?.toUpperCase() || "DOCUMENT"})
              </button>
            ) : (
              <span style={{ fontSize: 13, color: "#71717a", fontStyle: "italic" }}>
                Catalog reference only (no document attached)
              </span>
            )}

            {canModify && (
              <>
                <button className="btn btn-secondary" onClick={() => navigate(`/books/${book.bookId}/edit`)}>
                  <Pencil size={15} /> Edit Book
                </button>
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (window.confirm(`Delete "${book.title}" from Obsidian Archive?`)) {
                      await api.deleteBook(book.bookId);
                      navigate("/library");
                    }
                  }}
                >
                  <Trash2 size={15} /> Delete Book
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── PAGE 6: EDIT BOOK ────────────────────────────────────────────────────────
function EditBookPage({ currentUser, isSuperAdmin }) {
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
          visibility: b.visibility || "public",
          seriesName: b.seriesName || "",
          seriesOrder: b.seriesOrder || ""
        });
      } catch {
        navigate("/library");
      }
    };
    fetchBook();
  }, [bookId, navigate]);

  if (!formData) {
    return <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>;
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
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: 28 }}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Modify Entry</span>
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
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Privacy</label>
          <select
            value={formData.visibility}
            onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
          >
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Series Title (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Red Rising Saga"
              value={formData.seriesName}
              onChange={(e) => setFormData({ ...formData, seriesName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Book #</label>
            <input
              type="number"
              placeholder="1"
              value={formData.seriesOrder}
              onChange={(e) => setFormData({ ...formData, seriesOrder: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label>Synopsis</label>
          <textarea
            rows={4}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Saving…</> : <><Save size={16} /> Save Changes</>}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)} disabled={saving}>
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ── PAGE 7: IN-BROWSER ONLINE BOOK READER ───────────────────────────────────
function OnlineReaderPage({ currentUser }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [streamInfo, setStreamInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reader Settings
  const [theme, setTheme] = useState("dark"); // "dark" | "sepia" | "light"
  const [fontSize, setFontSize] = useState(18);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const fetchReadUrl = async () => {
      setLoading(true);
      try {
        const info = await api.getBookReadUrl(bookId);
        setStreamInfo(info);
      } catch (err) {
        setError(err.message || "Failed to open document.");
      } finally {
        setLoading(false);
      }
    };
    fetchReadUrl();
  }, [bookId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (loading) {
    return (
      <div className="reader-shell reader-theme-dark" style={{ alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={44} color="#ffcd5b" className="spin" />
        <p style={{ marginTop: 16, fontSize: 14, fontWeight: 700 }}>Opening reader…</p>
      </div>
    );
  }

  if (error || !streamInfo) {
    return (
      <div className="reader-shell reader-theme-dark" style={{ alignItems: "center", justifyContent: "center", padding: 20 }}>
        <AlertTriangle size={44} style={{ color: "#f87171", marginBottom: 12 }} />
        <h2>Cannot Open Book</h2>
        <p style={{ color: "#a1a1aa", marginTop: 6, marginBottom: 20 }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate(`/books/${bookId}`)}>
          <ArrowLeft size={16} /> Back to Book
        </button>
      </div>
    );
  }

  const isPdf = (streamInfo.fileType || "").toLowerCase() === "pdf";

  return (
    <div className={`reader-shell reader-theme-${theme}`}>
      {/* READER HEADER */}
      <header className="reader-header">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="icon-btn" onClick={() => navigate(`/books/${bookId}`)} title="Exit Reader">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{streamInfo.title}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{streamInfo.author || "Reader Mode"}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* THEME TOGGLES */}
          <button
            className="icon-btn"
            style={{ opacity: theme === "dark" ? 1 : 0.4 }}
            onClick={() => setTheme("dark")}
            title="Dark Theme"
          >
            <Moon size={16} />
          </button>
          <button
            className="icon-btn"
            style={{ opacity: theme === "sepia" ? 1 : 0.4 }}
            onClick={() => setTheme("sepia")}
            title="Sepia Theme"
          >
            <Coffee size={16} />
          </button>
          <button
            className="icon-btn"
            style={{ opacity: theme === "light" ? 1 : 0.4 }}
            onClick={() => setTheme("light")}
            title="Light Theme"
          >
            <Sun size={16} />
          </button>

          {!isPdf && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
              <button className="icon-btn" onClick={() => setFontSize(Math.max(14, fontSize - 2))} title="Smaller Font">
                <span style={{ fontSize: 12, fontWeight: 800 }}>A-</span>
              </button>
              <button className="icon-btn" onClick={() => setFontSize(Math.min(28, fontSize + 2))} title="Larger Font">
                <span style={{ fontSize: 15, fontWeight: 800 }}>A+</span>
              </button>
            </div>
          )}

          <button className="icon-btn" onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* READER CONTENT BODY */}
      <div className="reader-body">
        {isPdf ? (
          /* PDF VIEWER EMBED */
          <iframe
            src={streamInfo.readUrl}
            style={{ width: "100%", height: "calc(100vh - 80px)", border: "none", borderRadius: 8 }}
            title={streamInfo.title}
          />
        ) : (
          /* EPUB / DOCUMENT READER VIEW */
          <div className="reader-content" style={{ fontSize: `${fontSize}px` }}>
            <div style={{ textAlign: "center", marginBottom: 40, paddingBottom: 24, borderBottom: "1px solid rgba(128,128,128,0.2)" }}>
              <h1 style={{ fontSize: "2.2em", fontWeight: 700, marginBottom: 8 }}>{streamInfo.title}</h1>
              <p style={{ fontSize: "1em", opacity: 0.75 }}>by {streamInfo.author || "Unknown"}</p>
            </div>
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <p style={{ lineHeight: 1.8, marginBottom: 24 }}>
                Document loaded into secure reading mode.
              </p>
              <a
                href={streamInfo.readUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ display: "inline-flex" }}
              >
                <ExternalLink size={16} /> Open in Dedicated Document Viewer
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── PAGE 8: USER PROFILE PAGE ────────────────────────────────────────────────
function UserProfilePage({ currentUser, onOpenAuth, isSuperAdmin }) {
  const [profile, setProfile] = useState({ displayName: "", bio: "", requestNotifications: true });
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!currentUser) return;
      try {
        const p = await api.getProfile();
        if (p) setProfile({
          displayName: p.displayName || currentUser.name,
          bio: p.bio || "",
          requestNotifications: p.requestNotifications ?? true
        });
      } catch {}
    };
    loadProfile();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="page">
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <User size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>Sign In to View Profile</h2>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      await api.updateProfile(profile);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      alert(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="page" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Reader Identity</span>
        </div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-sub">Customize your reader persona and notifications.</p>
      </div>

      <div className="editor-card glass-panel" style={{ maxWidth: 600 }}>
        {/* AVATAR BANNER */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ffcd5b", color: "#14161b", fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{currentUser.name}</div>
            <div style={{ fontSize: 13, color: "#a1a1aa" }}>{currentUser.email}</div>
            {isSuperAdmin && (
              <div style={{ marginTop: 6 }}>
                <span className="admin-badge"><Shield size={11} /> Super Admin</span>
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label>Display Name</label>
          <input
            type="text"
            value={profile.displayName}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Reader Bio / Favorite Genres</label>
          <textarea
            rows={3}
            placeholder="e.g. Sci-Fi enthusiast, collector of epic fantasy novels…"
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Book Request Alerts</div>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>
              Get notified when books you requested are uploaded by fellow readers
            </div>
          </div>
          <input
            type="checkbox"
            style={{ width: 20, height: 20, accentColor: "#ffcd5b", cursor: "pointer" }}
            checked={profile.requestNotifications}
            onChange={(e) => setProfile({ ...profile, requestNotifications: e.target.checked })}
          />
        </div>

        {savedSuccess && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(74,222,128,0.15)", color: "#4ADE80", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCheck size={16} /> Profile saved successfully!
          </div>
        )}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <><Save size={16} /> Save Profile</>}
        </button>
      </div>
    </motion.div>
  );
}