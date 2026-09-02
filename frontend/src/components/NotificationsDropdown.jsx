import React from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";

export function NotificationsDropdown({ isOpen, onClose, notifications, onNotificationRead }) {
  const navigate = useNavigate();
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="notif-dropdown"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffcd5b" }}>Notifications</span>
            <span style={{ fontSize: 11, color: "#a1a1aa" }}>{unreadCount} unread</span>
          </div>
          {notifications.length === 0 ? (
            <p style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", padding: "16px 0" }}>
              No notifications yet.
            </p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.notificationId}
                className={`notif-item ${!n.isRead ? "unread" : ""}`}
                onClick={() => {
                  api.markNotificationRead(n.notificationId);
                  if (onNotificationRead) onNotificationRead(n.notificationId);
                  onClose();
                  if (n.bookId) navigate(`/books/${n.bookId}`);
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e4e4e7" }}>{n.title}</div>
                <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{n.message}</div>
              </div>
            ))
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
