import { fetchAuthSession } from "aws-amplify/auth";
import { EP } from "./config";
import { uploadToS3 } from "./lib/upload";

async function getAuthHeader() {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export const api = {
  getPublicBooks: async () => {
    try {
      const res = await fetch(`${EP.books}?visibility=public`);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data)) return data;
      return data.books || [];
    } catch {
      return [];
    }
  },
  getMyBooks: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.booksMine, { headers });
    if (!res.ok) throw new Error("Failed to load your collection");
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.books || [];
  },
  getBookById: async (bookId) => {
    const headers = await getAuthHeader();
    const endpoint = headers.Authorization ? `${EP.books}/${bookId}/auth` : `${EP.books}/${bookId}`;
    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      if (res.status === 403) throw new Error("This book is in a private collection.");
      if (res.status === 404) throw new Error("Book not found.");
      throw new Error("Failed to load book details.");
    }
    return res.json();
  },
  getBookReadUrl: async (bookId) => {
    const headers = await getAuthHeader();
    const endpoint = headers.Authorization ? `${EP.books}/${bookId}/read-auth` : `${EP.books}/${bookId}/read`;
    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Unable to open reader for this book.");
    }
    return res.json();
  },
  createBook: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.books, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "CREATE_BOOK", payload })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create book");
    }
    return res.json();
  },
  updateBook: async (bookId, payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.books}/${bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "UPDATE_BOOK", payload: { bookId, ...payload } })
    });
    if (!res.ok) throw new Error("Failed to update book");
    return res.json();
  },
  deleteBook: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.books}/${bookId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "DELETE_BOOK", payload: { bookId } })
    });
    if (!res.ok) throw new Error("Failed to delete book");
    return res.json();
  },
  uploadCover: async (file, onProgress) => {
    const headers = await getAuthHeader();
    if (!headers.Authorization) {
      throw new Error("You must be signed in to upload a cover. Please sign in again.");
    }
    const name = file.name || "cover.jpg";
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "jpg";
    const contentType = file.type || (ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
    const res = await fetch(EP.uploadCover, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ extension: ext, contentType })
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("Your session expired. Please sign in again.");
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to prepare cover upload (${res.status})`);
    }
    const data = await res.json();
    // Use the content type the server signed into the presigned URL to guarantee they match
    await uploadToS3(data.uploadUrl, file, data.contentType || contentType, onProgress);
    return { coverKey: data.coverKey, publicUrl: data.publicUrl };
  },
  uploadBookFile: async (file, onProgress) => {
    const headers = await getAuthHeader();
    if (!headers.Authorization) {
      throw new Error("You must be signed in to upload a book. Please sign in again.");
    }
    const name = file.name || "book.epub";
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "epub";
    const contentType = file.type || "application/octet-stream";
    const res = await fetch(EP.uploadBook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        extension: ext,
        contentType,
        fileSizeBytes: file.size
      })
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("Your session expired. Please sign in again.");
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to prepare document upload (${res.status})`);
    }
    const data = await res.json();
    await uploadToS3(data.uploadUrl, file, data.contentType || contentType, onProgress);
    return { fileKey: data.fileKey, fileType: ext, fileSizeBytes: file.size };
  },
  getRequests: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.requests, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return data.requests || [];
  },
  createRequest: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.requests, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "CREATE_REQUEST", payload })
    });
    if (!res.ok) throw new Error("Failed to create request");
    return res.json();
  },
  deleteRequest: async (requestId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.requests}/${requestId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "DELETE_REQUEST", payload: { requestId } })
    });
    if (!res.ok) throw new Error("Failed to delete request");
    return res.json();
  },
  toggleUpvoteRequest: async (requestId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.requests}/${requestId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ operation: "TOGGLE_UPVOTE_REQUEST", payload: { requestId } })
    });
    if (!res.ok) throw new Error("Failed to update upvote");
    return res.json();
  },
  getNotifications: async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(EP.notifications, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return data.notifications || [];
    } catch {
      return [];
    }
  },
  markNotificationRead: async (notificationId) => {
    try {
      const headers = await getAuthHeader();
      await fetch(EP.notifications, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ operation: "MARK_NOTIFICATION_READ", notificationId })
      });
    } catch {}
  },
  getProfile: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.profile, { headers });
    if (!res.ok) return null;
    return res.json();
  },
  updateProfile: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.profile, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Failed to update profile");
    return res.json();
  },
  deleteProfile: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.profile, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Failed to delete profile");
    return res.json();
  },

  getProgress: async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(EP.progress, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return data.progress || [];
    } catch {
      return [];
    }
  },
  saveProgress: async (bookId, payload) => {
    try {
      const headers = await getAuthHeader();
      await fetch(`${EP.progress}/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(payload)
      });
    } catch {}
  },
  deleteProgress: async (bookId) => {
    try {
      const headers = await getAuthHeader();
      await fetch(`${EP.progress}/${bookId}`, { method: "DELETE", headers });
    } catch {}
  },

  adminGetStats: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminStats, { headers });
    if (!res.ok) throw new Error("Failed to load stats");
    return res.json();
  },
  getAnnouncement: async () => {
    try {
      const res = await fetch(EP.announcement);
      if (!res.ok) return { active: false };
      return res.json();
    } catch {
      return { active: false };
    }
  },
  adminSetAnnouncement: async (message) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminAnnouncement, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("Failed to publish announcement");
    return res.json();
  },
  adminClearAnnouncement: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminAnnouncement, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Failed to clear announcement");
    return res.json();
  },
  adminGetAuditLog: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminAuditLog, { headers });
    if (!res.ok) throw new Error("Failed to load audit log");
    const data = await res.json();
    return data.entries || [];
  },
  adminGetUsers: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminUsers, { headers });
    if (!res.ok) throw new Error("Failed to load users");
    const data = await res.json();
    return data.users || [];
  },
  adminCreateUser: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminUsers, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to create user");
    return res.json();
  },
  adminUpdateUser: async (userId, payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminUsers}/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update user");
    return res.json();
  },
  adminDeleteUser: async (userId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminUsers}/${userId}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Failed to delete user");
    return res.json();
  },
  adminBatchDeleteUsers: async (userIds) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminUsers}/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ userIds }),
    });
    if (!res.ok) throw new Error("Failed to delete users");
    return res.json();
  },
  adminToggleUser: async (userId, action) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminUsers}/${userId}/${action}`, { method: "PUT", headers });
    if (!res.ok) throw new Error(`Failed to ${action} user`);
    return res.json();
  },
  adminGetBooks: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminBooks, { headers });
    if (!res.ok) throw new Error("Failed to load books");
    const data = await res.json();
    return data.books || [];
  },
  adminCreateBook: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminBooks, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create book");
    return res.json();
  },
  adminUpdateBook: async (bookId, payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminBooks}/${bookId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update book");
    return res.json();
  },
  adminDeleteBook: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminBooks}/${bookId}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Failed to delete book");
    return res.json();
  },
  adminApproveBook: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminBooks}/${bookId}/approve`, { method: "PUT", headers });
    if (!res.ok) throw new Error("Failed to approve book");
    return res.json();
  },
  adminRejectBook: async (bookId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminBooks}/${bookId}/reject`, { method: "PUT", headers });
    if (!res.ok) throw new Error("Failed to reject book");
    return res.json();
  },
  adminBatchDeleteBooks: async (bookIds) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminBooks}/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ bookIds }),
    });
    if (!res.ok) throw new Error("Failed to delete books");
    return res.json();
  },
  adminGetRequests: async () => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminRequests, { headers });
    if (!res.ok) throw new Error("Failed to load requests");
    const data = await res.json();
    return data.requests || [];
  },
  adminCreateRequest: async (payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(EP.adminRequests, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to create request");
    return res.json();
  },
  adminUpdateRequest: async (requestId, payload) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminRequests}/${requestId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update request");
    return res.json();
  },
  adminDeleteRequest: async (requestId) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminRequests}/${requestId}`, { method: "DELETE", headers });
    if (!res.ok) throw new Error("Failed to delete request");
    return res.json();
  },
  adminBatchDeleteRequests: async (requestIds) => {
    const headers = await getAuthHeader();
    const res = await fetch(`${EP.adminRequests}/batch-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ requestIds }),
    });
    if (!res.ok) throw new Error("Failed to delete requests");
    return res.json();
  },
};
