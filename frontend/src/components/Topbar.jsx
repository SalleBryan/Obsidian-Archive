import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Search, Bell, Plus, ChevronDown, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { UserMenuDropdown } from "./UserMenuDropdown";

export function Topbar({ searchQuery, setSearchQuery, notifications = [], onNotificationRead }) {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, openAuth } = useAuth();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <>
      {/* DESKTOP STICKY TOPBAR */}
      <header className="topbar">
        <div className="topbar-brand" onClick={() => navigate("/library")}>
          <BookOpen size={22} /> Obsidian
        </div>

        <div className="topbar-search">
          <Search className="topbar-search-icon" size={18} />
          <input
            type="text"
            placeholder="Search books by title, author, series…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="topbar-actions">
          {currentUser ? (
            <>
              {/* NOTIFICATION BELL */}
              <button
                className="icon-btn"
                onClick={() => {
                  setNotifMenuOpen(!notifMenuOpen);
                  setUserMenuOpen(false);
                }}
                title="Notifications"
              >
                <Bell size={19} />
                {unreadCount > 0 && <span className="badge-dot" />}
              </button>

              {/* UPLOAD BUTTON (Desktop) */}
              <button
                className="btn btn-primary topbar-desktop-upload"
                onClick={() => navigate("/upload")}
              >
                <Plus size={16} /> Upload Book
              </button>

              {/* USER PILL */}
              <div
                className="user-nav-pill"
                onClick={() => {
                  setUserMenuOpen(!userMenuOpen);
                  setNotifMenuOpen(false);
                }}
              >
                <div className="user-nav-avatar">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-nav-name">{currentUser.name}</div>
                {isSuperAdmin && <span className="admin-badge">Admin</span>}
                <ChevronDown size={14} color="#a1a1aa" className="user-nav-chevron" />
              </div>
            </>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => openAuth("signin")}
            >
              <LogIn size={16} /> Sign In
            </button>
          )}
        </div>
      </header>

      {/* GOOGLE PLAY BOOKS STYLE MOBILE TOP SEARCH PILL */}
      <div className="mobile-search-pill-container">
        <div className="mobile-search-pill">
          <Search size={18} className="search-pill-icon" />
          <input
            type="text"
            placeholder="Search Obsidian Archive"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {currentUser ? (
            <div
              className="search-pill-avatar"
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setNotifMenuOpen(false);
              }}
              title={currentUser.name}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <button className="search-pill-signin" onClick={() => openAuth("signin")}>
              <LogIn size={13} /> Sign In
            </button>
          )}
        </div>
      </div>

      {/* DROPDOWNS */}
      <NotificationsDropdown
        isOpen={notifMenuOpen}
        onClose={() => setNotifMenuOpen(false)}
        notifications={notifications}
        onNotificationRead={onNotificationRead}
      />
      <UserMenuDropdown
        isOpen={userMenuOpen}
        onClose={() => setUserMenuOpen(false)}
      />
    </>
  );
}
