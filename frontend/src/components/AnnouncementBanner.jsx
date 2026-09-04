import { useState, useEffect } from "react";
import { Megaphone, X } from "lucide-react";
import { api } from "../api";

const DISMISSED_KEY = "obsidian_announcement_dismissed";

// Platform-wide banner set by an admin. Dismissal is keyed by the
// announcement's own updatedAt, so clearing and publishing a NEW one
// automatically re-shows it even if the previous one was dismissed.
export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await api.getAnnouncement();
      if (!data.active) return;
      setAnnouncement(data);
      setDismissed(localStorage.getItem(DISMISSED_KEY) === data.updatedAt);
    })();
  }, []);

  if (!announcement || dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISSED_KEY, announcement.updatedAt); } catch {}
    setDismissed(true);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
      background: "rgba(255,205,91,0.12)", borderBottom: "1px solid rgba(255,205,91,0.25)",
      color: "#ffcd5b", fontSize: 13, fontWeight: 600,
    }}>
      <Megaphone size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{announcement.message}</span>
      <button
        onClick={handleDismiss}
        style={{ background: "none", border: "none", color: "#ffcd5b", cursor: "pointer", flexShrink: 0, display: "flex" }}
        title="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
