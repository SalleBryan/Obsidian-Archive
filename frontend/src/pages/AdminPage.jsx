import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, BookOpen, FileQuestion, ShieldAlert, Trash2, Ban, CheckCircle2, XCircle, ArrowLeft, Pencil, Plus, X, Eye, EyeOff, Search, ChevronLeft, ChevronRight, Download, Megaphone } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { ADMIN_STYLES } from "../adminStyles";

// ── ADMIN PANEL — standalone page, separate from user-facing shell ────────────

const TABS = ["Dashboard", "Users", "Books", "Requests", "Audit Log"];
const PAGE_SIZE = 8;

function StatCard({ label, value, icon: Icon, accent = "#ffcd5b" }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-icon" style={{ "--accent": accent }}>
        <Icon size={20} />
      </div>
      <div>
        <div className="admin-stat-value">{value ?? "—"}</div>
        <div className="admin-stat-label">{label}</div>
      </div>
    </div>
  );
}

function Badge({ children, color = "#71717a" }) {
  return <span className="admin-badge" style={{ "--c": color }}>{children}</span>;
}

function IconBtn({ color, children, ...props }) {
  return <button className="admin-icon-btn" style={{ "--c": color }} {...props}>{children}</button>;
}

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

  return { search, setSearch, page, setPage, totalPages, paged, filtered, filteredCount: filtered.length };
}

// ── Bulk row selection, shared across all three tabs ────────────────────────
function useSelection() {
  const [selected, setSelected] = useState(() => new Set());
  const toggleOne = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = (ids) => setSelected(prev =>
    ids.every(id => prev.has(id)) ? new Set() : new Set(ids)
  );
  const clear = () => setSelected(new Set());
  return { selected, toggleOne, toggleAll, clear };
}

// Exports the full filtered list (not just the current page) as a CSV download.
function downloadCSV(filename, rows, columns) {
  const esc = (v) => {
    const s = (v ?? "").toString();
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map(c => esc(c.label)).join(","),
    ...rows.map(r => columns.map(c => esc(c.get(r))).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function BulkActionBar({ count, onDelete, onCancel, deleting }) {
  return (
    <div className="admin-bulk-bar">
      <span>{count} selected</span>
      <div style={{ display: "flex", gap: 8 }}>
        <IconBtn color="#f87171" onClick={onDelete} disabled={deleting}>
          {deleting ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Delete Selected
        </IconBtn>
        <IconBtn color="#a1a1aa" onClick={onCancel} disabled={deleting}>Cancel</IconBtn>
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="admin-search-wrap">
      <Search size={14} className="admin-search-icon" />
      <input
        className="admin-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Pagination({ page, totalPages, onChange, totalItems, pageSize }) {
  if (totalPages <= 1) return null;
  const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);
  return (
    <div className="admin-pagination">
      <span className="admin-pagination-info">{from}–{to} of {totalItems}</span>
      <div className="admin-pagination-controls">
        <IconBtn color="#a1a1aa" onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1} style={{ opacity: page === 1 ? 0.4 : 1 }}>
          <ChevronLeft size={13} /> Prev
        </IconBtn>
        <span className="admin-pagination-page">Page {page} of {totalPages}</span>
        <IconBtn color="#a1a1aa" onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ opacity: page === totalPages ? 0.4 : 1 }}>
          Next <ChevronRight size={13} />
        </IconBtn>
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
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3 className="admin-modal-title">{title}</h3>
          <button className="admin-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="admin-modal-error">{error}</div>}
        <form onSubmit={submit}>
          {fields.map((f) => (
            <div key={f.key} className="admin-field">
              <label className="admin-field-label">{f.label}</label>
              {f.type === "select" ? (
                <select
                  className="admin-field-select"
                  value={values[f.key] ?? f.default ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                >
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className="admin-field-input"
                  type={f.type || "text"}
                  required={f.required}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              )}
            </div>
          ))}
          <button className="btn btn-primary admin-modal-submit" disabled={saving}>
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
    <div className="admin-signin-page">
      <style>{ADMIN_STYLES}</style>
      <div className="admin-signin-card">
        <div className="admin-signin-title-row">
          <ShieldAlert size={22} color="#ffcd5b" />
          <h2>Admin Access</h2>
        </div>
        <p className="admin-signin-subtitle">Sign in with your administrator credentials.</p>

        {authError && <div className="admin-signin-error">{authError}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label>Email Address</label>
            <input type="email" required placeholder="admin@obsidianarchive.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label>Password</label>
            <div className="admin-pass-field">
              <input
                type={showPass ? "text" : "password"}
                required
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                style={{ paddingRight: 40 }}
              />
              <button type="button" className="admin-pass-toggle" onClick={() => setShowPass(v => !v)}>
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
    <div className="admin-denied-page">
      <style>{ADMIN_STYLES}</style>
      <ShieldAlert size={44} style={{ color: "#f87171" }} />
      <h2 className="admin-denied-title">Access Denied</h2>
      <p className="admin-denied-text"><strong>{email}</strong> does not have administrator privileges.</p>
      <button className="btn btn-secondary" onClick={() => navigate("/library")}><ArrowLeft size={16} /> Back to Platform</button>
    </div>
  );
}

// ── DASHBOARD TAB ─────────────────────────────────────────────────────────────
function AnnouncementControl() {
  const [current, setCurrent] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await api.getAnnouncement();
    setCurrent(data.active ? data : null);
  }, []);

  useEffect(() => { load(); }, [load]);

  const publish = async () => {
    if (!message.trim()) return;
    setSaving(true);
    try { await api.adminSetAnnouncement(message.trim()); setMessage(""); await load(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };

  const clear = async () => {
    setSaving(true);
    try { await api.adminClearAnnouncement(); await load(); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div className="admin-table-card" style={{ padding: 20, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Megaphone size={16} color="#ffcd5b" />
        <span style={{ fontSize: 14, fontWeight: 800 }}>Platform Announcement</span>
      </div>
      {current ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#e4e4e7" }}>{current.message}</span>
          <IconBtn color="#f87171" onClick={clear} disabled={saving}>
            {saving ? <Loader2 size={12} className="spin" /> : "Clear"}
          </IconBtn>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <input
            className="admin-field-input"
            placeholder="Message shown to every visitor…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary admin-add-btn" onClick={publish} disabled={saving || !message.trim()}>
            {saving ? <Loader2 size={14} className="spin" /> : "Publish"}
          </button>
        </div>
      )}
    </div>
  );
}

function DashboardTab({ stats, loading }) {
  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;
  return (
    <div>
      <div className="admin-stats-row">
        <StatCard label="Total Users" value={stats?.totalUsers} icon={Users} accent="#4ade80" />
        <StatCard label="Total Books" value={stats?.totalBooks} icon={BookOpen} accent="#ffcd5b" />
        <StatCard label="Public Books" value={stats?.publicBooks} icon={BookOpen} accent="#60a5fa" />
        <StatCard label="Private Books" value={stats?.privateBooks} icon={BookOpen} accent="#f87171" />
        <StatCard label="Pending Review" value={stats?.pendingBooks} icon={CheckCircle2} accent="#ffcd5b" />
        <StatCard label="Total Requests" value={stats?.totalRequests} icon={FileQuestion} accent="#a78bfa" />
      </div>
      <AnnouncementControl />
    </div>
  );
}

// ── USERS TAB ─────────────────────────────────────────────────────────────────
const USER_COLS = "28px 1fr 100px 110px 150px";

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modal, setModal] = useState(null); // "create" | user object (edit) | null
  const { selected, toggleOne, toggleAll, clear } = useSelection();

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.adminGetUsers()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount, filtered } = useTableControls(users, ["name", "email"]);

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

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!window.confirm(`Permanently delete ${ids.length} user${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const { deleted } = await api.adminBatchDeleteUsers(ids);
      setUsers(prev => prev.filter(x => !deleted.includes(x.userId)));
      clear();
    } catch (e) { alert(e.message); }
    setBulkDeleting(false);
  };

  const exportCSV = () => downloadCSV("obsidian-users.csv", filtered, [
    { label: "Name", get: u => u.name },
    { label: "Email", get: u => u.email },
    { label: "Status", get: u => u.enabled ? "Active" : "Disabled" },
    { label: "Joined", get: u => u.createdAt },
  ]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      {selected.size > 0 ? (
        <BulkActionBar count={selected.size} onDelete={bulkDelete} onCancel={clear} deleting={bulkDeleting} />
      ) : (
        <div className="admin-toolbar">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name or email…" />
          <div className="admin-toolbar-actions">
            <IconBtn color="#a1a1aa" onClick={exportCSV}><Download size={12} /> Export CSV</IconBtn>
            <button className="btn btn-primary admin-add-btn" onClick={() => setModal("create")}><Plus size={14} /> Add User</button>
          </div>
        </div>
      )}

      <div className="admin-table-card">
        <div className="admin-thead" style={{ gridTemplateColumns: USER_COLS }}>
          <span className="admin-thead-check">
            <input type="checkbox" checked={paged.length > 0 && paged.every(u => selected.has(u.userId))} onChange={() => toggleAll(paged.map(u => u.userId))} />
          </span>
          <span>Name / Email</span><span>Status</span><span>Joined</span><span className="admin-th-right">Actions</span>
        </div>
        {paged.length === 0 && <div className="admin-empty">No users match your search.</div>}
        {paged.map((u) => (
          <div key={u.userId} className="admin-row" style={{ gridTemplateColumns: USER_COLS }}>
            <span className="admin-row-check">
              <input type="checkbox" checked={selected.has(u.userId)} onChange={() => toggleOne(u.userId)} />
            </span>
            <div>
              <div className="admin-row-title">{u.name || "—"}</div>
              <div className="admin-row-sub">{u.email}</div>
            </div>
            <Badge color={u.enabled ? "#4ade80" : "#f87171"}>{u.enabled ? "Active" : "Disabled"}</Badge>
            <div className="admin-row-date">{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</div>
            <div className="admin-row-actions">
              <IconBtn color="#60a5fa" onClick={() => setModal(u)}><Pencil size={12} /></IconBtn>
              <IconBtn color={u.enabled ? "#f87171" : "#4ade80"} onClick={() => toggle(u)} disabled={busy === u.userId}>
                {busy === u.userId ? <Loader2 size={12} className="spin" /> : u.enabled ? <Ban size={12} /> : <CheckCircle2 size={12} />}
              </IconBtn>
              <IconBtn color="#f87171" onClick={() => del(u)} disabled={busy === u.userId}><Trash2 size={12} /></IconBtn>
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
const BOOK_COLS = "28px 1fr 90px 95px 70px 140px";

const MODERATION_COLORS = { pending: "#ffcd5b", approved: "#4ade80", rejected: "#f87171" };

function BooksTab() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modal, setModal] = useState(null);
  const { selected, toggleOne, toggleAll, clear } = useSelection();

  const load = useCallback(async () => {
    setLoading(true);
    try { setBooks(await api.adminGetBooks()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount, filtered } = useTableControls(books, ["title", "author"]);

  const del = async (b) => {
    if (!window.confirm(`Permanently delete "${b.title}"? This cannot be undone.`)) return;
    setBusy(b.bookId);
    try {
      await api.adminDeleteBook(b.bookId);
      setBooks(prev => prev.filter(x => x.bookId !== b.bookId));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!window.confirm(`Permanently delete ${ids.length} book${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const { deleted } = await api.adminBatchDeleteBooks(ids);
      setBooks(prev => prev.filter(x => !deleted.includes(x.bookId)));
      clear();
    } catch (e) { alert(e.message); }
    setBulkDeleting(false);
  };

  const approve = async (b) => {
    setBusy(b.bookId);
    try {
      await api.adminApproveBook(b.bookId);
      setBooks(prev => prev.map(x => x.bookId === b.bookId ? { ...x, moderationStatus: "approved" } : x));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const reject = async (b) => {
    if (!window.confirm(`Reject "${b.title}"? It will stay hidden from the public library.`)) return;
    setBusy(b.bookId);
    try {
      await api.adminRejectBook(b.bookId);
      setBooks(prev => prev.map(x => x.bookId === b.bookId ? { ...x, moderationStatus: "rejected" } : x));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const exportCSV = () => downloadCSV("obsidian-books.csv", filtered, [
    { label: "Title", get: b => b.title },
    { label: "Author", get: b => b.author },
    { label: "Category", get: b => b.category },
    { label: "Visibility", get: b => b.visibility },
    { label: "Moderation", get: b => b.moderationStatus || "approved" },
    { label: "Type", get: b => b.fileType },
    { label: "Uploader Email", get: b => b.ownerEmail },
  ]);

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
      {selected.size > 0 ? (
        <BulkActionBar count={selected.size} onDelete={bulkDelete} onCancel={clear} deleting={bulkDeleting} />
      ) : (
        <div className="admin-toolbar">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by title or author…" />
          <div className="admin-toolbar-actions">
            <IconBtn color="#a1a1aa" onClick={exportCSV}><Download size={12} /> Export CSV</IconBtn>
            <button className="btn btn-primary admin-add-btn" onClick={() => setModal("create")}><Plus size={14} /> Add Book</button>
          </div>
        </div>
      )}

      <div className="admin-table-card">
        <div className="admin-thead" style={{ gridTemplateColumns: BOOK_COLS }}>
          <span className="admin-thead-check">
            <input type="checkbox" checked={paged.length > 0 && paged.every(b => selected.has(b.bookId))} onChange={() => toggleAll(paged.map(b => b.bookId))} />
          </span>
          <span>Title / Author</span><span>Visibility</span><span>Moderation</span><span>Type</span><span className="admin-th-right">Actions</span>
        </div>
        {paged.length === 0 && <div className="admin-empty">No books match your search.</div>}
        {paged.map((b) => {
          const modStatus = b.moderationStatus || "approved";
          return (
          <div key={b.bookId} className="admin-row" style={{ gridTemplateColumns: BOOK_COLS }}>
            <span className="admin-row-check">
              <input type="checkbox" checked={selected.has(b.bookId)} onChange={() => toggleOne(b.bookId)} />
            </span>
            <div>
              <div className="admin-row-title">{b.title}</div>
              <div className="admin-row-sub">by {b.author || "Unknown"}{b.ownerEmail ? ` · uploaded by ${b.ownerEmail}` : ""}</div>
            </div>
            <Badge color={b.visibility === "public" ? "#60a5fa" : "#a78bfa"}>{b.visibility === "public" ? "Public" : "Private"}</Badge>
            <Badge color={MODERATION_COLORS[modStatus]}>{modStatus.charAt(0).toUpperCase() + modStatus.slice(1)}</Badge>
            <Badge color="#ffcd5b">{(b.fileType || "—").toUpperCase()}</Badge>
            <div className="admin-row-actions">
              {modStatus === "pending" && (
                <>
                  <IconBtn color="#4ade80" onClick={() => approve(b)} disabled={busy === b.bookId} title="Approve">
                    {busy === b.bookId ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
                  </IconBtn>
                  <IconBtn color="#f87171" onClick={() => reject(b)} disabled={busy === b.bookId} title="Reject">
                    <XCircle size={12} />
                  </IconBtn>
                </>
              )}
              <IconBtn color="#60a5fa" onClick={() => setModal(b)}><Pencil size={12} /></IconBtn>
              <IconBtn color="#f87171" onClick={() => del(b)} disabled={busy === b.bookId}>
                {busy === b.bookId ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </IconBtn>
            </div>
          </div>
          );
        })}
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
const REQUEST_COLS = "28px 1fr 100px 110px 100px";

function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modal, setModal] = useState(null);
  const { selected, toggleOne, toggleAll, clear } = useSelection();

  const load = useCallback(async () => {
    setLoading(true);
    try { setRequests(await api.adminGetRequests()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount, filtered } = useTableControls(requests, ["title", "requesterName", "author"]);

  const del = async (r) => {
    if (!window.confirm(`Delete request "${r.title}"?`)) return;
    setBusy(r.requestId);
    try {
      await api.adminDeleteRequest(r.requestId);
      setRequests(prev => prev.filter(x => x.requestId !== r.requestId));
    } catch (e) { alert(e.message); }
    setBusy(null);
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    if (!window.confirm(`Delete ${ids.length} request${ids.length !== 1 ? "s" : ""}?`)) return;
    setBulkDeleting(true);
    try {
      const { deleted } = await api.adminBatchDeleteRequests(ids);
      setRequests(prev => prev.filter(x => !deleted.includes(x.requestId)));
      clear();
    } catch (e) { alert(e.message); }
    setBulkDeleting(false);
  };

  const exportCSV = () => downloadCSV("obsidian-requests.csv", filtered, [
    { label: "Title", get: r => r.title },
    { label: "Author", get: r => r.author },
    { label: "Requester", get: r => r.requesterName },
    { label: "Status", get: r => r.status },
    { label: "Created", get: r => r.createdAt },
  ]);

  const requestFields = [
    { key: "title", label: "Title", required: true },
    { key: "author", label: "Author" },
    { key: "description", label: "Description" },
    { key: "status", label: "Status", type: "select", options: ["open", "fulfilled"], default: "open" },
  ];

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      {selected.size > 0 ? (
        <BulkActionBar count={selected.size} onDelete={bulkDelete} onCancel={clear} deleting={bulkDeleting} />
      ) : (
        <div className="admin-toolbar">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by title or requester…" />
          <div className="admin-toolbar-actions">
            <IconBtn color="#a1a1aa" onClick={exportCSV}><Download size={12} /> Export CSV</IconBtn>
            <button className="btn btn-primary admin-add-btn" onClick={() => setModal("create")}><Plus size={14} /> Add Request</button>
          </div>
        </div>
      )}

      <div className="admin-table-card">
        <div className="admin-thead" style={{ gridTemplateColumns: REQUEST_COLS }}>
          <span className="admin-thead-check">
            <input type="checkbox" checked={paged.length > 0 && paged.every(r => selected.has(r.requestId))} onChange={() => toggleAll(paged.map(r => r.requestId))} />
          </span>
          <span>Title / Requester</span><span>Status</span><span>Date</span><span className="admin-th-right">Actions</span>
        </div>
        {paged.length === 0 && <div className="admin-empty">No requests match your search.</div>}
        {paged.map((r) => (
          <div key={r.requestId} className="admin-row" style={{ gridTemplateColumns: REQUEST_COLS }}>
            <span className="admin-row-check">
              <input type="checkbox" checked={selected.has(r.requestId)} onChange={() => toggleOne(r.requestId)} />
            </span>
            <div>
              <div className="admin-row-title">{r.title}</div>
              <div className="admin-row-sub">Requested by {r.requesterName || "Unknown"}</div>
            </div>
            <Badge color={r.status === "fulfilled" ? "#4ade80" : "#ffcd5b"}>{r.status === "fulfilled" ? "Fulfilled" : "Open"}</Badge>
            <div className="admin-row-date">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</div>
            <div className="admin-row-actions">
              <IconBtn color="#60a5fa" onClick={() => setModal(r)}><Pencil size={12} /></IconBtn>
              <IconBtn color="#f87171" onClick={() => del(r)} disabled={busy === r.requestId}>
                {busy === r.requestId ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </IconBtn>
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

// ── AUDIT LOG TAB ─────────────────────────────────────────────────────────────
const AUDIT_COLS = "1fr 130px 170px 140px";

const ACTION_LABELS = {
  create_user: "Created user", update_user: "Updated user", delete_user: "Deleted user",
  batch_delete_users: "Bulk-deleted users", disable_user: "Disabled user", enable_user: "Enabled user",
  create_book: "Created book", update_book: "Updated book", delete_book: "Deleted book",
  batch_delete_books: "Bulk-deleted books", approve_book: "Approved book", reject_book: "Rejected book",
  create_request: "Created request", update_request: "Updated request", delete_request: "Deleted request",
  batch_delete_requests: "Bulk-deleted requests",
  set_announcement: "Published announcement", clear_announcement: "Cleared announcement",
};

function AuditLogTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await api.adminGetAuditLog()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { search, setSearch, page, setPage, totalPages, paged, filteredCount } = useTableControls(entries, ["action", "targetType", "targetId", "adminEmail"]);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <div className="admin-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="Search by action, target, or admin…" />
      </div>

      <div className="admin-table-card">
        <div className="admin-thead" style={{ gridTemplateColumns: AUDIT_COLS }}>
          <span>Action</span><span>Target</span><span>Admin</span><span>When</span>
        </div>
        {paged.length === 0 && <div className="admin-empty">No admin actions logged yet.</div>}
        {paged.map((entry) => (
          <div key={entry.logId} className="admin-row" style={{ gridTemplateColumns: AUDIT_COLS }}>
            <div className="admin-row-title">{ACTION_LABELS[entry.action] || entry.action}</div>
            <div className="admin-row-sub">{entry.targetType}{entry.targetId ? `: ${entry.targetId}` : ""}</div>
            <div className="admin-row-sub">{entry.adminEmail}</div>
            <div className="admin-row-date">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}</div>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={setPage} totalItems={filteredCount} pageSize={PAGE_SIZE} />
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
    <div className="admin-page">
      <style>{ADMIN_STYLES}</style>

      <div className="admin-header">
        <button className="admin-back-btn" onClick={() => navigate("/library")}>
          <ArrowLeft size={16} /> Back to Platform
        </button>
        <div className="admin-divider" />
        <div className="admin-brand">
          <ShieldAlert size={18} color="#ffcd5b" />
          <span>Obsidian Admin</span>
        </div>
        <div className="admin-header-email">
          Signed in as <strong>{currentUser?.email}</strong>
        </div>
      </div>

      <div className="admin-content">
        <div className="admin-tabs">
          {TABS.map(tab => (
            <button
              key={tab}
              className={`admin-tab-btn${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Dashboard" && <DashboardTab stats={stats} loading={statsLoading} />}
        {activeTab === "Users" && <UsersTab />}
        {activeTab === "Books" && <BooksTab />}
        {activeTab === "Requests" && <RequestsTab />}
        {activeTab === "Audit Log" && <AuditLogTab />}
      </div>
    </div>
  );
}
