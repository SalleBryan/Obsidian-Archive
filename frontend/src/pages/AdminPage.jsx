import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, BookOpen, FileQuestion, ShieldAlert, Trash2, Ban, CheckCircle2, ArrowLeft, BarChart3 } from "lucide-react";
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

function Badge({ children, color = "#71717a", bg }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
      color, background: bg || `${color}18`, border: `1px solid ${color}40`
    }}>{children}</span>
  );
}

function TableHeader({ cols }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", marginBottom: 4 }}>
      {["Name / Email", "Status", "Joined", "Actions"].map((h) => (
        <div key={h} style={{ fontSize: 10, fontWeight: 800, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
      ))}
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
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api.adminGetUsers()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (u) => {
    if (!window.confirm(`${u.enabled ? "Disable" : "Enable"} account for ${u.email}?`)) return;
    setToggling(u.userId);
    try {
      await api.adminToggleUser(u.userId, u.enabled ? "disable" : "enable");
      setUsers(prev => prev.map(x => x.userId === u.userId ? { ...x, enabled: !x.enabled } : x));
    } catch (e) { alert(e.message); }
    setToggling(null);
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>{users.length} user{users.length !== 1 ? "s" : ""} registered</p>
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
            <button
              onClick={() => toggle(u)}
              disabled={toggling === u.userId}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 8, border: `1px solid ${u.enabled ? "rgba(248,113,113,0.3)" : "rgba(74,222,128,0.3)"}`,
                background: "transparent", color: u.enabled ? "#f87171" : "#4ade80",
                cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit"
              }}
            >
              {toggling === u.userId ? <Loader2 size={12} className="spin" /> : u.enabled ? <><Ban size={12} /> Disable</> : <><CheckCircle2 size={12} /> Enable</>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BOOKS TAB ─────────────────────────────────────────────────────────────────
function BooksTab() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setBooks(await api.adminGetBooks()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = async (b) => {
    if (!window.confirm(`Permanently delete "${b.title}"? This cannot be undone.`)) return;
    setDeleting(b.bookId);
    try {
      await api.adminDeleteBook(b.bookId);
      setBooks(prev => prev.filter(x => x.bookId !== b.bookId));
    } catch (e) { alert(e.message); }
    setDeleting(null);
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>{books.length} book{books.length !== 1 ? "s" : ""} in the archive</p>
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
            <Badge color={b.visibility === "public" ? "#60a5fa" : "#a78bfa"}>
              {b.visibility === "public" ? "Public" : "Private"}
            </Badge>
            <Badge color="#ffcd5b">{(b.fileType || "—").toUpperCase()}</Badge>
            <button
              onClick={() => del(b)}
              disabled={deleting === b.bookId}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                borderRadius: 8, border: "1px solid rgba(248,113,113,0.3)",
                background: "transparent", color: "#f87171",
                cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit"
              }}
            >
              {deleting === b.bookId ? <Loader2 size={12} className="spin" /> : <><Trash2 size={12} /> Delete</>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── REQUESTS TAB ─────────────────────────────────────────────────────────────
function RequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRequests(await api.adminGetRequests()); } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={32} color="#ffcd5b" className="spin" /></div>;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>{requests.length} request{requests.length !== 1 ? "s" : ""}</p>
      <div style={{ background: "#16181d", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
        {requests.map((r, i) => (
          <div key={r.requestId} style={{
            display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center",
            padding: "14px 16px", borderBottom: i < requests.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none"
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e4e4e7" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "#71717a" }}>Requested by {r.requesterName || "Unknown"}</div>
            </div>
            <Badge color={r.status === "fulfilled" ? "#4ade80" : "#ffcd5b"}>
              {r.status === "fulfilled" ? "Fulfilled" : "Open"}
            </Badge>
            <div style={{ fontSize: 12, color: "#71717a", whiteSpace: "nowrap" }}>
              {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
            </div>
          </div>
        ))}
      </div>
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
    if (!authChecked) return;
    if (!isSuperAdmin) { navigate("/library"); return; }
    (async () => {
      setStatsLoading(true);
      try { setStats(await api.adminGetStats()); } catch {}
      setStatsLoading(false);
    })();
  }, [authChecked, isSuperAdmin, navigate]);

  if (!authChecked) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1115" }}>
      <Loader2 size={40} color="#ffcd5b" className="spin" />
    </div>
  );

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
