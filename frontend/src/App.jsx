import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { api } from "./api";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { AuthModal } from "./components/AuthModal";
import { BookDetailPage } from "./pages/BookDetailPage";
import { EditBookPage } from "./pages/EditBookPage";
import { MyCollectionPage } from "./pages/MyCollectionPage";
import { OnlineReaderPage } from "./pages/OnlineReaderPage";
import { PublicLibraryPage } from "./pages/PublicLibraryPage";
import { RequestsBoardPage } from "./pages/RequestsBoardPage";
import { UploadBookPage } from "./pages/UploadBookPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { AdminPage } from "./pages/AdminPage";
import { STYLES } from "./styles";
import "./amplifyConfig";

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
      <>
        <style>{STYLES}</style>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </>
    );
  }

  if (isReaderMode) {
    return (
      <>
        <style>{STYLES}</style>
        <Routes>
          <Route
            path="/read/:bookId"
            element={<OnlineReaderPage currentUser={currentUser} authChecked={authChecked} />}
          />
        </Routes>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="shell">
        <Sidebar />

        <div className="main-area">
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
