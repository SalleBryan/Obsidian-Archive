
// ── API CONFIGURATION ─────────────────────────────────────────────────────────
export const API_BASE = "https://drcuyr2lz3.execute-api.us-east-1.amazonaws.com/prod";
export const EP = {
  books: `${API_BASE}/books`,
  booksMine: `${API_BASE}/books/mine`,
  uploadCover: `${API_BASE}/upload/cover`,
  uploadBook: `${API_BASE}/upload/book`,
  requests: `${API_BASE}/requests`,
  profile: `${API_BASE}/profile`,
  notifications: `${API_BASE}/notifications`,
  progress: `${API_BASE}/progress`,
};

// ── SUPER ADMIN CHECK ─────────────────────────────────────────────────────────
export const SUPER_ADMIN_EMAILS = [
  "bryansalle17@gmail.com",
  "bryan@digisol.com"
];
export const checkIsSuperAdmin = (user) => {
  if (!user || !user.email) return false;
  const em = user.email.toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(em) || em.startsWith("bryansalle") || em.startsWith("bryan@");
};
