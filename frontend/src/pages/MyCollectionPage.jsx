import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Library, Loader2, Lock, LogIn } from "lucide-react";
import { api } from "../api";
import { HorizontalShelf, ContinueReadingShelf, BookCardItem } from "../components/Shelves";
import { getReadingList, loadMergedReadingList } from "../lib/progress";

export function MyCollectionPage({ searchQuery, currentUser, onOpenAuth, isSuperAdmin }) {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "series"
  const [coverMap, setCoverMap] = useState({});       // bookId -> book (for cover/category join)
  const [readingEntries, setReadingEntries] = useState([]);

  const userId = currentUser?.userId || "guest";

  const loadBooks = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      // Fetch the user's own books; also fetch public books so we can show covers
      // for public titles they're reading but don't own.
      const [mine, publics] = await Promise.all([
        api.getMyBooks(),
        api.getPublicBooks().catch(() => []),
      ]);
      setBooks(mine);
      const map = {};
      [...publics, ...mine].forEach(b => { if (b?.bookId) map[b.bookId] = b; });
      setCoverMap(map);
    } catch {
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) loadBooks();
    else setLoading(false);
  }, [currentUser]);

  // Show the local list instantly, then reconcile with cloud progress (cross-device)
  useEffect(() => {
    setReadingEntries(getReadingList(userId));
    let alive = true;
    loadMergedReadingList(userId).then((merged) => { if (alive) setReadingEntries(merged); });
    return () => { alive = false; };
  }, [userId]);

  if (!currentUser) {
    return (
      <div className="page fade-in">
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <Lock size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>Sign In to Access Your Bookshelf</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, marginTop: 8, marginBottom: 20 }}>
            Your personal collection is private and encrypted to your account.
          </p>
          <button className="btn btn-primary" onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const filteredBooks = books.filter((b) => {
    const q = searchQuery.toLowerCase();
    return (
      (b.title || "").toLowerCase().includes(q) ||
      (b.author || "").toLowerCase().includes(q) ||
      (b.seriesName || "").toLowerCase().includes(q)
    );
  });

  // Group books by Series
  const seriesGroups = useMemo(() => {
    const groups = {};
    const standalones = [];

    filteredBooks.forEach((book) => {
      if (book.seriesName && book.seriesName.trim()) {
        const sName = book.seriesName.trim();
        if (!groups[sName]) groups[sName] = [];
        groups[sName].push(book);
      } else {
        standalones.push(book);
      }
    });

    Object.keys(groups).forEach((sName) => {
      groups[sName].sort((a, b) => (Number(a.seriesOrder) || 999) - (Number(b.seriesOrder) || 999));
    });

    return { groups, standalones };
  }, [filteredBooks]);

  return (
    <div className="page fade-in">
      {/* BANNER */}
      <div className="playbooks-banner">
        <div className="playbooks-banner-text">
          <Library size={14} color="#ffcd5b" style={{ flexShrink: 0 }} />
          <span>{books.length} {books.length === 1 ? "volume" : "volumes"} in your personal collection</span>
        </div>
        <div className="playbooks-banner-link" onClick={() => navigate("/upload?visibility=private")}>
          Add Book
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="gplay-tabs-row">
        <button
          className={`gplay-tab-btn ${activeTab === "all" ? "active" : ""}`}
          onClick={() => setActiveTab("all")}
        >
          All Volumes
          {activeTab === "all" && <div className="gplay-tab-indicator" />}
        </button>
        <button
          className={`gplay-tab-btn ${activeTab === "series" ? "active" : ""}`}
          onClick={() => setActiveTab("series")}
        >
          By Series
          {activeTab === "series" && <div className="gplay-tab-indicator" />}
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><Loader2 size={40} color="#ffcd5b" className="spin" /></div>
      ) : filteredBooks.length === 0 && readingEntries.length === 0 ? (
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 540, margin: "20px auto" }}>
          <Library size={48} style={{ color: "#ffcd5b", margin: "0 auto 16px", opacity: 0.6 }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Your Collection is Empty</h2>
          <p style={{ color: "#a1a1aa", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
            Keep your favorite novels, private manuscripts, or entire series neatly organized here.
          </p>
          <button className="btn btn-primary" onClick={() => navigate("/upload?visibility=private")}>
            <Plus size={16} /> Add to Collection
          </button>
        </div>
      ) : activeTab === "series" ? (
        /* SERIES GROUPED SHELVES */
        <div>
          {Object.entries(seriesGroups.groups).map(([sName, sBooks]) => (
            <HorizontalShelf
              key={sName}
              title={sName}
              subtitle={`${sBooks.length} ${sBooks.length === 1 ? "Volume" : "Volumes"} in series`}
              books={sBooks}
              onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
            />
          ))}

          {seriesGroups.standalones.length > 0 && (
            <HorizontalShelf
              title="Standalone Books"
              subtitle={`${seriesGroups.standalones.length} ${seriesGroups.standalones.length === 1 ? "Book" : "Books"}`}
              books={seriesGroups.standalones}
              onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
            />
          )}
        </div>
      ) : (
        /* ALL BOOKS SHELF + GRID */
        <div>
          {/* Real Continue Reading shelf — books in progress with % completion */}
          <ContinueReadingShelf
            entries={readingEntries}
            coverMap={coverMap}
            onOpenReader={(bid) => navigate(`/read/${bid}`)}
          />

          {/* Private Collection — the user's own private books, kept in their own shelf */}
          {(() => {
            const privateBooks = filteredBooks.filter(b => b.visibility === "private");
            return privateBooks.length > 0 ? (
              <HorizontalShelf
                title="Private Collection"
                subtitle={`${privateBooks.length} ${privateBooks.length === 1 ? "book" : "books"} vaulted to your account`}
                books={privateBooks}
                onSelectBook={(book) => navigate(`/books/${book.bookId}`)}
              />
            ) : null;
          })()}

          {/* Complete Library Grid */}
          <div className="shelf-header" style={{ marginTop: 24, marginBottom: 8 }}>
            <h2 className="shelf-header-title">All Books</h2>
            <span className="shelf-header-sub">{filteredBooks.length} volumes</span>
          </div>
          <div className="book-grid">
            {filteredBooks.map((book) => (
              <BookCardItem key={book.bookId} book={book} onSelect={() => navigate(`/books/${book.bookId}`)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

