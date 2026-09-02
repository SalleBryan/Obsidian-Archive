import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Globe, Library, MessageSquarePlus, User, LogOut, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, handleSignOut, openAuth } = useAuth();

  const onSignOut = async () => {
    await handleSignOut();
    navigate("/library");
  };

  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar-brand" onClick={() => navigate("/library")}>
          <div className="sidebar-brand-icon"><BookOpen size={24} /></div>
          <div>
            <div className="sidebar-brand-title">Obsidian</div>
            <div className="sidebar-brand-sub">For Book Lovers</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <Link
            to="/library"
            className={`nav-item ${location.pathname === "/library" || location.pathname === "/" ? "active" : ""}`}
          >
            <Globe size={18} /> Public Library
          </Link>
          <Link
            to="/collection"
            className={`nav-item ${location.pathname === "/collection" ? "active" : ""}`}
            onClick={(e) => { if (!currentUser) { e.preventDefault(); openAuth("signin"); } }}
          >
            <Library size={18} /> My Collection
          </Link>
          <Link
            to="/requests"
            className={`nav-item ${location.pathname === "/requests" ? "active" : ""}`}
          >
            <MessageSquarePlus size={18} /> Book Requests
          </Link>
          {currentUser && (
            <Link
              to="/profile"
              className={`nav-item ${location.pathname === "/profile" ? "active" : ""}`}
            >
              <User size={18} /> My Profile
            </Link>
          )}
        </nav>
      </div>

      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
        {currentUser ? (
          <button className="nav-item" onClick={onSignOut} style={{ color: "#f87171" }}>
            <LogOut size={18} /> Sign Out
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => openAuth("signin")}
          >
            <LogIn size={16} /> Sign In
          </button>
        )}
      </div>
    </aside>
  );
}
