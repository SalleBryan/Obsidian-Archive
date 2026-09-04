import adminConfig from "./admin-config.json";

// ── API CONFIGURATION ─────────────────────────────────────────────────────────
export const API_BASE = "https://0aw1ajoft6.execute-api.us-east-1.amazonaws.com/prod";
export const EP = {
  books: `${API_BASE}/books`,
  booksMine: `${API_BASE}/books/mine`,
  uploadCover: `${API_BASE}/upload/cover`,
  uploadBook: `${API_BASE}/upload/book`,
  requests: `${API_BASE}/requests`,
  profile: `${API_BASE}/profile`,
  notifications: `${API_BASE}/notifications`,
  progress: `${API_BASE}/progress`,
  announcement: `${API_BASE}/announcement`,
  adminStats: `${API_BASE}/admin/stats`,
  adminAuditLog: `${API_BASE}/admin/audit-log`,
  adminAnnouncement: `${API_BASE}/admin/announcement`,
  adminUsers: `${API_BASE}/admin/users`,
  adminBooks: `${API_BASE}/admin/books`,
  adminRequests: `${API_BASE}/admin/requests`,
};

// ── SUPER ADMIN CHECK ─────────────────────────────────────────────────────────
// Single source of truth: admin-config.json. The CDK backend reads the same
// file at deploy time (see api_stack.py) so both sides can never drift apart.
export const SUPER_ADMIN_EMAILS = adminConfig.superAdminEmails;
export const checkIsSuperAdmin = (user) => {
  if (!user || !user.email) return false;
  const em = user.email.toLowerCase();
  return SUPER_ADMIN_EMAILS.includes(em);
};
