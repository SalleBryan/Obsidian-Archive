import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { upsertReadingProgress, syncProgressToCloud } from "../lib/progress";

// ── PDF VIEWER (PDF.js canvas, two-page desktop spread, swipe on mobile) ─────
export function PdfViewer({ readUrl, title, theme, bookId, userId, author }) {
  const containerRef = useRef(null);
  const pdfRef       = useRef(null);   // loaded PDF document
  const renderTaskRef = useRef(null);  // active render task (cancel on nav)
  const pageKey = `obsidian_pdfpage_${bookId}_${userId}`;

  const [numPages,    setNumPages]    = useState(0);
  const [pageNum,     setPdfPage]     = useState(1);
  const [loading,     setPdfLoading]  = useState(true);
  const [dlProgress,  setDlProgress]  = useState(0);
  const [twoPage,     setTwoPage]     = useState(false); // desktop spread
  const [isMobile,    setIsMobile]    = useState(false); // hides side nav buttons

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Colours
  const bg   = theme === "dark" ? "#17191f" : theme === "sepia" ? "#fbf0d9" : "#f4f4f5";
  const panelBg = theme === "dark" ? "#111317" : theme === "sepia" ? "#f4e7cd" : "#f0f0f0";
  const panelFg = theme === "dark" ? "#e4e4e7" : theme === "sepia" ? "#433422" : "#18181b";

  // Track viewport: two-page mode on desktop (≥1024px); hide nav buttons below 768px
  useEffect(() => {
    const check = () => {
      setTwoPage(window.innerWidth >= 1024);
      setIsMobile(window.innerWidth < 768);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Load PDF.js lazily from the npm package ──────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setPdfLoading(true);
      setDlProgress(0);
      try {
        const pdfjsLib = await import("pdfjs-dist");
        // Point the worker at the bundled worker script
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).href;

        const loadingTask = pdfjsLib.getDocument({
          url: readUrl,
          onProgress: ({ loaded, total }) => {
            if (isMounted && total) setDlProgress(Math.round((loaded / total) * 100));
          }
        });
        const pdf = await loadingTask.promise;
        if (!isMounted) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        // Restore the last page the user was on (continue where left off)
        let startPage = 1;
        try {
          const saved = parseInt(localStorage.getItem(pageKey), 10);
          if (saved >= 1 && saved <= pdf.numPages) startPage = saved;
        } catch {}
        setPdfPage(startPage);
      } catch (err) {
        console.error("PDF load error:", err);
      } finally {
        if (isMounted) setPdfLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, [readUrl]);

  // ── Render page(s) whenever pageNum, twoPage, or theme changes ───────────
  useEffect(() => {
    if (!pdfRef.current || loading) return;
    const pdf = pdfRef.current;

    const render = async () => {
      if (!containerRef.current) return;

      // Cancel any in-flight render
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }

      // Clear previous canvases
      containerRef.current.innerHTML = "";

      const pagesToRender = twoPage
        ? [pageNum, pageNum + 1 <= pdf.numPages ? pageNum + 1 : null].filter(Boolean)
        : [pageNum];

      const containerW = containerRef.current.clientWidth || window.innerWidth;
      const containerH = containerRef.current.clientHeight || window.innerHeight;
      const pageSlots  = pagesToRender.length;

      for (const pn of pagesToRender) {
        const page    = await pdf.getPage(pn);
        const vp0     = page.getViewport({ scale: 1 });

        // Scale to fit the container height (leaving room for bottom bar)
        const scaleH  = (containerH - 8) / vp0.height;
        const scaleW  = (containerW / pageSlots - 8) / vp0.width;
        const scale   = Math.min(scaleH, scaleW);
        const vp      = page.getViewport({ scale });

        const canvas  = document.createElement("canvas");
        canvas.width  = vp.width;
        canvas.height = vp.height;
        canvas.style.display = "block";
        canvas.style.borderRadius = "4px";
        canvas.style.boxShadow = "0 8px 40px rgba(0,0,0,0.45)";
        canvas.style.background = theme === "sepia" ? "#fbf0d9" : "#fff";
        containerRef.current?.appendChild(canvas);

        const task = page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
        renderTaskRef.current = task;
        try { await task.promise; } catch {}
      }
    };

    render();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, twoPage, theme, loading]);

  // ── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e) => {
      const step = twoPage ? 2 : 1;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        setPdfPage(p => Math.min(p + step, numPages));
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPdfPage(p => Math.max(p - step, 1));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [twoPage, numPages]);

  // ── Persist page + progress for "continue where left off" / library shelf ──
  useEffect(() => {
    if (loading || !numPages) return;
    try { localStorage.setItem(pageKey, String(pageNum)); } catch {}
    const percent = Math.round((pageNum / numPages) * 100);
    const entry = { bookId, title, author, fileType: "pdf", percent, position: String(pageNum) };
    upsertReadingProgress(userId, entry);
    syncProgressToCloud(userId, entry);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum, numPages, loading]);

  // ── Swipe navigation (mobile / tablet) ──────────────────────────────────
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) < 50 || dy > 80) return;
    const step = twoPage ? 2 : 1;
    if (dx < 0) setPdfPage(p => Math.min(p + step, numPages));
    else         setPdfPage(p => Math.max(p - step, 1));
  };

  const prevPage = () => setPdfPage(p => Math.max(p - (twoPage ? 2 : 1), 1));
  const nextPage = () => setPdfPage(p => Math.min(p + (twoPage ? 2 : 1), numPages));
  const sliderMax = twoPage ? Math.max(1, numPages - 1) : numPages;

  return (
    <div
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: bg, overflow: "hidden" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* ── Reading stage ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 0", overflow: "hidden", position: "relative" }}>

        {/* Prev arrow — hidden on mobile (use swipe) */}
        {!loading && numPages > 0 && (
          <button
            onClick={prevPage}
            className="reader-nav-btn"
            style={{ position: "static", flexShrink: 0, display: isMobile ? "none" : "flex" }}
            disabled={pageNum <= 1}
            title="Previous page (← Arrow Key)"
          >
            <ArrowLeft size={18} />
          </button>
        )}

        {/* Canvas container */}
        <div
          ref={containerRef}
          style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, overflow: "hidden" }}
        />

        {/* Next arrow — hidden on mobile */}
        {!loading && numPages > 0 && (
          <button
            onClick={nextPage}
            className="reader-nav-btn"
            style={{ position: "static", flexShrink: 0, display: isMobile ? "none" : "flex" }}
            disabled={pageNum >= numPages}
            title="Next page (→ Arrow Key)"
          >
            <ArrowLeft size={18} style={{ transform: "rotate(180deg)" }} />
          </button>
        )}

        {/* Loading overlay */}
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: bg, zIndex: 10 }}>
            <Loader2 size={40} color="#ffcd5b" className="spin" />
            <span style={{ fontSize: 14, fontWeight: 700, marginTop: 14, color: panelFg }}>
              {dlProgress > 0 && dlProgress < 100 ? `Downloading… ${dlProgress}%` : "Rendering…"}
            </span>
            {dlProgress > 0 && dlProgress < 100 && (
              <div style={{ width: 200, height: 4, background: "rgba(128,128,128,0.2)", borderRadius: 4, marginTop: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${dlProgress}%`, background: "#ffcd5b", borderRadius: 4, transition: "width 0.25s" }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom bar: slider + page counter ── */}
      {!loading && numPages > 0 && (
        <div style={{ height: 44, background: panelBg, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", flexShrink: 0, borderTop: "1px solid rgba(128,128,128,0.15)" }}>
          <button onClick={prevPage} disabled={pageNum <= 1} style={{ background: "transparent", border: "none", color: panelFg, cursor: pageNum <= 1 ? "not-allowed" : "pointer", opacity: pageNum <= 1 ? 0.4 : 1, display: "flex", alignItems: "center", padding: 0 }}>
            <ArrowLeft size={16} />
          </button>

          <input
            type="range"
            min={1}
            max={sliderMax}
            value={pageNum}
            onChange={(e) => setPdfPage(Number(e.target.value))}
            style={{ flex: 1, accentColor: "#ffcd5b", cursor: "pointer" }}
          />

          <button onClick={nextPage} disabled={pageNum >= numPages} style={{ background: "transparent", border: "none", color: panelFg, cursor: pageNum >= numPages ? "not-allowed" : "pointer", opacity: pageNum >= numPages ? 0.4 : 1, display: "flex", alignItems: "center", padding: 0 }}>
            <ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} />
          </button>

          <span style={{ fontSize: 12, fontWeight: 700, color: panelFg, whiteSpace: "nowrap", minWidth: 72, textAlign: "right" }}>
            {twoPage ? `${pageNum}–${Math.min(pageNum + 1, numPages)} / ${numPages}` : `${pageNum} / ${numPages}`}
          </span>
        </div>
      )}
    </div>
  );
}

