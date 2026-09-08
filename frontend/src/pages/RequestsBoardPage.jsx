import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X, Loader2, MessageSquarePlus, ArrowBigUp, Lock, LogIn } from "lucide-react";
import { api, AuthRequiredError } from "../api";

export function RequestsBoardPage({ currentUser, onOpenAuth, isSuperAdmin }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", author: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e) => { if (e.key === "Escape") setModalOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen]);

  const loadRequests = async () => {
    // The board is authenticated-only, so skip the round trip when there is no
    // session and show the gate immediately.
    if (!currentUser) {
      setAuthRequired(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setAuthRequired(false);
    setLoadError("");
    try {
      setRequests(await api.getRequests());
    } catch (err) {
      // A 401 here means the session expired mid-visit, not that something
      // broke. Anything else is a real failure and says so.
      if (err instanceof AuthRequiredError) setAuthRequired(true);
      else setLoadError(err.message || "Could not load book requests.");
    } finally {
      // Always clears: this page previously left the spinner running forever
      // whenever the request threw.
      setLoading(false);
    }
  };

  useEffect(() => { loadRequests(); }, [currentUser]);

  const handleUpvote = async (r) => {
    if (!currentUser) { onOpenAuth("signin"); return; }
    if (r.pending) return;  // no server-side id yet
    // Optimistic toggle: the write goes through SQS asynchronously, so
    // waiting for the real response before updating the UI would feel laggy.
    setRequests(prev => prev.map(x => x.requestId === r.requestId
      ? { ...x, hasUpvoted: !x.hasUpvoted, upvoteCount: x.upvoteCount + (x.hasUpvoted ? -1 : 1) }
      : x
    ));
    try {
      await api.toggleUpvoteRequest(r.requestId);
    } catch {
      // Revert on failure
      setRequests(prev => prev.map(x => x.requestId === r.requestId
        ? { ...x, hasUpvoted: r.hasUpvoted, upvoteCount: r.upvoteCount }
        : x
      ));
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!currentUser) { onOpenAuth("signin"); return; }
    setSubmitting(true);

    // createRequest returns 202 the moment the write is queued; the row does
    // not exist until the SQS consumer commits it, which is well past any
    // refetch worth waiting on. Previously the board refetched after 1s, got
    // stale data, and showed "No Active Requests" - so submitting looked like
    // it had failed and the natural response was to submit again. Show the
    // request immediately instead, the same way upvoting already does.
    const payload = { ...form };
    const optimistic = {
      requestId: `pending-${Date.now()}`,
      title: payload.title,
      author: payload.author,
      description: payload.description,
      requesterId: currentUser.userId,
      requesterName: currentUser.name || "You",
      status: "open",
      upvoteCount: 0,
      hasUpvoted: false,
      pending: true,
    };
    setRequests((prev) => [optimistic, ...prev]);
    setModalOpen(false);
    setForm({ title: "", author: "", description: "" });

    try {
      await api.createRequest(payload);
      // Reconcile once the consumer has had time to commit. If the real row is
      // not visible yet, keep the optimistic one rather than letting the
      // request appear to vanish.
      setTimeout(async () => {
        try {
          const fresh = await api.getRequests();
          if (fresh.some((r) => r.title === optimistic.title)) setRequests(fresh);
        } catch { /* leave the optimistic row in place */ }
      }, 4000);
    } catch (err) {
      setRequests((prev) => prev.filter((r) => r.requestId !== optimistic.requestId));
      setLoadError(err.message || "Could not submit your request.");
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
      ) : authRequired ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <Lock size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>Sign In to See Book Requests</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8, marginBottom: 20 }}>
            The wishlist is shared between signed-in readers, so you can see what others are after and add your own.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      ) : loadError ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <MessageSquarePlus size={44} style={{ color: "#f87171", margin: "0 auto 16px" }} />
          <h2>Could not load requests</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8, marginBottom: 20 }}>{loadError}</p>
          <button className="btn btn-secondary" onClick={loadRequests}>Try again</button>
        </div>
      ) : requests.length === 0 ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <MessageSquarePlus size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>No Active Requests</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8 }}>Be the first book lover to submit a request!</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 20 }}>
          {requests.map((r) => (
            <div key={r.requestId} className="editor-card glass-panel" style={{ display: "flex", flexDirection: "column", gap: 12, opacity: r.pending ? 0.65 : 1 }}>
              {r.pending && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#ffcd5b", display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 size={12} className="spin" /> Posting your request…
                </span>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                <button
                  onClick={() => handleUpvote(r)}
                  title={currentUser ? (r.hasUpvoted ? "Remove upvote" : "Upvote this request") : "Sign in to upvote"}
                  aria-label={`${r.hasUpvoted ? "Remove upvote from" : "Upvote"} "${r.title}", ${r.upvoteCount || 0} upvotes`}
                  aria-pressed={!!r.hasUpvoted}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0,
                    width: 46, padding: "6px 0", borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${r.hasUpvoted ? "#ffcd5b" : "rgba(255,255,255,0.12)"}`,
                    background: r.hasUpvoted ? "rgba(255,205,91,0.15)" : "transparent",
                    color: r.hasUpvoted ? "#ffcd5b" : "#a1a1aa",
                  }}
                >
                  <ArrowBigUp size={16} fill={r.hasUpvoted ? "#ffcd5b" : "none"} />
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{r.upvoteCount || 0}</span>
                </button>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800 }}>{r.title}</h3>
                  <p style={{ fontSize: 13, color: "#ffcd5b", marginTop: 2 }}>by {r.author || "Unknown"}</p>
                </div>
                <span style={{
                  padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-modal-title"
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 id="request-modal-title" style={{ fontSize: 20, fontWeight: 800, color: "#ffcd5b" }}>Request a Book</h2>
                <button className="icon-btn" onClick={() => setModalOpen(false)} aria-label="Close dialog"><X size={20} /></button>
              </div>
              <form onSubmit={handleCreateRequest}>
                <div className="field">
                  <label htmlFor="request-title">Book Title *</label>
                  <input
                    id="request-title"
                    type="text"
                    required
                    placeholder="e.g. Red Rising"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="request-author">Author (Optional)</label>
                  <input
                    id="request-author"
                    type="text"
                    placeholder="e.g. Pierce Brown"
                    value={form.author}
                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="request-notes">Notes / Format Preference</label>
                  <textarea
                    id="request-notes"
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

