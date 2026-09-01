import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Library, Loader2, Save, UploadCloud, Lock, LogIn, FileText } from "lucide-react";
import { api } from "../api";
import { CATEGORIES } from "../constants";

// ── PAGE 4: UPLOAD BOOK (WITH ANIMATED PROGRESS BAR & SERIES) ────────────────
export function UploadBookPage({ currentUser, onOpenAuth }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultVisibility = searchParams.get("visibility") || "public";

  const [formData, setFormData] = useState({
    title: "",
    author: "",
    categories: ["Fiction"],
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
      <div className="page fade-in">
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
        setProgress(20);
        setStatusText("Uploading cover image…");
        const { coverKey } = await api.uploadCover(coverFile, (pct) => {
          setProgress(20 + Math.round(pct * 0.25));
        });
        finalCoverKey = coverKey;
      }

      // 2. Upload Document
      if (bookFile) {
        const base = coverFile ? 45 : 20;
        const span = coverFile ? 45 : 70;
        setProgress(base);
        setStatusText(`Uploading book document (${(bookFile.size / (1024 * 1024)).toFixed(1)} MB)…`);
        const { fileKey, fileType, fileSizeBytes } = await api.uploadBookFile(bookFile, (pct) => {
          setProgress(base + Math.round(pct * (span / 100)));
        });
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
        categories: formData.categories,
        category: formData.categories[0] || "Uncategorized", // backward compat for DynamoDB GSI
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
    <div className="page fade-in">
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
              <label>Genres <span style={{ fontWeight: 400, opacity: 0.6, fontSize: 12 }}>(select all that apply)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {CATEGORIES.filter(c => c !== "Uncategorized").map((c) => {
                  const checked = formData.categories.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={uploading}
                      onClick={() => {
                        const next = checked
                          ? formData.categories.filter(x => x !== c)
                          : [...formData.categories, c];
                        setFormData({ ...formData, categories: next.length ? next : ["Uncategorized"] });
                      }}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                        cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit",
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
    </div>
  );
}

