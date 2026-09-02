import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { User, Library, MessageSquarePlus, LogOut, Shield } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function UserMenuDropdown({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, handleSignOut } = useAuth();

  const onSignOut = async () => {
    onClose();
    await handleSignOut();
    navigate("/library");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="user-menu-dropdown"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <div style={{ padding: "8px 12px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{currentUser?.name || "Guest"}</div>
            <div style={{ fontSize: 11, color: "#a1a1aa" }}>{currentUser?.email || ""}</div>
            {isSuperAdmin && (
              <div style={{ marginTop: 6 }}>
                <span className="admin-badge"><Shield size={10} /> Super Admin</span>
              </div>
            )}
          </div>
          <button className="menu-item" onClick={() => { onClose(); navigate("/profile"); }}>
            <User size={15} /> My Profile
          </button>
          <button className="menu-item" onClick={() => { onClose(); navigate("/collection"); }}>
            <Library size={15} /> My Collection
          </button>
          <button className="menu-item" onClick={() => { onClose(); navigate("/requests"); }}>
            <MessageSquarePlus size={15} /> Book Requests
          </button>
          <button className="menu-item" onClick={onSignOut} style={{ color: "#f87171" }}>
            <LogOut size={15} /> Sign Out
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
