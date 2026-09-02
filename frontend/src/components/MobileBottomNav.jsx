import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Library, Plus, Bookmark, User, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function MobileBottomNav() {
  const location = useLocation();
  const { currentUser, openAuth } = useAuth();

  return (
    <nav className="gplay-bottom-nav">
      <Link
        to="/library"
        className={`gplay-nav-item ${location.pathname === "/library" || location.pathname === "/" ? "active" : ""}`}
      >
        <div className="gplay-nav-icon-wrap"><Home size={19} /></div>
        <span>Home</span>
      </Link>
      <Link
        to="/collection"
        className={`gplay-nav-item ${location.pathname === "/collection" ? "active" : ""}`}
        onClick={(e) => {
          if (!currentUser) {
            e.preventDefault();
            openAuth("signin");
          }
        }}
      >
        <div className="gplay-nav-icon-wrap"><Library size={19} /></div>
        <span>Library</span>
      </Link>
      <Link
        to="/upload"
        className={`gplay-nav-item ${location.pathname === "/upload" ? "active" : ""}`}
        onClick={(e) => {
          if (!currentUser) {
            e.preventDefault();
            openAuth("signin");
          }
        }}
      >
        <div className="gplay-nav-icon-wrap"><Plus size={20} /></div>
        <span>Upload</span>
      </Link>
      <Link
        to="/requests"
        className={`gplay-nav-item ${location.pathname === "/requests" ? "active" : ""}`}
      >
        <div className="gplay-nav-icon-wrap"><Bookmark size={19} /></div>
        <span>Wishlist</span>
      </Link>
      {currentUser ? (
        <Link
          to="/profile"
          className={`gplay-nav-item ${location.pathname === "/profile" ? "active" : ""}`}
        >
          <div className="gplay-nav-icon-wrap"><User size={19} /></div>
          <span>Profile</span>
        </Link>
      ) : (
        <button className="gplay-nav-item" onClick={() => openAuth("signin")}>
          <div className="gplay-nav-icon-wrap"><LogIn size={19} /></div>
          <span>Sign In</span>
        </button>
      )}
    </nav>
  );
}
