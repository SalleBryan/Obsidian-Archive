import { useNavigate, useLocation } from "react-router-dom";
import { Compass, Home, Search } from "lucide-react";

// Any unmatched path previously rendered the shell around a completely empty
// content area - no message, no explanation, no route back. A mistyped URL, a
// stale bookmark or a link to a deleted book all landed there.
export function NotFoundPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="page fade-in">
      <div
        className="editor-card glass-panel"
        style={{ textAlign: "center", padding: "60px 20px", maxWidth: 520, margin: "40px auto" }}
      >
        <Compass size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>We couldn&rsquo;t find that page</h2>
        <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>
          Nothing lives at <code style={{ color: "#e4e4e7" }}>{pathname}</code>.
        </p>
        <p style={{ color: "#a1a1aa", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
          The link may be out of date, or the book it pointed to may have been removed.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => navigate("/library")}>
            <Home size={16} /> Public library
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/collection")}>
            <Search size={16} /> My collection
          </button>
        </div>
      </div>
    </div>
  );
}
