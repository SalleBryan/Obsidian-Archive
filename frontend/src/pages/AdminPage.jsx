import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, BookOpen, FileQuestion, ShieldAlert, Trash2, Ban, CheckCircle2, ArrowLeft, Pencil, Plus, X, Eye, EyeOff, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

// ── ADMIN PANEL — standalone page, separate from user-facing shell ────────────

const TABS = ["Dashboard", "Users", "Books", "Requests"];
const PAGE_SIZE = 8;

const ADMIN_STYLES = `
  .admin-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
  .admin-thead, .admin-row { display:grid; align-items:center; gap:12px; }
  .admin-thead { padding:10px 16px; border-bottom:1px solid rgba(255,255,255,0.08); font-size:10px; font-weight:800; color:#71717a; text-transform:uppercase; letter-spacing:0.06em; }
  .admin-row { padding:14px 16px; border-bottom:1px solid rgba(255,255,255,0.05); }
  .admin-row:last-child { border-bottom:none; }
  .admin-row-actions { display:flex; gap:6px; justify-content:flex-end; }
  .admin-header-email { font-size:12px; color:#71717a; }
  @media (max-width: 720px) {
    .admin-header-email { display:none; }
    .admin-thead { display:none; }
    .admin-row { grid-template-columns: 1fr !important; gap:10px; }
    .admin-row-actions { justify-content:flex-start; }
    .admin-row-actions button { flex:1; justify-content:center; }
    .admin-toolbar { flex-direction:column; align-items:stretch; }
  }
`;

function StatCard({ label, value, icon: Icon, accent = "#ffcd5b" }) {
  return (
    <div style={{
      background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14,
      padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, flex: "1 1 180px"
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${accent}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={20} color={accent} />
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{value ?? "—"}</div>
        <div style={{ fontSize: 12, color: "#71717a", marginTop: 4, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  );
}

function Badge({ children, color = "#71717a" }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      color, background: `${color}18`, border: `1px solid ${color}40`, whiteSpace: "nowrap"
    }}>{children}</span>
  );
}

const btnStyle = (color) => ({
  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
  borderRadius: 8, border: `1px solid ${color}4d`, background: "transparent", color,
  cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit"
});

// ── Search + pagination, shared across all three tabs ──────────────────────
function useTableControls(items, searchFields, pageSize = PAGE_SIZE) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => searchFields.some(f => (item[f] || "").toString().toLowerCase().includes(q)));
  }, [items, search, searchFields]);

  useEffect(() => { setPage(1); }, [search, items.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return { search, setSearch, page, setPage, totalPages, paged, filteredCount: filtered.length };
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
      <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#71717a" }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: 8, background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
      />
    </div>
  );
}

function Pagination({ page, totalPages, onChange, totalItems, pageSize }) {
  if (totalPages <= 1) return null;
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
      <span style={{ fontSize: 12, color: "#71717a" }}>{from}–{to} of {totalItems}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} style={{ ...btnStyle("#a1a1aa"), opacity: page === 1 ? 0.4 : 1 }}>
          <ChevronLeft size={13} /> Prev
        </button>
        <span style={{ fontSize: 12, color: "#a1a1aa", fontWeight: 600 }}>Page {page} of {totalPages}</span>
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ ...btnStyle("#a1a1aa"), opacity: page === totalPages ? 0.4 : 1 }}>
          Next <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Generic create/edit modal, config-driven so Users/Books/Requests share it ──
function FormModal({ title, fields, initial, onSubmit, onClose }) {
  const [values, setValues] = useState(initial || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={onClose}>
      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: 420, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: "#ffcd5b" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#71717a", cursor: "pointer" }}><X size={18} /></button>
        </div>
        {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 12, marginBottom: 14 }}>{error}</div>}
        <form onSubmit={submit}>
          {fields.map((f) => (
            <div key={f.key} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#a1a1aa", marginBottom: 6, textTransform: "uppercase" }}>{f.label}</label>
              {f.type === "select" ? (
                <select
                  value={values[f.key] ?? f.default ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit" }}
                >
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type || "text"}
                  required={f.required}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "#0f1115", border: "1px solid rgba(255,255,255,0.1)", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" }}
                />
              )}
            </div>
          ))}
          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
            disabled={saving}
          >
            {saving ? <Loader2 size={16} className="spin" /> : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── ADMIN SIGN-IN GATE ─────────────────────────────────────────────────────
function AdminSignIn() {
  const { handleSignIn, authLoading, authError } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    await handleSignIn(form.email, form.password);
  };

  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1115", padding: 16 }}>
      <div style={{ width: 380, maxWidth: "100%", background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <ShieldAlert size={22} color="#ffcd5b" />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>Admin Access</h2>
        </div>
        <p style={{ fontSize: 13, color: "#71717a", marginBottom: 22 }}>Sign in with your administrator credentials.</p>

        {authError && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 13, marginBottom: 16 }}>
            {authError}
          </div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label>Email Address</label>
            <input type="email" required placeholder="admin@obsidianarchive.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPass ? "text" : "password"}
                required
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={{ paddingRight: 40 }}
              />
              <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#71717a", cursor: "pointer" }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} disabled={authLoading}>
            {authLoading ? <Loader2 size={16} className="spin" /> : "Sign In to Admin Panel"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccessDenied({ email }) {
  const navigate = useNavigate();
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f1115", padding: 20 }}>
      <ShieldAlert size={44} style={{ color: "#f87171", marginBottom: 16 }} />
      <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Access Denied</h2>
      <p style={{ color: "#71717a", fontSize: 13, marginBottom: 24, textAlign: "center" }}>
        <strong style={{ color: "#a1a1aa" }}>{email}</strong> does not have administrator privileges.
      </p>
      <button className="btn btn-secondary" onClick={() => navigate("/library")}><ArrowLeft size={16} /> Back to Platform</button>
    </div>
  );
}

// ── DASHBOARD TAB ─────────────────────────────────────────────────────────────
function DashboardTab({ stats, loading }) {
  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
      <StatCard label="Total Users" value={stats?.totalUsers} icon={Users} accent="#4ade80" />
      <StatCard label="Total Books" value={stats?.totalBooks} icon={BookOpen} accent="#ffcd5b" />
      <StatCard label="Public Books" value={stats?.publicBooks} icon={BookOpen} accent="#60a5fa" />
      <StatCard label="Private Books" value={stats?.privateBooks} icon={BookOpen} accent="#f87171" />
      <StatCard label="Total Requests" value={stats?.totalRequests} icon={FileQuestion} accent="#a78bfa" />
    </div>
  );
}

// ── USERS TAB ─────────────────────────────────────────────────────────────────
const USER_COLS = "1fr 100px 110px 150px";

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null); // "create" | user object (edit) | null

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.adminGetUsers()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount } = useTableControls(users, ["name", "email"]);

  const toggle = async (u) => {
    if (!window.confirm(`${u.enabled ? "Disable" : "Enable"} account for ${u.email}?`)) return;
    setBusy(u.userId);
    try {
      await api.adminToggleUser(u.userId, u.enabled ? "disable" : "enable");
      setUsers(prev => prev.map(x => x.userId === u.userId ? { ...x, enabled: !x.enabled } : x));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const del = async (u) => {
    if (!window.confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    setBusy(u.userId);
    try {
      await api.adminDeleteUser(u.userId);
      setUsers(prev => prev.filter(x => x.userId !== u.userId));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <div className="admin-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email…" />
        <button className="btn btn-primary" onClick={() => setModal("create")} style={{ padding: "7px 14px", fontSize: 12, whiteSpace: "nowrap" }}><Plus size={14} /> Add User</button>
      </div>

      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        <div className="admin-thead" style={{ gridTemplateColumns: USER_COLS }}>
          <span>Name / Email</span><span>Status</span><span>Joined</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {paged.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#71717a", fontSize: 13 }}>No users match your search.</div>}
        {paged.map((u) => (
          <div key={u.userId} className="admin-row" style={{ gridTemplateColumns: USER_COLS }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{u.name || "—"}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>{u.email}</div>
            </div>
            <Badge color={u.enabled ? "#4ade80" : "#f87171"}>{u.enabled ? "Active" : "Disabled"}</Badge>
            <div style={{ fontSize: 12, color: "#71717a", whiteSpace: "nowrap" }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</div>
            <div className="admin-row-actions">
              <button onClick={() => setModal(u)} style={btnStyle("#60a5fa")}><Pencil size={12} /></button>
              <button onClick={() => toggle(u)} disabled={busy === u.userId} style={btnStyle(u.enabled ? "#f87171" : "#4ade80")}>
                {busy === u.userId ? <Loader2 size={12} className="spin" /> : u.enabled ? <Ban size={12} /> : <CheckCircle2 size={12} />}
              </button>
              <button onClick={() => del(u)} disabled={busy === u.userId} style={btnStyle("#f87171")}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={filteredCount} pageSize={PAGE_SIZE} />

      {modal === "create" && (
        <FormModal
          title="Add User"
          fields={[
            { key: "email", label: "Email", type: "email", required: true, placeholder: "reader@example.com" },
            { key: "name", label: "Name", placeholder: "Full name" },
          ]}
          initial={{}}
          onClose={() => setModal(null)}
          onSubmit={async (v) => { await api.adminCreateUser(v); await load(); }}
        />
      )}
      {modal && modal !== "create" && (
        <FormModal
          title={`Edit ${modal.email}`}
          fields={[
            { key: "name", label: "Name", placeholder: "Full name" },
            { key: "email", label: "Email", type: "email", placeholder: modal.email },
          ]}
          initial={{ name: modal.name }}
          onClose={() => setModal(null)}
          onSubmit={async (v) => { await api.adminUpdateUser(modal.userId, v); await load(); }}
        />
      )}
    </div>
  );
}

// ── BOOKS TAB ─────────────────────────────────────────────────────────────────
const BOOK_COLS = "1fr 90px 70px 100px";

function BooksTab() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setBooks(await api.adminGetBooks()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount } = useTableControls(books, ["title", "author"]);

  const del = async (b) => {
    if (!window.confirm(`Permanently delete "${b.title}"? This cannot be undone.`)) return;
    setBusy(b.bookId);
    try {
      await api.adminDeleteBook(b.bookId);
      setBooks(prev => prev.filter(x => x.bookId !== b.bookId));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const bookFields = [
    { key: "title", label: "Title", required: true },
    { key: "author", label: "Author" },
    { key: "category", label: "Category" },
    { key: "visibility", label: "Visibility", type: "select", options: ["public", "private"], default: "public" },
    { key: "description", label: "Description" },
  ];

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <div className="admin-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by title or author…" />
        <button className="btn btn-primary" onClick={() => setModal("create")} style={{ padding: "7px 14px", fontSize: 12, whiteSpace: "nowrap" }}><Plus size={14} /> Add Book</button>
      </div>

      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        <div className="admin-thead" style={{ gridTemplateColumns: BOOK_COLS }}>
          <span>Title / Author</span><span>Visibility</span><span>Type</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {paged.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#71717a", fontSize: 13 }}>No books match your search.</div>}
        {paged.map((b) => (
          <div key={b.bookId} className="admin-row" style={{ gridTemplateColumns: BOOK_COLS }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{b.title}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>by {b.author || "Unknown"}</div>
            </div>
            <Badge color={b.visibility === "public" ? "#60a5fa" : "#a78bfa"}>{b.visibility === "public" ? "Public" : "Private"}</Badge>
            <Badge color="#ffcd5b">{(b.fileType || "—").toUpperCase()}</Badge>
            <div className="admin-row-actions">
              <button onClick={() => setModal(b)} style={btnStyle("#60a5fa")}><Pencil size={12} /></button>
              <button onClick={() => del(b)} disabled={busy === b.bookId} style={btnStyle("#f87171")}>
                {busy === b.bookId ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={filteredCount} pageSize={PAGE_SIZE} />

      {modal === "create" && (
        <FormModal
          title="Add Book"
          fields={bookFields}
          initial={{}}
          onClose={() => setModal(null)}
          onSubmit={async (v) => { await api.adminCreateBook(v); await load(); }}
        />
      )}
      {modal && modal !== "create" && (
        <FormModal
          title={`Edit "${modal.title}"`}
          fields={bookFields}
          initial={{ title: modal.title, author: modal.author, category: modal.category, visibility: modal.visibility, description: modal.description }}
          onClose={() => setModal(null)}
          onSubmit={async (v) => { await api.adminUpdateBook(modal.bookId, v); await load(); }}
        />
      )}
    </div>
  );
}

// ── REQUESTS TAB ─────────────────────────────────────────────────────────────
const REQUEST_COLS = "1fr 100px 110px 100px";

function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await api.adminGetRequests()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount } = useTableControls(requests, ["title", "requesterName", "author"]);

  const del = async (r) => {
    if (!window.confirm(`Delete request "${r.title}"?`)) return;
    setBusy(r.requestId);
    try {
      await api.adminDeleteRequest(r.requestId);
      setRequests(prev => prev.filter(x => x.requestId !== r.requestId));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const requestFields = [
    { key: "title", label: "Title", required: true },
    { key: "author", label: "Author" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status", type: "select", options: ["open", "fulfilled"], default: "open" },
  ];

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <div className="admin-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by title or requester…" />
        <button className="btn btn-primary" onClick={() => setModal("create")} style={{ padding: "7px 14px", fontSize: 12, whiteSpace: "nowrap" }}><Plus size={14} /> Add Request</button>
      </div>

      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        <div className="admin-thead" style={{ gridTemplateColumns: REQUEST_COLS }}>
          <span>Title / Requester</span><span>Status</span><span>Date</span><span style={{ textAlign: "right" }}>Actions</span>
        </div>
        {paged.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#71717a", fontSize: 13 }}>No requests match your search.</div>}
        {paged.map((r) => (
          <div key={r.requestId} className="admin-row" style={{ gridTemplateColumns: REQUEST_COLS }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>Requested by {r.requesterName || "Unknown"}</div>
            </div>
            <Badge color={r.status === "fulfilled" ? "#4ade80" : "#ffcd5b"}>{r.status === "fulfilled" ? "Fulfilled" : "Open"}</Badge>
            <div style={{ fontSize: 12, color: "#71717a", whiteSpace: "nowrap" }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</div>
            <div className="admin-row-actions">
              <button onClick={() => setModal(r)} style={btnStyle("#60a5fa")}><Pencil size={12} /></button>
              <button onClick={() => del(r)} disabled={busy === r.requestId} style={btnStyle("#f87171")}>
                {busy === r.requestId ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={filteredCount} pageSize={PAGE_SIZE} />

      {modal === "create" && (
        <FormModal
          title="Add Request"
          fields={requestFields.filter(f => f.key !== "status")}
          initial={{}}
          onClose={() => setModal(null)}
          onSubmit={async (v) => { await api.adminCreateRequest(v); await load(); }}
        />
      )}
      {modal && modal !== "create" && (
        <FormModal
          title={`Edit "${modal.title}"`}
          fields={requestFields}
          initial={{ title: modal.title, author: modal.author, description: modal.description, status: modal.status }}
          onClose={() => setModal(null)}
          onSubmit={async (v) => { await api.adminUpdateRequest(modal.requestId, v); await load(); }}
        />
      )}
    </div>
  );
}

// ── MAIN ADMIN PAGE ───────────────────────────────────────────────────────────
export function AdminPage() {
  const { currentUser, isSuperAdmin, authChecked } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!authChecked || !isSuperAdmin) return;
    (async () => {
      setStatsLoading(true);
      try { setStats(await api.adminGetStats()); } catch {}
      setStatsLoading(false);
    })();
  }, [authChecked, isSuperAdmin]);

  if (!authChecked) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1115" }}>
      <Loader2 size={40} color="#ffcd5b" className="spin" />
    </div>
  );

  if (!currentUser) return <AdminSignIn />;
  if (!isSuperAdmin) return <AccessDenied email={currentUser.email} />;

  return (
    <div style={{ minHeight: "100vh", background: "#0f1115", color: "#e4e4e7", fontFamily: "inherit" }}>
      <style>{ADMIN_STYLES}</style>

      {/* Header */}
      <div style={{ background: "#16181d", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 20px", display: "flex", alignItems: "center", gap: 16, height: 60, flexWrap: "wrap" }}>
        <button
          onClick={() => navigate("/library")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "#71717a", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "6px 0" }}
        >
          <ArrowLeft size={16} /> Back to Platform
        </button>
        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.1)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={18} color="#ffcd5b" />
          <span style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Obsidian Admin</span>
        </div>
        <div className="admin-header-email" style={{ marginLeft: "auto" }}>
          Signed in as <strong style={{ color: "#ffcd5b" }}>{currentUser?.email}</strong>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
        {/* Tab navigation */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#16181d", borderRadius: 10, padding: 4, width: "fit-content", overflowX: "auto", maxWidth: "100%" }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 18px", borderRadius: 8, border: "none", fontFamily: "inherit",
                fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
                background: activeTab === tab ? "#ffcd5b" : "transparent",
                color: activeTab === tab ? "#0f1115" : "#71717a",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "Dashboard" && <DashboardTab stats={stats} loading={statsLoading} />}
        {activeTab === "Users" && <UsersTab />}
        {activeTab === "Books" && <BooksTab />}
        {activeTab === "Requests" && <RequestsTab />}
      </div>
    </div>
  );
}
