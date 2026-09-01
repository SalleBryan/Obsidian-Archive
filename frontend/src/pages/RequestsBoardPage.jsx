import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X, Loader2, MessageSquarePlus } from "lucide-react";
import { api } from "../api";

// ── PAGE 3: BOOK REQUESTS ────────────────────────────────────────────────────
export function RequestsBoardPage({ currentUser, onOpenAuth, isSuperAdmin }) {
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
    <div className="page fade-in">
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
    </div>
  );
}

