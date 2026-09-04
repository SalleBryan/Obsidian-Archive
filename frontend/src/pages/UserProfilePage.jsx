import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Save, User, LogIn, Shield, CheckCheck, AlertTriangle, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export function UserProfilePage({ currentUser, onOpenAuth, isSuperAdmin }) {
  const navigate = useNavigate();
  const { handleDeleteAccount } = useAuth();
  const [profile, setProfile] = useState({ displayName: "", bio: "", requestNotifications: true });
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      if (!currentUser) return;
      try {
        const p = await api.getProfile();
        if (p) setProfile({
          displayName: p.displayName || currentUser.name,
          bio: p.bio || "",
          requestNotifications: p.requestNotifications ?? true
        });
      } catch {}
    };
    loadProfile();
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="page">
        <div className="editor-card glass-panel" style={{ textAlign: "center", padding: "60px 20px", maxWidth: 500, margin: "40px auto" }}>
          <User size={44} style={{ color: "#ffcd5b", margin: "0 auto 16px" }} />
          <h2>Sign In to View Profile</h2>
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={() => onOpenAuth("signin")}>
            <LogIn size={16} /> Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      await api.updateProfile(profile);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      alert(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    try {
      await handleDeleteAccount();
      navigate("/library");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete account.");
      setDeleting(false);
    }
  };

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">
          <div className="eyebrow-line" />
          <span className="eyebrow-text">Reader Identity</span>
        </div>
        <h1 className="page-title">My Profile</h1>
        <p className="page-sub">Customize your reader persona and notifications.</p>
      </div>

      <div className="editor-card glass-panel" style={{ maxWidth: 600 }}>
        {/* AVATAR BANNER */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#ffcd5b", color: "#14161b", fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{currentUser.name}</div>
            <div style={{ fontSize: 13, color: "#a1a1aa" }}>{currentUser.email}</div>
            {isSuperAdmin && (
              <div style={{ marginTop: 6 }}>
                <span className="admin-badge"><Shield size={11} /> Super Admin</span>
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label>Display Name</label>
          <input
            type="text"
            value={profile.displayName}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
          />
        </div>

        <div className="field">
          <label>Reader Bio / Favorite Genres</label>
          <textarea
            rows={3}
            placeholder="e.g. Sci-Fi enthusiast, collector of epic fantasy novels…"
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Book Request Alerts</div>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>
              Get notified when books you requested are uploaded by fellow readers
            </div>
          </div>
          <input
            type="checkbox"
            style={{ width: 20, height: 20, accentColor: "#ffcd5b", cursor: "pointer" }}
            checked={profile.requestNotifications}
            onChange={(e) => setProfile({ ...profile, requestNotifications: e.target.checked })}
          />
        </div>

        {savedSuccess && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(74,222,128,0.15)", color: "#4ADE80", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCheck size={16} /> Profile saved successfully!
          </div>
        )}

        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <><Save size={16} /> Save Profile</>}
        </button>
      </div>

      <div className="editor-card glass-panel" style={{ maxWidth: 600, marginTop: 24, border: "1px solid rgba(248,113,113,0.25)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <AlertTriangle size={18} color="#f87171" />
          <h3 style={{ fontSize: 15, fontWeight: 800, color: "#f87171" }}>Danger Zone</h3>
        </div>
        <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 16 }}>
          Permanently deletes your account and profile. Your uploaded books and requests are not automatically removed —
          contact an admin if you also need those taken down. This cannot be undone.
        </p>

        {deleteError && (
          <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 13, marginBottom: 16 }}>
            {deleteError}
          </div>
        )}

        <div className="field">
          <label>Type <strong>DELETE</strong> to confirm</label>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
          />
        </div>

        <button
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={deleting || deleteConfirmText !== "DELETE"}
        >
          {deleting ? <Loader2 size={16} className="spin" /> : <><Trash2 size={16} /> Delete My Account</>}
        </button>
      </div>
    </div>
  );
}
