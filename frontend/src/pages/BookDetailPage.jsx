import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Trash2, ArrowLeft, BookOpen, Library, Loader2, AlertTriangle, Layers } from "lucide-react";
import { api } from "../api";
import { getCatColor } from "../config/constants";

export function BookDetailPage({ currentUser, onOpenAuth, isSuperAdmin, authChecked }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authChecked) return;

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
  }, [bookId, authChecked]);

  if (loading) {
    return <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>;
  }

  if (error || !book) {
    return (
      <div className="page fade-in">
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
    <div className="page fade-in">
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

          {canModify && book.visibility === "public" && book.moderationStatus && book.moderationStatus !== "approved" && (
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999,
              fontSize: 12, fontWeight: 700, marginBottom: 16,
              color: book.moderationStatus === "pending" ? "#ffcd5b" : "#f87171",
              background: book.moderationStatus === "pending" ? "rgba(255,205,91,0.15)" : "rgba(248,113,113,0.15)",
            }}>
              <AlertTriangle size={13} />
              {book.moderationStatus === "pending" ? "Pending admin review — not visible in the public library yet" : "Rejected by an admin — not visible in the public library"}
            </div>
          )}

          <h1 className="detail-title">{book.title}</h1>
          <p className="detail-author">by {book.author || "Unknown Author"}</p>

          {book.seriesName && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,205,91,0.15)", borderRadius: 999, color: "#ffcd5b", fontSize: 12, fontWeight: 700, marginBottom: 20 }}>
              <Layers size={14} /> Part of {book.seriesName} {book.seriesOrder ? `(Book #${book.seriesOrder})` : ""}
            </div>
          )}

          {book.description && <p className="detail-description">{book.description}</p>}

          <div className="detail-actions">
            {(book.hasFile ?? book.fileKey) ? (
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
    </div>
  );
}

