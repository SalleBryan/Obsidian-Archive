import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { api } from "../api";
import { CATEGORIES } from "../constants";

// ── PAGE 6: EDIT BOOK ────────────────────────────────────────────────────────
export function EditBookPage({ currentUser, isSuperAdmin }) {
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
          categories: Array.isArray(b.categories) && b.categories.length ? b.categories : [b.category || "Fiction"],
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
    <div className="page fade-in">
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
          <label>Genres <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>(select all that apply)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {CATEGORIES.filter(c => c !== "Uncategorized").map((c) => {
              const checked = formData.categories?.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const cur = formData.categories || [];
                    const next = checked ? cur.filter(x => x !== c) : [...cur, c];
                    setFormData({ ...formData, categories: next.length ? next : ["Uncategorized"] });
                  }}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: "inherit",
                    background: checked ? "#ffcd5b" : "rgba(255,255,255,0.07)",
                    color: checked ? "#14110e" : "#a1a1aa",
                    border: checked ? "1px solid #ffcd5b" : "1px solid rgba(255,255,255,0.12)",
                    transition: "all 0.15s"
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
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
    </div>
  );
}

