import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, BookOpen, FileQuestion, ShieldAlert, Trash2, Ban, CheckCircle2, ArrowLeft, Pencil, Plus, X, Eye, EyeOff } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

// ── ADMIN PANEL — standalone page, separate from user-facing shell ────────────

const TABS = ["Dashboard", "Users", "Books", "Requests"];

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
      color, background: `${color}18`, border: `1px solid ${color}40`
    }}>{children}</span>
  );
}

const btnStyle = (color) => ({
  display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
  borderRadius: 8, border: `1px solid ${color}4d`, background: "transparent", color,
  cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit"
});

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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw" }} onClick={(e) => e.stopPropagation()}>
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
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1115" }}>
      <div style={{ width: 380, maxWidth: "90vw", background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 32 }}>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#71717a" }}>{users.length} user{users.length !== 1 ? "s" : ""} registered</p>
        <button className="btn btn-primary" onClick={() => setModal("create")} style={{ padding: "7px 14px", fontSize: 12 }}><Plus size={14} /> Add User</button>
      </div>
      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        {users.map((u, i) => (
          <div key={u.userId} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center",
            padding: "14px 16px", borderBottom: i < users.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{u.name || "—"}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>{u.email}</div>
            </div>
            <Badge color={u.enabled ? "#4ade80" : "#f87171"}>{u.enabled ? "Active" : "Disabled"}</Badge>
            <div style={{ fontSize: 12, color: "#71717a", whiteSpace: "nowrap" }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setModal(u)} style={btnStyle("#60a5fa")}><Pencil size={12} /></button>
              <button onClick={() => toggle(u)} disabled={busy === u.userId} style={btnStyle(u.enabled ? "#f87171" : "#4ade80")}>
                {busy === u.userId ? <Loader2 size={12} className="spin" /> : u.enabled ? <Ban size={12} /> : <CheckCircle2 size={12} />}
              </button>
              <button onClick={() => del(u)} disabled={busy === u.userId} style={btnStyle("#f87171")}><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#71717a" }}>{books.length} book{books.length !== 1 ? "s" : ""} in the archive</p>
        <button className="btn btn-primary" onClick={() => setModal("create")} style={{ padding: "7px 14px", fontSize: 12 }}><Plus size={14} /> Add Book</button>
      </div>
      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        {books.map((b, i) => (
          <div key={b.bookId} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center",
            padding: "14px 16px", borderBottom: i < books.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{b.title}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>by {b.author || "Unknown"}</div>
            </div>
            <Badge color={b.visibility === "public" ? "#60a5fa" : "#a78bfa"}>{b.visibility === "public" ? "Public" : "Private"}</Badge>
            <Badge color="#ffcd5b">{(b.fileType || "—").toUpperCase()}</Badge>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setModal(b)} style={btnStyle("#60a5fa")}><Pencil size={12} /></button>
              <button onClick={() => del(b)} disabled={busy === b.bookId} style={btnStyle("#f87171")}>
                {busy === b.bookId ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          </div>
        ))}
      </div>

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: "#71717a" }}>{requests.length} request{requests.length !== 1 ? "s" : ""}</p>
        <button className="btn btn-primary" onClick={() => setModal("create")} style={{ padding: "7px 14px", fontSize: 12 }}><Plus size={14} /> Add Request</button>
      </div>
      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        {requests.map((r, i) => (
          <div key={r.requestId} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center",
            padding: "14px 16px", borderBottom: i < requests.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>Requested by {r.requesterName || "Unknown"}</div>
            </div>
            <Badge color={r.status === "fulfilled" ? "#4ade80" : "#ffcd5b"}>{r.status === "fulfilled" ? "Fulfilled" : "Open"}</Badge>
            <div style={{ fontSize: 12, color: "#71717a", whiteSpace: "nowrap" }}>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setModal(r)} style={btnStyle("#60a5fa")}><Pencil size={12} /></button>
              <button onClick={() => del(r)} disabled={busy === r.requestId} style={btnStyle("#f87171")}>
                {busy === r.requestId ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          </div>
        ))}
      </div>

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
      {/* Header */}
      <div style={{ background: "#16181d", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 32px", display: "flex", alignItems: "center", gap: 16, height: 60 }}>
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
        <div style={{ marginLeft: "auto", fontSize: 12, color: "#71717a" }}>
          Signed in as <strong style={{ color: "#ffcd5b" }}>{currentUser?.email}</strong>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        {/* Tab navigation */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, background: "#16181d", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: "7px 18px", borderRadius: 8, border: "none", fontFamily: "inherit",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
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
