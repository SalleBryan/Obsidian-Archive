import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, AlertTriangle, Maximize2, Minimize2, Sun, Moon, Coffee } from "lucide-react";
import { api } from "../api";
import { hydrateBookPosition } from "../lib/progress";
import { EpubViewer } from "../reader/EpubViewer";
import { PdfViewer } from "../reader/PdfViewer";

export function OnlineReaderPage({ currentUser, authChecked }) {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [streamInfo, setStreamInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Reader settings — lifted here so the shared header can control them
  const [theme, setTheme] = useState("dark");
  const [fontSize, setFontSize] = useState(18);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    // Wait until the auth session check completes so we know whether to use
    // the authenticated or public read endpoint. Without this guard, the page
    // hits the public endpoint before Amplify resolves the token, which causes
    // private books to return 403 ("Book Unavailable") even for their owners.
    if (!authChecked) return;
    const fetchReadUrl = async () => {
      setLoading(true);
      try {
        // Seed this device's resume position from the cloud (cross-device) BEFORE
        // the viewer mounts, so it opens exactly where the last device left off.
        const [info] = await Promise.all([
          api.getBookReadUrl(bookId),
          hydrateBookPosition(currentUser?.userId || "guest", bookId),
        ]);
        setStreamInfo(info);
      } catch (err) {
        setError(err.message || "Failed to open document.");
      } finally {
        setLoading(false);
      }
    };
    fetchReadUrl();
  }, [bookId, authChecked]);

  // Close 3-dots menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (loading) {
    return (
      <div className="reader-shell reader-theme-dark" style={{ alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Loader2 size={44} color="#ffcd5b" className="spin" />
        <p style={{ marginTop: 16, fontSize: 14, fontWeight: 700 }}>Opening book in reader…</p>
      </div>
    );
  }

  if (error || !streamInfo) {
    return (
      <div className="reader-shell reader-theme-dark" style={{ alignItems: "center", justifyContent: "center", padding: 20, height: "100vh" }}>
        <AlertTriangle size={44} style={{ color: "#f87171", marginBottom: 12 }} />
        <h2>Cannot Open Book</h2>
        <p style={{ color: "#a1a1aa", marginTop: 6, marginBottom: 20 }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate(`/books/${bookId}`)}>
          <ArrowLeft size={16} /> Back to Book
        </button>
      </div>
    );
  }

  const isPdf = (streamInfo.fileType || "").toLowerCase() === "pdf";

  // Header colors that match the active reading theme
  const hdrBg   = theme === "dark"  ? "rgba(20,17,14,0.96)"    : theme === "sepia" ? "rgba(244,231,205,0.97)" : "rgba(255,255,255,0.97)";
  const hdrFg   = theme === "dark"  ? "#e4e4e7"                : theme === "sepia" ? "#433422"                 : "#18181b";
  const hdrBdr  = theme === "dark"  ? "rgba(255,255,255,0.08)" : theme === "sepia" ? "rgba(120,80,0,0.15)"    : "rgba(0,0,0,0.1)";
  const menuBg  = theme === "dark"  ? "#1f1b17"                : theme === "sepia" ? "#f4e7cd"                 : "#ffffff";

  return (
    <div className={`reader-shell reader-theme-${theme}`} style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <header
        className="reader-header"
        style={{ flexShrink: 0, background: hdrBg, borderBottom: `1px solid ${hdrBdr}`, color: hdrFg, backdropFilter: "blur(16px)", position: "relative", zIndex: 100 }}
      >
        {/* Left: back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
          <button className="icon-btn" style={{ color: hdrFg }} onClick={() => navigate(`/books/${bookId}`)} title="Exit Reader">
            <ArrowLeft size={18} />
          </button>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: hdrFg }}>
              {streamInfo.title}
            </div>
            <div style={{ fontSize: 10, opacity: 0.6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {streamInfo.author || "Reader Mode"}
            </div>
          </div>
        </div>

        {/* Right: ⋮ menu */}
        <div style={{ position: "relative" }} ref={moreRef}>
          <button
            className="icon-btn"
            style={{ color: hdrFg }}
            onClick={() => setMoreOpen(v => !v)}
            title="Reader Options"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5"  r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
            </svg>
          </button>

          <AnimatePresence>
            {moreOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.13 }}
                style={{
                  position: "absolute", top: 46, right: 0, width: 224, zIndex: 60,
                  background: menuBg, border: `1px solid ${hdrBdr}`,
                  borderRadius: 12, padding: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.55)"
                }}
              >
                {/* Theme picker */}
                <div style={{ fontSize: 10, fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 4px 8px" }}>Theme</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {[["dark","Dark",Moon],["sepia","Sepia",Coffee],["light","Light",Sun]].map(([t, label, Icon]) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      style={{
                        flex: 1, padding: "8px 0", borderRadius: 8,
                        border: `1px solid ${theme === t ? "#ffcd5b" : "rgba(128,128,128,0.25)"}`,
                        background: theme === t ? "rgba(255,205,91,0.15)" : "transparent",
                        color: theme === t ? "#ffcd5b" : hdrFg,
                        cursor: "pointer", fontSize: 10, fontWeight: 700,
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: "inherit"
                      }}
                    >
                      <Icon size={13} />{label}
                    </button>
                  ))}
                </div>

                {/* Font size (EPUB only) */}
                {!isPdf && (
                  <>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 4px 8px" }}>Font Size</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, padding: "0 2px" }}>
                      <button
                        onClick={() => setFontSize(s => Math.max(14, s - 2))}
                        style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid rgba(128,128,128,0.25)`, background: "transparent", color: hdrFg, cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "inherit" }}
                      >A−</button>
                      <span style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 700, color: hdrFg }}>{fontSize}px</span>
                      <button
                        onClick={() => setFontSize(s => Math.min(32, s + 2))}
                        style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid rgba(128,128,128,0.25)`, background: "transparent", color: hdrFg, cursor: "pointer", fontSize: 16, fontWeight: 800, fontFamily: "inherit" }}
                      >A+</button>
                    </div>
                  </>
                )}

                {/* Fullscreen */}
                <button
                  onClick={() => { toggleFullscreen(); setMoreOpen(false); }}
                  style={{
                    width: "100%", padding: "10px 12px", borderRadius: 8,
                    border: `1px solid rgba(128,128,128,0.18)`, background: "transparent",
                    color: hdrFg, cursor: "pointer", fontSize: 13, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit"
                  }}
                >
                  {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {isPdf ? (
          <PdfViewer
            readUrl={streamInfo.readUrl}
            title={streamInfo.title}
            theme={theme}
            bookId={bookId}
            userId={currentUser?.userId || "guest"}
            author={streamInfo.author}
          />
        ) : (
          <EpubViewer
            readUrl={streamInfo.readUrl}
            theme={theme}
            fontSize={fontSize}
            title={streamInfo.title}
            bookId={bookId}
            userId={currentUser?.userId || "guest"}
            author={streamInfo.author}
          />
        )}
      </div>
    </div>
  );
}

