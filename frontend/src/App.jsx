import React, { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { AuthModal } from "./components/AuthModal";
import { AnnouncementBanner } from "./components/AnnouncementBanner";
import { BookDetailPage } from "./pages/BookDetailPage";
import { EditBookPage } from "./pages/EditBookPage";
import { MyCollectionPage } from "./pages/MyCollectionPage";
import { PublicLibraryPage } from "./pages/PublicLibraryPage";
import { RequestsBoardPage } from "./pages/RequestsBoardPage";
import { UploadBookPage } from "./pages/UploadBookPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import "./config/amplifyConfig";

// Lazy-loaded: OnlineReaderPage pulls in epub.js + pdfjs-dist (the two
// heaviest dependencies in the app, ~1.7MB combined). AdminPage is reachable
// by only one person. Neither should be in the bundle every visitor downloads
// just to browse the library — they're fetched only when actually navigated to.
const OnlineReaderPage = lazy(() => import("./pages/OnlineReaderPage").then(m => ({ default: m.OnlineReaderPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then(m => ({ default: m.AdminPage })));

function RouteLoader() {
  return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f1115" }}>
      <Loader2 size={36} color="#ffcd5b" className="spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const location = useLocation();
  const { currentUser, authChecked, isSuperAdmin, openAuth } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState([]);

  const loadNotifications = useCallback(async () => {
    if (!currentUser) return;
    const notifs = await api.getNotifications();
    setNotifications(notifs);
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadNotifications();
      const timer = setInterval(loadNotifications, 30000);
      return () => clearInterval(timer);
    } else {
      setNotifications([]);
    }
  }, [currentUser, loadNotifications]);

  const handleNotificationRead = (notificationId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.notificationId === notificationId ? { ...n, isRead: true } : n))
    );
  };

  const isReaderMode = location.pathname.startsWith("/read/");
  const isAdminMode  = location.pathname.startsWith("/admin");

  if (isAdminMode) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </Suspense>
    );
  }

  if (isReaderMode) {
    return (
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route
            path="/read/:bookId"
            element={<OnlineReaderPage currentUser={currentUser} authChecked={authChecked} />}
          />
        </Routes>
      </Suspense>
    );
  }

  return (
    <>
      <div className="shell">
        <Sidebar />

        <div className="main-area">
          <AnnouncementBanner />
          <Topbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            notifications={notifications}
            onNotificationRead={handleNotificationRead}
          />

          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route
              path="/library"
              element={
                <PublicLibraryPage
                  searchQuery={searchQuery}
                  currentUser={currentUser}
                  onOpenAuth={openAuth}
                  isSuperAdmin={isSuperAdmin}
                />
              }
            />
            <Route
              path="/collection"
              element={
                <MyCollectionPage
                  searchQuery={searchQuery}
                  currentUser={currentUser}
                  onOpenAuth={openAuth}
                  isSuperAdmin={isSuperAdmin}
                />
              }
            />
            <Route
              path="/requests"
              element={
                <RequestsBoardPage
                  currentUser={currentUser}
                  onOpenAuth={openAuth}
                  isSuperAdmin={isSuperAdmin}
                />
              }
            />
            <Route
              path="/upload"
              element={<UploadBookPage currentUser={currentUser} onOpenAuth={openAuth} />}
            />
            <Route
              path="/books/:bookId"
              element={
                <BookDetailPage
                  currentUser={currentUser}
                  onOpenAuth={openAuth}
                  isSuperAdmin={isSuperAdmin}
                  authChecked={authChecked}
                />
              }
            />
            <Route
              path="/books/:bookId/edit"
              element={<EditBookPage currentUser={currentUser} isSuperAdmin={isSuperAdmin} />}
            />
            <Route
              path="/profile"
              element={
                <UserProfilePage
                  currentUser={currentUser}
                  onOpenAuth={openAuth}
                  isSuperAdmin={isSuperAdmin}
                />
              }
            />
          </Routes>
        </div>

        <MobileBottomNav />
      </div>

      <AuthModal />
    </>
  );
}
