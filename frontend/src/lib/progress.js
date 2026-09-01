import { api } from "../api";

// ── READING PROGRESS INDEX ────────────────────────────────────────────────────
// localStorage is the instant, per-device cache. When the user is signed in we
// also mirror progress to DynamoDB (via the /progress API) so "Continue Reading"
// and resume positions follow them across devices.
export const readingListKey = (userId) => `obsidian_reading_list_${userId || "guest"}`;

export function getReadingList(userId) {
  try { return JSON.parse(localStorage.getItem(readingListKey(userId))) || []; }
  catch { return []; }
}

// Insert or update a book's reading progress. `entry` must include bookId; other
// fields (title, author, fileType, percent) are merged over any existing record.
export function upsertReadingProgress(userId, entry) {
  if (!entry || !entry.bookId) return;
  try {
    const list = getReadingList(userId);
    const idx = list.findIndex(e => e.bookId === entry.bookId);
    const merged = { ...(idx >= 0 ? list[idx] : {}), ...entry, updatedAt: Date.now() };
    if (idx >= 0) list[idx] = merged; else list.push(merged);
    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    localStorage.setItem(readingListKey(userId), JSON.stringify(list.slice(0, 60)));
  } catch {}
}

// ── Cloud sync (only for signed-in users; "guest" stays local-only) ───────────
const _syncTimers = {};

// Debounced push of one book's progress to DynamoDB. Reading fires this on every
// page turn, so we coalesce rapid updates into one write every ~4s per book.
export function syncProgressToCloud(userId, entry) {
  if (!userId || userId === "guest" || !entry?.bookId) return;
  clearTimeout(_syncTimers[entry.bookId]);
  _syncTimers[entry.bookId] = setTimeout(() => {
    api.saveProgress(entry.bookId, {
      percent: entry.percent || 0,
      position: entry.position || "",
      fileType: entry.fileType || "",
      title: entry.title || "",
      author: entry.author || "",
    });
  }, 4000);
}

// Pull ONE book's saved position from the cloud and seed the local resume key,
// so opening a book directly on a fresh device (without visiting the library
// first) still continues where another device left off. Local wins if present.
export async function hydrateBookPosition(userId, bookId) {
  if (!userId || userId === "guest" || !bookId) return;
  try {
    const remote = await api.getProgress();
    const e = remote.find(r => r.bookId === bookId);
    if (!e || !e.position) return;
    const key = e.fileType === "pdf"
      ? `obsidian_pdfpage_${bookId}_${userId}`
      : `obsidian_pos_${bookId}_${userId}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, e.position);
  } catch {}
}

// Fetch cloud progress and merge it with the local list (most-recent wins per
// book). Used by the library so the shelf reflects reads from any device.
export async function loadMergedReadingList(userId) {
  const local = getReadingList(userId);
  if (!userId || userId === "guest") return local;

  let remote = [];
  try { remote = await api.getProgress(); } catch { remote = []; }

  const byId = {};
  for (const e of local) byId[e.bookId] = { ...e };
  for (const r of remote) {
    const existing = byId[r.bookId];
    const rUpdated = Number(r.updatedAt) || 0;
    if (!existing || rUpdated >= (existing.updatedAt || 0)) {
      byId[r.bookId] = {
        bookId: r.bookId,
        title: r.title,
        author: r.author,
        fileType: r.fileType,
        percent: Number(r.percent) || 0,
        position: r.position || "",
        updatedAt: rUpdated || existing?.updatedAt || 0,
      };
    }
  }

  const merged = Object.values(byId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  try {
    // Refresh the local cache so subsequent loads are instant and offline-friendly
    localStorage.setItem(readingListKey(userId), JSON.stringify(merged.slice(0, 60)));
    // Hydrate per-book resume positions so opening the reader on THIS device
    // continues where the user left off on another device.
    for (const e of merged) {
      if (!e.position) continue;
      const key = e.fileType === "pdf"
        ? `obsidian_pdfpage_${e.bookId}_${userId}`
        : `obsidian_pos_${e.bookId}_${userId}`;
      if (!localStorage.getItem(key)) localStorage.setItem(key, e.position);
    }
  } catch {}
  return merged;
}
