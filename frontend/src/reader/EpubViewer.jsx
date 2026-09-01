import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowLeft, X, Loader2, Bookmark, ChevronDown } from "lucide-react";
import ePub from "epubjs";
import { upsertReadingProgress, syncProgressToCloud } from "../lib/progress";

export function EpubViewer({ readUrl, theme, fontSize, title, bookId, userId, author }) {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const navRef = useRef(null);        // {toc} cached after load
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const searchInputRef = useRef(null);

  const [loadingBook, setLoadingBook] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toc, setToc] = useState([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [currentChapter, setCurrentChapter] = useState("");
  const [readingProgress, setReadingProgress] = useState(0);
  const [locationsReady, setLocationsReady] = useState(false);

  // In-book search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Detect mobile/tablet so we can hide the side arrow buttons (swipe-only there)
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // localStorage key scoped to book + user so different users keep independent positions
  const posKey = `obsidian_pos_${bookId}_${userId}`;

  const applyStyles = useCallback((rendition, t, fs) => {
    if (!rendition) return;
    const bg        = t === "dark" ? "#111317" : t === "sepia" ? "#fbf0d9" : "#ffffff";
    const fg        = t === "dark" ? "#e4e4e7" : t === "sepia" ? "#433422" : "#18181b";
    const linkColor = t === "dark" ? "#ffcd5b" : t === "sepia" ? "#935700" : "#2563eb";
    rendition.themes.default({
      body:  { color: `${fg} !important`, background: `${bg} !important`, "font-family": "'Lora', serif !important", "font-size": `${fs}px !important`, "line-height": "1.85 !important", padding: "0 28px !important" },
      p:     { "font-size": `${fs}px !important`, "line-height": "1.85 !important", color: `${fg} !important` },
      h1: { color: `${fg} !important` }, h2: { color: `${fg} !important` }, h3: { color: `${fg} !important` },
      span:  { color: `${fg} !important` }, div: { color: `${fg} !important` },
      a:     { color: `${linkColor} !important` }
    });
  }, []);

  // ── LOAD EPUB ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    let book = null;
    let rendition = null;

    const loadEpub = async () => {
      setLoadingBook(true);
      setDownloadProgress(0);
      setLocationsReady(false);
      try {
        // Stream the EPUB file so we can track download progress for large books
        const res = await fetch(readUrl);
        if (!res.ok) throw new Error("Failed to load book data");

        const contentLength = res.headers.get("content-length");
        const reader = res.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          if (contentLength && isMounted) {
            setDownloadProgress(Math.round((loaded / parseInt(contentLength, 10)) * 100));
          }
        }

        // Merge chunks into a single ArrayBuffer
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }

        if (!isMounted || !viewerRef.current) return;
        viewerRef.current.innerHTML = "";
        book = ePub(merged.buffer);
        bookRef.current = book;

        // spread:"auto" gives a two-page (open-book) layout when the viewport is wide (≥800px),
        // and a single page on tablets/phones — matching the requested behaviour without extra logic.
        rendition = book.renderTo(viewerRef.current, { width: "100%", height: "100%", flow: "paginated", spread: "auto" });
        renditionRef.current = rendition;
        applyStyles(rendition, theme, fontSize);

        // Resume saved position, or start from the beginning
        let savedCfi = null;
        try { savedCfi = localStorage.getItem(posKey); } catch {}
        try {
          await rendition.display(savedCfi || undefined);
        } catch {
          await rendition.display(); // saved CFI stale — fall back to start
        }

        // Show the book immediately — don't block on TOC or locations
        if (isMounted) setLoadingBook(false);

        // Load Table of Contents
        const navigation = await book.loaded.navigation;
        if (isMounted && navigation?.toc) {
          setToc(navigation.toc);
          navRef.current = navigation;
        }

        // Generate locations in the background so progress shows up once ready
        book.locations.generate(1200).then(() => {
          if (isMounted) setLocationsReady(true);
        }).catch(() => {});

        if (isMounted) {
          rendition.on("relocated", (location) => {
            if (!location?.start) return;
            const cfi = location.start.cfi;

            // Persist reading position for "continue where left off"
            try { localStorage.setItem(posKey, cfi); } catch {}

            // Update progress once locations are computed
            let pct = 0;
            if (book.locations?.length()) {
              pct = Math.round(book.locations.percentageFromCfi(cfi) * 100);
              setReadingProgress(pct);
            }

            // Record this book in the "Continue Reading" shelf (local + cloud)
            const entry = { bookId, title, author, fileType: "epub", percent: pct, position: cfi };
            upsertReadingProgress(userId, entry);
            syncProgressToCloud(userId, entry);

            // Update chapter name
            const nav = navRef.current;
            if (nav?.toc) {
              const href = location.start.href;
              const match = nav.toc.find(t => t.href.includes(href) || href.includes(t.href));
              if (match) setCurrentChapter(match.label?.trim() || "");
            }
          });

          // Forward keyboard events from inside the iframe to the window handler
          rendition.on("keydown", (e) => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, bubbles: true }));
          });
        }
      } catch (err) {
        console.error("EPUB rendering error:", err);
        if (isMounted) setLoadingBook(false);
      }
    };

    loadEpub();
    return () => {
      isMounted = false;
      if (book) { try { book.destroy(); } catch {} }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readUrl]);

  // Re-apply styles when theme or font size changes (no book reload needed)
  useEffect(() => {
    if (renditionRef.current) applyStyles(renditionRef.current, theme, fontSize);
  }, [theme, fontSize, applyStyles]);

  // Once locations finish generating, refresh the displayed percentage
  useEffect(() => {
    if (!locationsReady || !renditionRef.current || !bookRef.current) return;
    try {
      const loc = renditionRef.current.currentLocation();
      if (loc?.start?.cfi && bookRef.current.locations?.length()) {
        const pct = Math.round(bookRef.current.locations.percentageFromCfi(loc.start.cfi) * 100);
        setReadingProgress(pct);
        const entry = { bookId, title, author, fileType: "epub", percent: pct, position: loc.start.cfi };
        upsertReadingProgress(userId, entry);
        syncProgressToCloud(userId, entry);
      }
    } catch {}
  }, [locationsReady]);

  // ── KEYBOARD NAVIGATION ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (searchOpen && e.key !== "Escape") return; // let search field own keys
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        renditionRef.current?.next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        renditionRef.current?.prev();
      } else if (e.key === "Escape") {
        setTocOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  // ── SWIPE NAVIGATION (mobile) ──────────────────────────────────────────────
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 60 && dy < 80) {   // dominant horizontal swipe
      dx < 0 ? renditionRef.current?.next() : renditionRef.current?.prev();
    }
  };

  // ── IN-BOOK SEARCH ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim() || !bookRef.current) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const results = await bookRef.current.search(searchQuery.trim());
      setSearchResults((results || []).slice(0, 30));
    } catch { setSearchResults([]); }
    finally { setSearchLoading(false); }
  };

  const openSearch = () => {
    setSearchOpen(true);
    setTocOpen(false);
    setTimeout(() => searchInputRef.current?.focus(), 60);
  };
  const closeSearch = () => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); };
  const goTo    = (href) => { renditionRef.current?.display(href);  setTocOpen(false); };
  const goToCfi = (cfi)  => { renditionRef.current?.display(cfi);  setSearchOpen(false); };
  const next = () => renditionRef.current?.next();
  const prev = () => renditionRef.current?.prev();

  // Theme-aware colors for the sub-bar and drawers
  const panelBg  = theme === "dark" ? "#14161b" : theme === "sepia" ? "#f4e7cd" : "#f4f4f5";
  const panelFg  = theme === "dark" ? "#e4e4e7" : theme === "sepia" ? "#433422" : "#18181b";
  const inputBg  = theme === "dark" ? "#1f1b17" : "#ffffff";

  return (
    <div
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", userSelect: "none" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── SUB-BAR: chapter · progress · search toggle ── */}
      <div style={{
        height: 40, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", fontSize: 12, background: panelBg, color: panelFg,
        borderBottom: "1px solid rgba(128,128,128,0.15)", flexShrink: 0, gap: 8
      }}>
        {/* TOC toggle */}
        <button
          onClick={() => { setTocOpen(v => !v); setSearchOpen(false); }}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", background: "transparent", border: "none", color: panelFg, fontFamily: "inherit", fontSize: 12, fontWeight: 700, flexShrink: 0, maxWidth: "55%" }}
          title="Table of Contents"
        >
          <Bookmark size={13} color="#ffcd5b" />
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentChapter || "Contents"}
          </span>
          <ChevronDown size={11} style={{ flexShrink: 0 }} />
        </button>

        {/* Progress + search button */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontWeight: 700 }}>
            {locationsReady ? `${readingProgress}%` : "…"}
          </span>
          <button
            onClick={searchOpen ? closeSearch : openSearch}
            title="Search in book (Ctrl+F)"
            style={{
              background: searchOpen ? "rgba(255,205,91,0.18)" : "transparent",
              border: "none", borderRadius: 6, padding: "4px 6px",
              cursor: "pointer", color: searchOpen ? "#ffcd5b" : panelFg,
              display: "flex", alignItems: "center"
            }}
          >
            <Search size={14} />
          </button>
        </div>
      </div>

      {/* ── SEARCH PANEL ── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            style={{ background: panelBg, borderBottom: "1px solid rgba(128,128,128,0.18)", padding: "10px 16px", flexShrink: 0 }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: searchResults.length || searchLoading ? 10 : 0 }}>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); e.stopPropagation(); }}
                placeholder="Search in book…"
                style={{ flex: 1, background: inputBg, border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, padding: "8px 12px", color: panelFg, fontSize: 13, fontFamily: "inherit", outline: "none" }}
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                style={{ padding: "0 16px", borderRadius: 8, background: "#ffcd5b", color: "#14110e", border: "none", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: searchLoading ? 0.6 : 1 }}
              >
                {searchLoading ? "…" : "Find"}
              </button>
              <button onClick={closeSearch} style={{ background: "transparent", border: "none", color: panelFg, cursor: "pointer", display: "flex", alignItems: "center" }}>
                <X size={15} />
              </button>
            </div>

            {searchResults.length > 0 && (
              <div style={{ maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => goToCfi(r.cfi)}
                    style={{ background: "transparent", border: "none", borderRadius: 6, padding: "6px 8px", textAlign: "left", cursor: "pointer", fontSize: 12, color: panelFg, fontFamily: "inherit", lineHeight: 1.5 }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,205,91,0.12)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {r.excerpt || "(no preview)"}
                  </button>
                ))}
              </div>
            )}
            {!searchLoading && searchQuery && searchResults.length === 0 && (
              <p style={{ fontSize: 12, color: "#a1a1aa", margin: 0 }}>No results for "{searchQuery}"</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── TOC DRAWER ── */}
      <AnimatePresence>
        {tocOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            style={{
              position: "absolute", top: 40, left: 0, bottom: 0, width: 280,
              background: panelBg, zIndex: 30,
              borderRight: "1px solid rgba(128,128,128,0.2)",
              padding: 18, overflowY: "auto", boxShadow: "6px 0 28px rgba(0,0,0,0.4)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#ffcd5b" }}>Table of Contents</span>
              <button className="icon-btn" onClick={() => setTocOpen(false)} style={{ width: 28, height: 28, color: panelFg }}><X size={14} /></button>
            </div>
            {toc.length === 0 ? (
              <p style={{ fontSize: 12, opacity: 0.6, color: panelFg }}>No chapters listed in book metadata.</p>
            ) : (
              toc.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => goTo(item.href)}
                  style={{ padding: "10px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 4, transition: "background 0.15s", color: panelFg }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,205,91,0.15)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  {item.label?.trim() || `Chapter ${idx + 1}`}
                </div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── READING STAGE ── */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {!isMobile && (
          <button onClick={prev} className="reader-nav-btn" style={{ left: 8 }} title="Previous page  (← Arrow Key)">
            <ArrowLeft size={18} />
          </button>
        )}

        <div ref={viewerRef} className="epub-canvas-container" />

        {!isMobile && (
          <button onClick={next} className="reader-nav-btn" style={{ right: 8 }} title="Next page  (→ Arrow Key)">
            <ArrowLeft size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        )}

        {/* Loading overlay with download progress */}
        {loadingBook && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
            <Loader2 size={40} color="#ffcd5b" className="spin" />
            <span style={{ fontSize: 14, fontWeight: 700, marginTop: 14 }}>
              {downloadProgress > 0 && downloadProgress < 100 ? `Downloading… ${downloadProgress}%` : "Rendering…"}
            </span>
            {downloadProgress > 0 && downloadProgress < 100 && (
              <div style={{ width: 200, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${downloadProgress}%`, background: "#ffcd5b", borderRadius: 4, transition: "width 0.25s" }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

