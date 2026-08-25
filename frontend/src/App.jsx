import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, Pencil, Trash2, ArrowLeft,
  BookOpen, X, Library, Loader2, Save,
  AlertTriangle, Check, RefreshCw, UploadCloud, Settings
} from "lucide-react";

// ── API CONFIGURATION ─────────────────────────────────────────────────────────
const API_BASE = "https://ewsqrp7rwd.execute-api.us-east-1.amazonaws.com/prod";
const EP = {
  books: `${API_BASE}/books`,
  upload: `${API_BASE}/upload`,
};

// ── THEME CONSTANTS ───────────────────────────────────────────────────────────
const CATEGORIES = ["Fiction", "Sci-Fi", "Fantasy", "Non-Fiction", "Biography", "Uncategorized"];

const CAT_COLORS = {
  "Fiction":       "#ffcd5b",
  "Sci-Fi":        "#b9c8de",
  "Fantasy":       "#ffc6c1",
  "Non-Fiction":   "#4ADE80",
  "Biography":     "#fb923c",
  "Uncategorized": "#9b8f7b",
};
const getCatColor = (cat) => CAT_COLORS[cat] || "#ffcd5b";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const T = {
  bg:           "#111317",
  surface:      "#111317",
  surfaceC:     "#1e2023",
  surfaceCH:    "#282a2d",
  surfaceCHH:   "#333538",
  primary:      "#ffcd5b",
  primaryDim:   "#f2bf49",
  primaryMuted: "#e2b13c",
  onPrimary:    "#3f2e00",
  outline:      "#9b8f7b",
  outlineV:     "#4e4635",
  onSurface:    "#e2e2e6",
  onSurfaceV:   "#d2c5af",
  error:        "#ffb4ab",
  errorC:       "#93000a",
  onError:      "#690005",
  secondary:    "#b9c8de",
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

  /* ── Sidebar ── */
  .sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 280px;
    background: #1e2023;
    border-right: 1px solid rgba(78,70,53,0.3);
    display: flex; flex-direction: column;
    padding: 24px 16px; z-index: 40;
  }
  @media(max-width: 768px) { .sidebar { display: none; } }

  .sidebar-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding: 0 8px; }
  .sidebar-brand-icon {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(255,205,91,0.15);
    display: flex; align-items: center; justify-content: center;
    color: #ffcd5b;
  }
  .sidebar-brand-title { font-size: 16px; font-weight: 700; color: #ffcd5b; line-height: 1.2; }
  .sidebar-brand-sub { font-size: 12px; color: #d2c5af; }

  .sidebar-nav { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; border-radius: 8px;
    font-size: 14px; font-weight: 500; color: #d2c5af;
    cursor: pointer; transition: all 0.15s; border: none; background: transparent;
    text-decoration: none; width: 100%; font-family: inherit;
  }
  .nav-item:hover { background: #282a2d; color: #e2e2e6; }
  .nav-item.active { background: rgba(255,205,91,0.1); color: #ffcd5b; font-weight: 700; }
  .nav-item.danger { color: #ffb4ab; }
  .nav-item.danger:hover { background: rgba(255,180,171,0.08); }
  .sidebar-footer { border-top: 1px solid rgba(78,70,53,0.3); padding-top: 16px; margin-top: 16px; }

  /* ── Main area ── */
  .main-area { flex: 1; margin-left: 280px; display: flex; flex-direction: column; min-height: 100vh; }
  @media(max-width: 768px) { .main-area { margin-left: 0; } }

  /* ── Top bar ── */
  .topbar {
    position: sticky; top: 0; z-index: 30; height: 72px;
    background: rgba(17,19,23,0.88); backdrop-filter: blur(20px);
    border-bottom: 1px solid rgba(78,70,53,0.2);
    box-shadow: 0 4px 20px rgba(226,177,60,0.06);
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 48px;
  }
  @media(max-width: 768px) { .topbar { padding: 0 16px; } }

  .topbar-brand {
    display: none;
    align-items: center; gap: 10px;
    font-size: 18px; font-weight: 700; color: #ffcd5b; cursor: pointer;
  }
  @media(max-width: 768px) { .topbar-brand { display: flex; } }

  .topbar-search { position: relative; flex: 1; max-width: 480px; margin: 0 24px; }
  .topbar-search input {
    width: 100%; height: 42px; padding: 0 16px 0 44px;
    background: #1e2023; border: 1px solid rgba(78,70,53,0.4);
    border-radius: 999px; color: #e2e2e6;
    font-family: inherit; font-size: 14px; outline: none; transition: all 0.2s;
  }
  .topbar-search input::placeholder { color: rgba(210,197,175,0.45); }
  .topbar-search input:focus { border-color: #ffcd5b; box-shadow: 0 0 0 2px rgba(255,205,91,0.12); }
  .topbar-search-icon { position: absolute; left: 14px; top: 12px; color: #d2c5af; }
  .topbar-actions { display: flex; align-items: center; gap: 12px; }

  .icon-btn {
    width: 40px; height: 40px; border-radius: 50%;
    border: none; background: transparent;
    color: #d2c5af; cursor: pointer; transition: all 0.15s;
    display: flex; align-items: center; justify-content: center; font-family: inherit;
  }
  .icon-btn:hover { background: #1e2023; color: #ffcd5b; }

  /* ── Page ── */
  .page { padding: 40px 48px 100px; max-width: 1440px; width: 100%; }
  @media(max-width: 768px) { .page { padding: 24px 16px 100px; } }

  /* ── Page header ── */
  .page-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .eyebrow-line { width: 48px; height: 3px; background: #ffcd5b; border-radius: 999px; }
  .eyebrow-text { font-size: 11px; font-weight: 700; color: #ffcd5b; text-transform: uppercase; letter-spacing: 0.12em; }
  .page-title { font-size: 48px; font-weight: 700; color: #e2e2e6; letter-spacing: -0.02em; line-height: 1.1; }
  .page-sub { font-size: 16px; color: rgba(210,197,175,0.55); margin-top: 6px; }
  .page-header { margin-bottom: 32px; }

  /* ── Toolbar / filters ── */
  .toolbar { display: flex; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; align-items: center; }
  .cat-chip {
    padding: 7px 16px; border-radius: 999px; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: all 0.15s;
    border: 1px solid rgba(78,70,53,0.5); background: transparent; color: #d2c5af;
    white-space: nowrap; font-family: inherit;
  }
  .cat-chip:hover { border-color: #ffcd5b; color: #e2e2e6; }
  .cat-chip.active { background: rgba(255,205,91,0.12); border-color: rgba(255,205,91,0.5); color: #ffcd5b; font-weight: 700; }

  /* ── Book grid ── */
  .book-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 24px;
  }
  @media(min-width: 1920px) {
    .book-grid { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 28px; }
  }

  .book-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer;
    aspect-ratio: 2/3;
    background: #1e2023;
    border: 1px solid rgba(78,70,53,0.2);
    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    transition: transform 0.3s, box-shadow 0.3s;
  }
  .book-card:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 28px 48px rgba(0,0,0,0.7); }
  .book-card-top-bar { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 10; }
  .book-card-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; display: block; }
  .book-card:hover .book-card-img { transform: scale(1.06); }
  .book-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.3) 55%, transparent 100%);
    display: flex; flex-direction: column; justify-content: flex-end; padding: 14px;
  }
  .book-num { font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px; }
  .book-title-text { font-size: 15px; font-weight: 600; color: #fff; line-height: 1.25; }
  .book-author-text { font-size: 11px; color: rgba(255,255,255,0.48); margin-top: 2px; }

  .checkbox-wrapper { position: absolute; top: 10px; left: 10px; z-index: 20; }
  .checkbox-wrapper input { width: 18px; height: 18px; accent-color: #ffb4ab; cursor: pointer; }

  /* ── Add card ── */
  .add-card {
    position: relative; border-radius: 12px; overflow: hidden; cursor: pointer;
    aspect-ratio: 2/3; background: #1e2023;
    border: 2px dashed rgba(78,70,53,0.5);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    transition: all 0.2s;
  }
  .add-card:hover { border-color: #ffcd5b; background: #282a2d; }
  .add-card-icon {
    width: 56px; height: 56px; border-radius: 50%; background: #333538;
    display: flex; align-items: center; justify-content: center; margin-bottom: 12px;
    color: #d2c5af; transition: all 0.2s;
  }
  .add-card:hover .add-card-icon { background: rgba(255,205,91,0.15); color: #ffcd5b; }
  .add-card-label { font-size: 14px; font-weight: 500; color: #d2c5af; text-align: center; padding: 0 12px; transition: color 0.2s; }
  .add-card:hover .add-card-label { color: #e2e2e6; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    height: 44px; padding: 0 24px; border-radius: 999px;
    font-family: inherit; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; border: none;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary { background: #ffcd5b; color: #3f2e00; box-shadow: 0 4px 14px rgba(226,177,60,0.2); }
  .btn-primary:hover:not(:disabled) { background: #f2bf49; }
  .btn-danger { background: transparent; color: #d2c5af; border: 1px solid rgba(78,70,53,0.6); }
  .btn-danger:hover:not(:disabled) { color: #ffb4ab; border-color: rgba(255,180,171,0.4); background: rgba(255,180,171,0.08); }
  .btn-danger-solid { background: #ffb4ab; color: #690005; }
  .btn-danger-solid:hover:not(:disabled) { opacity: 0.88; }
  .btn-secondary { background: transparent; color: #d2c5af; border: 1px solid rgba(78,70,53,0.6); }
  .btn-secondary:hover:not(:disabled) { background: #282a2d; color: #e2e2e6; }

  /* ── Glass panel ── */
  .glass-panel {
    background: rgba(22,24,29,0.7);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(148,163,184,0.08);
    box-shadow: 0 4px 20px rgba(226,177,60,0.05);
  }

  /* ── Detail ── */
  .detail-grid {
    display: grid; grid-template-columns: 260px 1fr; gap: 56px; align-items: start;
  }
  @media(max-width: 768px) { .detail-grid { grid-template-columns: 1fr; gap: 32px; } }
  @media(min-width: 1440px) { .detail-grid { grid-template-columns: 300px 1fr; } }

  .cover-wrapper {
    width: 100%; aspect-ratio: 2/3; border-radius: 12px; overflow: hidden;
    background: #1e2023; border: 1px solid rgba(78,70,53,0.3);
    box-shadow: 0 20px 60px rgba(0,0,0,0.7); position: relative;
  }
  .cover-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; z-index: 2; }
  .cover-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; display: block; }
  .cover-wrapper:hover .cover-img { transform: scale(1.04); }

  .detail-eyebrow { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
  .detail-title { font-size: 48px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 8px; }
  @media(max-width: 768px) { .detail-title { font-size: 32px; } }
  .detail-author { font-size: 18px; color: #d2c5af; margin-bottom: 32px; }
  .detail-description { font-size: 16px; line-height: 1.75; color: rgba(226,226,230,0.78); margin-bottom: 40px; max-width: 600px; }
  .detail-actions { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }

  .confirm-box {
    margin-top: 20px; padding: 20px;
    background: rgba(147,0,10,0.12); border: 1px solid rgba(255,180,171,0.25);
    border-radius: 12px;
  }
  .confirm-box-title { display: flex; align-items: center; gap: 8px; color: #ffb4ab; font-size: 16px; font-weight: 600; margin-bottom: 8px; }
  .confirm-box-body { font-size: 14px; color: #d2c5af; margin-bottom: 16px; line-height: 1.6; }
  .confirm-box-actions { display: flex; gap: 12px; }

  /* ── Editor ── */
  .editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  @media(max-width: 768px) { .editor-grid { grid-template-columns: 1fr; } }

  .editor-card { border-radius: 12px; padding: 32px; position: relative; overflow: hidden; }
  .editor-card-accent { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: #ffcd5b; }

  .field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .field label { font-size: 11px; font-weight: 700; color: #d2c5af; text-transform: uppercase; letter-spacing: 0.1em; }
  .field input, .field select, .field textarea {
    background: #1e2023; border: 1px solid rgba(78,70,53,0.45);
    padding: 12px 16px; border-radius: 8px;
    color: #e2e2e6; font-family: inherit; font-size: 15px;
    width: 100%; outline: none; transition: all 0.2s;
  }
  .field input::placeholder, .field textarea::placeholder { color: rgba(210,197,175,0.38); }
  .field input:focus, .field select:focus, .field textarea:focus {
    border-color: #ffcd5b; box-shadow: 0 0 0 2px rgba(255,205,91,0.12);
  }
  .field select option { background: #1e2023; }

  .upload-zone {
    border: 2px dashed rgba(78,70,53,0.5); border-radius: 10px; height: 220px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;
    background: #1e2023;
  }
  .upload-zone:hover { border-color: #ffcd5b; background: rgba(255,205,91,0.04); }
  .upload-zone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%; }
  .upload-preview { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* ── Status ── */
  .status-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 32px; }
  .status-hint { font-size: 13px; color: #d2c5af; }
  .status-error { font-size: 13px; color: #ffb4ab; display: flex; align-items: center; gap: 6px; }

  /* ── Batch bar ── */
  .batch-bar {
    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
    background: #1e2023; border: 1px solid rgba(78,70,53,0.4);
    padding: 14px 28px; border-radius: 999px;
    display: flex; align-items: center; gap: 20px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.8); z-index: 500; white-space: nowrap;
  }

  /* ── Book number badge ── */
  .book-num-badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 14px; border-radius: 999px;
    background: rgba(255,205,91,0.1); border: 1px solid rgba(255,205,91,0.22);
    color: #ffcd5b; font-size: 13px; font-weight: 600;
  }

  /* ── Utilities ── */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1s linear infinite; }
  .loading-center { display: flex; align-items: center; justify-content: center; min-height: 300px; }

  /* ── Mobile bottom nav ── */
  .mobile-nav {
    display: none; position: fixed; bottom: 0; left: 0; right: 0;
    background: #1e2023; border-top: 1px solid rgba(78,70,53,0.3); z-index: 50;
  }
  @media(max-width: 768px) {
    .mobile-nav { display: flex; justify-content: space-around; height: 64px; align-items: center; }
  }
  .mobile-nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: #d2c5af; font-size: 10px; font-weight: 500; cursor: pointer; flex: 1;
    padding: 8px 0; transition: color 0.15s; border: none; background: transparent; font-family: inherit;
  }
  .mobile-nav-item.active { color: #ffcd5b; }
`;

// ── API ───────────────────────────────────────────────────────────────────────
const api = {
  getBooks: async () => {
    const res = await fetch(EP.books, {
      headers: { "x-api-key": import.meta.env.VITE_API_KEY }
    });
    const data = await res.json();
    return (data.books || []).sort((a, b) => a["book-num"] - b["book-num"]);
  },
  mutate: async (operation, payload) => {
    const res = await fetch(EP.books, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_API_KEY
      },
      body: JSON.stringify({ operation, payload })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed with status ${res.status}`);
    }
    return res;
  },
  uploadImage: async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const mimeType = file.type || `image/${ext}`;
    const res = await fetch(EP.upload, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-api-key": import.meta.env.VITE_API_KEY
      },
      body: JSON.stringify({ extension: ext, contentType: mimeType })
    });
    const { uploadUrl, publicUrl } = await res.json();
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT", headers: { "Content-Type": mimeType }, body: file
    });
    if (!uploadRes.ok) throw new Error(`S3 upload failed: ${uploadRes.status}`);
    return publicUrl;
  }
};

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({ onHome }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon"><BookOpen size={20} /></div>
        <div>
          <div className="sidebar-brand-title">Obsidian Archive</div>
          <div className="sidebar-brand-sub">Bryan's Collection</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <button className="nav-item active" onClick={onHome}><BookOpen size={18} /> Home</button>
        <button className="nav-item"><Library size={18} /> Collections</button>
        <button className="nav-item"><Settings size={18} /> Archive</button>
      </nav>
      <div className="sidebar-footer">
        <button className="nav-item danger"><X size={18} /> Logout</button>
      </div>
    </aside>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("home");
  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [loading, setLoading] = useState(true);
  const [selectedForBatch, setSelectedForBatch] = useState(new Set());

  const loadBooks = async () => {
    setLoading(true);
    try { setBooks(await api.getBooks()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadBooks(); }, []);

  const filteredBooks = books.filter(b => {
    const q = search.toLowerCase();
    const matchesSearch = (b.title || "").toLowerCase().includes(q) ||
                          (b.author || "").toLowerCase().includes(q);
    const matchesCat = filterCat === "All" || b.category === filterCat;
    return matchesSearch && matchesCat;
  });

  const nextId = books.length > 0 ? Math.max(...books.map(b => b["book-num"])) + 1 : 1;

  const toggleBatchSelect = (bookNum) => {
    const s = new Set(selectedForBatch);
    s.has(bookNum) ? s.delete(bookNum) : s.add(bookNum);
    setSelectedForBatch(s);
  };

  const handleBatchDelete = async () => {
    await api.mutate("BATCH_DELETE", { book_nums: Array.from(selectedForBatch) });
    setBooks(prev => prev.filter(b => !selectedForBatch.has(b["book-num"])));
    setSelectedForBatch(new Set());
  };

  const goHome = () => { setView("home"); loadBooks(); };

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">
        <Sidebar onHome={goHome} />

        <div className="main-area">
          {/* Top bar */}
          <header className="topbar">
            <div className="topbar-brand" onClick={goHome}>
              <BookOpen size={22} /> Obsidian Archive
            </div>

            {view === "home" && (
              <div className="topbar-search">
                <Search className="topbar-search-icon" size={18} />
                <input
                  type="text" placeholder="Search archives…"
                  value={search} onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}

            <div className="topbar-actions">
              {view === "home" && (
                <button className="icon-btn" onClick={loadBooks} title="Refresh">
                  <RefreshCw size={18} className={loading ? "spin" : ""} />
                </button>
              )}
              <button className="icon-btn" title="Settings"><Settings size={18} /></button>
              {view === "home" && (
                <button className="btn btn-primary" onClick={() => setView("add")}>
                  <Plus size={16} /> Add Book
                </button>
              )}
            </div>
          </header>

          {/* Views */}
          <AnimatePresence mode="wait">

            {/* HOME */}
            {view === "home" && (
              <motion.div key="home" className="page"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>

                <div className="page-header">
                  <div className="page-eyebrow">
                    <div className="eyebrow-line" />
                    <span className="eyebrow-text">Primary Collection</span>
                  </div>
                  <div className="page-title">Your Library</div>
                  <div className="page-sub">{books.length} {books.length === 1 ? "volume" : "volumes"} catalogued</div>
                </div>

                <div className="toolbar">
                  <button className={`cat-chip ${filterCat === "All" ? "active" : ""}`} onClick={() => setFilterCat("All")}>All Books</button>
                  {CATEGORIES.map(cat => (
                    <button key={cat} className={`cat-chip ${filterCat === cat ? "active" : ""}`} onClick={() => setFilterCat(cat)}>{cat}</button>
                  ))}
                </div>

                {loading ? (
                  <div className="loading-center">
                    <Loader2 size={40} style={{ color: "#ffcd5b" }} className="spin" />
                  </div>
                ) : (
                  <motion.div layout className="book-grid">
                    <AnimatePresence>
                      {filteredBooks.map(book => (
                        <motion.div key={book["book-num"]} layout
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.88 }}
                          className="book-card">

                          <div className="book-card-top-bar" style={{ background: getCatColor(book.category) }} />

                          <div className="checkbox-wrapper" onClick={e => e.stopPropagation()}>
                            <input type="checkbox"
                              checked={selectedForBatch.has(book["book-num"])}
                              onChange={() => toggleBatchSelect(book["book-num"])} />
                          </div>

                          <div onClick={() => { setSelectedBook(book); setView("detail"); }} style={{ height: "100%" }}>
                            {book.img_link ? (
                              <img src={book.img_link} className="book-card-img" alt={book.title} />
                            ) : (
                              <div style={{
                                width: "100%", height: "100%", background: "#1e2023",
                                display: "flex", alignItems: "center", justifyContent: "center"
                              }}>
                                <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
                              </div>
                            )}
                            <div className="book-overlay">
                              <div className="book-num">#{book["book-num"]}</div>
                              <div className="book-title-text">{book.title}</div>
                              <div className="book-author-text">{book.author || "Unknown Author"}</div>
                            </div>
                          </div>
                        </motion.div>
                      ))}

                      <motion.div key="add-card" layout
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="add-card" onClick={() => setView("add")}>
                        <div className="add-card-icon"><Plus size={24} /></div>
                        <div className="add-card-label">Add New Entry</div>
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* DETAIL */}
            {view === "detail" && selectedBook && (
              <motion.div key="detail" className="page"
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}>
                <BookDetail
                  book={selectedBook}
                  onBack={goHome}
                  onEdit={() => setView("edit")}
                  onDelete={async () => {
                    await api.mutate("DELETE", { "book-num": selectedBook["book-num"] });
                    setBooks(prev => prev.filter(b => b["book-num"] !== selectedBook["book-num"]));
                    goHome();
                  }}
                />
              </motion.div>
            )}

            {/* EDITOR */}
            {(view === "add" || view === "edit") && (
              <motion.div key="editor" className="page"
                initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}>
                <BookEditor
                  book={view === "edit" ? selectedBook : { "book-num": nextId }}
                  onClose={goHome}
                />
              </motion.div>
            )}

          </AnimatePresence>

          {/* Mobile bottom nav */}
          <nav className="mobile-nav">
            <button className="mobile-nav-item active" onClick={goHome}><BookOpen size={20} /><span>Home</span></button>
            <button className="mobile-nav-item"><Library size={20} /><span>Collections</span></button>
            <button className="mobile-nav-item"><Settings size={20} /><span>Archive</span></button>
          </nav>
        </div>
      </div>

      {/* Batch delete bar */}
      <AnimatePresence>
        {selectedForBatch.size > 0 && view === "home" && (
          <motion.div className="batch-bar"
            initial={{ y: 100, opacity: 0, x: "-50%" }}
            animate={{ y: 0, opacity: 1, x: "-50%" }}
            exit={{ y: 100, opacity: 0, x: "-50%" }}>
            <span style={{ fontWeight: 600, color: "#e2e2e6" }}>{selectedForBatch.size} selected</span>
            <button className="btn btn-danger" onClick={handleBatchDelete}><Trash2 size={15} /> Delete Selected</button>
            <button className="btn btn-secondary" onClick={() => setSelectedForBatch(new Set())}><X size={15} /> Cancel</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── BOOK DETAIL ───────────────────────────────────────────────────────────────
function BookDetail({ book, onBack, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const catColor = getCatColor(book.category);

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return; }
    setDeleting(true);
    await onDelete();
  };

  return (
    <>
      <button className="btn btn-secondary" onClick={onBack} style={{ marginBottom: 32 }}>
        <ArrowLeft size={16} /> Back to Library
      </button>

      <div className="detail-grid">
        {/* Cover */}
        <div className="cover-wrapper">
          <div className="cover-spine" style={{ background: catColor }} />
          {book.img_link ? (
            <img src={book.img_link} className="cover-img" alt={book.title} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#1e2023", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={72} style={{ color: catColor, opacity: 0.28 }} />
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top right, rgba(17,19,23,0.35) 0%, transparent 60%)", pointerEvents: "none" }} />
        </div>

        {/* Info */}
        <div>
          <div className="detail-eyebrow">
            <div className="eyebrow-line" />
            <span className="eyebrow-text">Book #{book["book-num"]} · {book.category || "Uncategorized"}</span>
          </div>
          <h1 className="detail-title">{book.title}</h1>
          <p className="detail-author">by {book.author || "Unknown Author"}</p>
          {book.description && <p className="detail-description">{book.description}</p>}

          <div className="detail-actions">
            <button className="btn btn-primary" onClick={onEdit}>
              <Pencil size={16} /> Edit Details
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Loader2 size={15} className="spin" /> Deleting…</> : <><Trash2 size={15} /> Delete</>}
            </button>
          </div>

          <AnimatePresence>
            {confirming && !deleting && (
              <motion.div className="confirm-box"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                <div className="confirm-box-title"><AlertTriangle size={18} /> Confirm Deletion</div>
                <p className="confirm-box-body">
                  Are you sure you want to permanently purge <strong style={{ color: "#e2e2e6" }}>"{book.title}"</strong> from the archive? This action cannot be undone.
                </p>
                <div className="confirm-box-actions">
                  <button className="btn btn-danger-solid" onClick={handleDelete}><Trash2 size={15} /> Confirm Purge</button>
                  <button className="btn btn-secondary" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

// ── BOOK EDITOR ───────────────────────────────────────────────────────────────
function BookEditor({ book, onClose }) {
  const [formData, setFormData] = useState({
    title:       book.title       || "",
    author:      book.author      || "",
    category:    book.category    || CATEGORIES[0],
    description: book.description || "",
    img_link:    book.img_link    || ""
  });
  const [imageFile, setImageFile]   = useState(null);
  const [previewUrl, setPreviewUrl] = useState(book.img_link || "");
  const [saving, setSaving]         = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveError, setSaveError]   = useState("");
  const isNew = !book.title;

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) { setImageFile(file); setPreviewUrl(URL.createObjectURL(file)); }
  };

  const handleSave = async () => {
    setSaving(true); setSaveStatus(null); setSaveError("");
    try {
      let finalImgLink = formData.img_link;
      if (imageFile) finalImgLink = await api.uploadImage(imageFile);

      const operation = isNew ? "CREATE" : "UPDATE";
      const payload = { "book-num": book["book-num"], ...formData, img_link: finalImgLink };
      await api.mutate(operation, payload);

      setSaveStatus("done");
      setTimeout(onClose, 600);
    } catch (e) {
      console.error(e);
      setSaveError(e.message || "Something went wrong.");
      setSaving(false); setSaveStatus("error");
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
          <span className="eyebrow-text">{isNew ? "New Entry" : "Edit Entry"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {isNew ? "Add a Book" : `Edit: ${book.title}`}
          </h1>
          <span className="book-num-badge"><BookOpen size={14} /> Book #{book["book-num"]}</span>
        </div>
      </div>

      <div className="editor-grid">
        <div className="editor-card glass-panel">
          <div className="editor-card-accent" />
          <div className="field">
            <label>Title</label>
            <input type="text" value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Red Rising" />
          </div>
          <div className="field">
            <label>Author</label>
            <input type="text" value={formData.author}
              onChange={e => setFormData({ ...formData, author: e.target.value })}
              placeholder="e.g. Pierce Brown" />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={5} value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="A brief synopsis…" />
          </div>
        </div>

        <div className="editor-card glass-panel">
          <div className="editor-card-accent" />
          <div className="field">
            <label>Cover Image</label>
            <div className="upload-zone">
              <input type="file" accept="image/*" onChange={handleImageSelect} />
              {previewUrl ? (
                <img src={previewUrl} className="upload-preview" alt="Preview" />
              ) : (
                <div style={{ textAlign: "center", color: "#d2c5af", pointerEvents: "none" }}>
                  <UploadCloud size={40} style={{ margin: "0 auto 10px", color: "#ffcd5b", opacity: 0.65 }} />
                  <p style={{ fontSize: 14 }}>Click to upload a cover image</p>
                  <p style={{ fontSize: 12, marginTop: 4, opacity: 0.55 }}>PNG, JPG, WEBP supported</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="status-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formData.title}>
          {saveStatus === "done" ? <><Check size={16} /> Saved!</>
          : saving               ? <><Loader2 size={16} className="spin" /> Saving…</>
          : <><Save size={16} /> {isNew ? "Add Book" : "Save Changes"}</>}
        </button>
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>

        {saveStatus === "error" && saveError && (
          <span className="status-error"><AlertTriangle size={14} /> {saveError}</span>
        )}
      </div>
    </>
  );
}