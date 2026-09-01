import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Plus, Loader2, Globe, Sparkles, Layers } from "lucide-react";
import { api } from "../api";
import { BookCoverShelfItem, HorizontalShelf, BookCardItem } from "../components/shelves";
import { CATEGORIES } from "../constants";

// ── PAGE 1: PUBLIC LIBRARY (GOOGLE PLAY BOOKS STYLE) ─────────────────────────
export function PublicLibraryPage({ searchQuery, currentUser, onOpenAuth, isSuperAdmin }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("ebooks"); // "ebooks" | "series" | "genres"
  const [filterCat, setFilterCat] = useState("All");

  const loadBooks = async () => {
    setLoading(true);
    const data = await api.getPublicBooks();
    setBooks(data);
    setLoading(false);
  };

  useEffect(() => { loadBooks(); }, []);

  const filteredBooks = useMemo(() => {
    return books.filter((b) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        (b.title || "").toLowerCase().includes(q) ||
        (b.author || "").toLowerCase().includes(q) ||
        (b.seriesName || "").toLowerCase().includes(q);
      const matchesCat = filterCat === "All" || b.category === filterCat;
      return matchesSearch && matchesCat;
    });
  }, [books, searchQuery, filterCat]);

  // Group books by category for shelves
  const categorizedShelves = useMemo(() => {
    const map = {};
    CATEGORIES.forEach(cat => { map[cat] = []; });
    books.forEach(b => {
      // Support new multi-genre `categories` array and old single `category` string
      const cats = Array.isArray(b.categories) && b.categories.length
        ? b.categories
        : [b.category || "Uncategorized"];
      cats.forEach(cat => {
        if (!map[cat]) map[cat] = [];
        map[cat].push(b);
      });
    });
    return map;
  }, [books]);

  // Group books by series
  const seriesShelves = useMemo(() => {
    const map = {};
    books.forEach(b => {
      if (b.seriesName && b.seriesName.trim()) {
        const s = b.seriesName.trim();
        if (!map[s]) map[s] = [];
        map[s].push(b);
      }
    });
    Object.keys(map).forEach(s => {
      map[s].sort((a, b) => (Number(a.seriesOrder) || 999) - (Number(b.seriesOrder) || 999));
    });
    return map;
  }, [books]);

  return (
    <div className="page fade-in">
      {/* PLAY BOOKS TOP BANNER */}
      <div className="playbooks-banner">
        <div className="playbooks-banner-text">
          <Sparkles size={14} color="#ffcd5b" style={{ flexShrink: 0 }} />
          <span>Obsidian Archive: Read community books online in EPUB & PDF</span>
        </div>
        <div
          className="playbooks-banner-link"
          onClick={() => currentUser ? navigate("/upload?visibility=public") : onOpenAuth("signin")}
        >
          Contribute
        </div>
      </div>

      {/* SEARCH / GENRE OVERRIDE VIEW */}
      {searchQuery || filterCat !== "All" ? (
        <div>
          <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 16px", marginBottom: 16 }}>
            <div>
              <div className="page-title" style={{ padding: 0 }}>
                {filterCat !== "All" ? `${filterCat} Books` : `Search: "${searchQuery}"`}
              </div>
              <div className="page-sub" style={{ padding: 0 }}>
                {filteredBooks.length} {filteredBooks.length === 1 ? "result" : "results"} found
              </div>
            </div>
            {filterCat !== "All" && (
              <button className="btn btn-secondary" style={{ height: 32, fontSize: 12, padding: "0 12px" }} onClick={() => setFilterCat("All")}>
                Reset Filter
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>
          ) : filteredBooks.length === 0 ? (
            <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 540, margin: "20px auto" }}>
              <Globe size={48} style={{ color: "#ffcd5b", margin: "0 auto 16px", opacity: 0.6 }} />
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>No Books Found</h2>
              <p style={{ color: "#a1a1aa", fontSize: 13, marginBottom: 20 }}>
                Try adjusting your search query or contribute a volume to this category.
              </p>
              <button className="btn btn-primary" onClick={() => currentUser ? navigate("/upload?visibility=public") : onOpenAuth("signin")}>
                <Plus size={16} /> Upload Book
              </button>
            </div>
          ) : (
            <div className="book-grid">
              {filteredBooks.map((book) => (
                <BookCardItem key={book.bookId} book={book} onSelect={() => navigate(`/books/${book.bookId}`)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* STANDARD GOOGLE PLAY BOOKS HOME VIEW */
        <div>
          {/* FEATURED / RECENT READS HORIZONTAL SHELF */}
          {books.length > 0 && (
            <div className="shelf-section" style={{ marginBottom: 20 }}>
              <div className="shelf-scroll-row" style={{ paddingTop: 4 }}>
                {books.slice(0, 5).map((book) => (
                  <BookCoverShelfItem
                    key={book.bookId}
                    book={book}
                    size="large"
                    onSelect={() => navigate(`/books/${book.bookId}`)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* GOOGLE PLAY BOOKS TABS */}
          <div className="gplay-tabs-row">
            <button
              className={`gplay-tab-btn ${activeTab === "ebooks" ? "active" : ""}`}
              onClick={() => setActiveTab("ebooks")}
            >
              Ebooks
              {activeTab === "ebooks" && <div className="gplay-tab-indicator" />}
            </button>
            <button
              className={`gplay-tab-btn ${activeTab === "series" ? "active" : ""}`}
              onClick={() => setActiveTab("series")}
            >
              Series & Sagas
              {activeTab === "series" && <div className="gplay-tab-indicator" />}
            </button>
            <button
              className={`gplay-tab-btn ${activeTab === "genres" ? "active" : ""}`}
              onClick={() => setActiveTab("genres")}
            >
              Genres & Categories
              {activeTab === "genres" && <div className="gplay-tab-indicator" />}
            </button>
          </div>

          {loading ? (
            <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>
          ) : activeTab === "series" ? (
            /* SERIES VIEW */
            <div>
              {Object.keys(seriesShelves).length === 0 ? (
                <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "40px 20px", maxWidth: 500, margin: "20px auto" }}>
                  <Layers size={40} style={{ color: "#ffcd5b", margin: "0 auto 12px", opacity: 0.7 }} />
                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>No Series Defined Yet</h3>
                  <p style={{ color: "#a1a1aa", fontSize: 13 }}>Upload books and tag them with a series name to create grouped collections.</p>
                </div>
              ) : (
                Object.entries(seriesShelves).map(([sName, sBooks]) => (
                  <HorizontalShelf
                    key={sName}
                    title={sName}
                    subtitle={`${sBooks.length} ${sBooks.length === 1 ? "book" : "books"} in series`}
                    books={sBooks}
                    onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
                  />
                ))
              )}
            </div>
          ) : activeTab === "genres" ? (
            /* GENRES PILLS & SHELVES */
            <div>
              <div className="toolbar" style={{ marginBottom: 16 }}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    className={`cat-chip ${filterCat === cat ? "active" : ""}`}
                    onClick={() => setFilterCat(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {CATEGORIES.map((cat) => (
                categorizedShelves[cat]?.length > 0 ? (
                  <HorizontalShelf
                    key={cat}
                    title={cat}
                    subtitle={`${categorizedShelves[cat].length} ${categorizedShelves[cat].length === 1 ? "volume" : "volumes"}`}
                    books={categorizedShelves[cat]}
                    onSeeAll={() => setFilterCat(cat)}
                    onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
                  />
                ) : null
              ))}
            </div>
          ) : (
            /* DEFAULT EBOOKS SHELVES VIEW (Like Google Play Books) */
            <div>
              {/* Ebooks for you shelf */}
              <HorizontalShelf
                title="Ebooks for you"
                subtitle="Community recommendations"
                books={books}
                onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
              />

              {/* Sci-Fi Shelf */}
              {categorizedShelves["Sci-Fi"]?.length > 0 && (
                <HorizontalShelf
                  title="Sci-Fi & Cyberpunk"
                  subtitle="Futuristic worlds and cosmic sagas"
                  books={categorizedShelves["Sci-Fi"]}
                  onSeeAll={() => setFilterCat("Sci-Fi")}
                  onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
                />
              )}

              {/* Fantasy Shelf */}
              {categorizedShelves["Fantasy"]?.length > 0 && (
                <HorizontalShelf
                  title="Epic Fantasy"
                  subtitle="Mythical realms and legendary heroes"
                  books={categorizedShelves["Fantasy"]}
                  onSeeAll={() => setFilterCat("Fantasy")}
                  onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
                />
              )}

              {/* Fiction & Classics Shelf */}
              {categorizedShelves["Fiction"]?.length > 0 && (
                <HorizontalShelf
                  title="Fiction & Novels"
                  subtitle="Captivating stories and narratives"
                  books={categorizedShelves["Fiction"]}
                  onSeeAll={() => setFilterCat("Fiction")}
                  onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
                />
              )}

              {/* Other active categories */}
              {CATEGORIES.filter(c => !["Sci-Fi", "Fantasy", "Fiction"].includes(c)).map((cat) => (
                categorizedShelves[cat]?.length > 0 ? (
                  <HorizontalShelf
                    key={cat}
                    title={cat}
                    subtitle={`${categorizedShelves[cat].length} ${categorizedShelves[cat].length === 1 ? "book" : "books"}`}
                    books={categorizedShelves[cat]}
                    onSeeAll={() => setFilterCat(cat)}
                    onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
                  />
                ) : null
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

