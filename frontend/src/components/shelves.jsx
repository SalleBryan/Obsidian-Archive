import { BookOpen, Lock, Globe, ChevronRight } from "lucide-react";
import { getCatColor } from "../constants";

// ── GOOGLE PLAY BOOKS STYLE SHELF COMPONENTS ─────────────────────────────────
export function BookCoverShelfItem({ book, onSelect, size = "standard" }) {
  const isLarge = size === "large";
  return (
    <div className={`book-shelf-item ${isLarge ? "large" : ""}`} onClick={onSelect}>
      <div className="shelf-cover-wrapper">
        {book.coverKey ? (
          <img
            src={`https://obsidian-covers-12345.s3.amazonaws.com/${book.coverKey}`}
            className="shelf-cover-img"
            alt={book.title}
          />
        ) : (
          <div className="shelf-cover-placeholder" style={{ background: `linear-gradient(135deg, ${getCatColor(book.category)}22, #1f1b17)` }}>
            <BookOpen size={isLarge ? 36 : 28} style={{ color: getCatColor(book.category) }} />
          </div>
        )}
        {book.seriesName && (
          <div className="shelf-series-badge">
            {book.seriesName} {book.seriesOrder ? `#${book.seriesOrder}` : ""}
          </div>
        )}
      </div>
      <div className="shelf-meta">
        <div className="shelf-title">{book.title}</div>
        <div className="shelf-sub">
          {book.author ? `${book.author}` : (book.fileType ? `${book.fileType.toUpperCase()} Edition` : "Ready to read")}
        </div>
      </div>
    </div>
  );
}

export function HorizontalShelf({ title, subtitle, onSeeAll, books, onSelectBook, size = "standard" }) {
  if (!books || books.length === 0) return null;
  return (
    <div className="shelf-section">
      <div className="shelf-header" onClick={onSeeAll}>
        <div>
          <h2 className="shelf-header-title">{title}</h2>
          {subtitle && <p className="shelf-header-sub">{subtitle}</p>}
        </div>
        <span className="shelf-header-arrow"><ChevronRight size={18} /></span>
      </div>
      <div className="shelf-scroll-row">
        {books.map((book) => (
          <BookCoverShelfItem
            key={book.bookId}
            book={book}
            size={size}
            onSelect={() => onSelectBook(book)}
          />
        ))}
      </div>
    </div>
  );
}

// ── CONTINUE READING SHELF (progress-aware) ──────────────────────────────────
// Renders books the user has started, each with a % completion bar. `entries`
// come from the localStorage reading list; `coverMap` supplies covers/category
// when the full book record is known (owned or public).
export function ContinueReadingShelf({ entries, coverMap, onOpenReader }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="shelf-section">
      <div className="shelf-header">
        <div>
          <h2 className="shelf-header-title">Continue Reading</h2>
          <p className="shelf-header-sub">Pick up right where you left off</p>
        </div>
      </div>
      <div className="shelf-scroll-row">
        {entries.map((e) => {
          const full = coverMap?.[e.bookId] || {};
          const cover = full.coverKey;
          const cat = full.category || "Uncategorized";
          const pct = Math.max(0, Math.min(100, e.percent || 0));
          return (
            <div key={e.bookId} className="book-shelf-item" onClick={() => onOpenReader(e.bookId)} title={`Resume "${e.title}" — ${pct}% read`}>
              <div className="shelf-cover-wrapper" style={{ position: "relative" }}>
                {cover ? (
                  <img src={`https://obsidian-covers-12345.s3.amazonaws.com/${cover}`} className="shelf-cover-img" alt={e.title} />
                ) : (
                  <div className="shelf-cover-placeholder" style={{ background: `linear-gradient(135deg, ${getCatColor(cat)}22, #1f1b17)` }}>
                    <BookOpen size={28} style={{ color: getCatColor(cat) }} />
                  </div>
                )}
                {/* Resume overlay */}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.15)", opacity: 0, transition: "opacity 0.15s" }}
                  onMouseEnter={(ev) => ev.currentTarget.style.opacity = 1}
                  onMouseLeave={(ev) => ev.currentTarget.style.opacity = 0}>
                  <div style={{ background: "#ffcd5b", color: "#14110e", borderRadius: 999, padding: "6px 14px", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", gap: 4 }}>
                    <BookOpen size={12} /> Resume
                  </div>
                </div>
                {/* Progress bar pinned to bottom of the cover */}
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5, background: "rgba(0,0,0,0.45)" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "#ffcd5b" }} />
                </div>
                {e.fileType && (
                  <div style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", borderRadius: 4, padding: "2px 6px", fontSize: 9, fontWeight: 800, letterSpacing: "0.05em" }}>
                    {String(e.fileType).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="shelf-meta">
                <div className="shelf-title">{e.title}</div>
                <div className="shelf-sub" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.author || "Unknown"}</span>
                  <span style={{ color: "#ffcd5b", fontWeight: 800, flexShrink: 0 }}>{pct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function BookCardItem({ book, onSelect }) {
  return (
    <div className="book-card" onClick={onSelect}>
      <div className="book-card-top-bar" style={{ background: getCatColor(book.category) }} />
      <div className="book-card-badge">
        {book.visibility === "private" ? (
          <><Lock size={10} color="#f87171" /> Private</>
        ) : (
          <><Globe size={10} color="#4ADE80" /> Public</>
        )}
      </div>

      {book.coverKey ? (
        <img
          src={`https://obsidian-covers-12345.s3.amazonaws.com/${book.coverKey}`}
          className="book-card-img"
          alt={book.title}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#1f1b17", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BookOpen size={44} style={{ color: getCatColor(book.category), opacity: 0.3 }} />
        </div>
      )}

      <div className="book-overlay">
        <div className="book-title-text">{book.title}</div>
        <div className="book-author-text">{book.author || "Unknown Author"}</div>
        {book.seriesName && (
          <div className="book-series-tag">
            {book.seriesName} {book.seriesOrder ? `#${book.seriesOrder}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

