
// ── S3 DIRECT UPLOAD HELPER (CROSS-PLATFORM & MOBILE COMPATIBLE) ──────────────
export function uploadToS3(uploadUrl, file, contentType, onProgress) {
  return new Promise(async (resolve, reject) => {
    try {
      // 1. Read file into memory (ArrayBuffer/Blob) to bypass Android content:// stream locking bugs
      let payload = file;
      try {
        if (file.arrayBuffer) {
          const buffer = await file.arrayBuffer();
          payload = new Blob([buffer], { type: contentType || file.type || "application/octet-stream" });
        }
      } catch (err) {
        console.warn("ArrayBuffer read failed, falling back to raw File:", err);
      }

      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);

      if (contentType) {
        xhr.setRequestHeader("Content-Type", contentType);
      }

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Storage upload failed with status ${xhr.status}: ${xhr.statusText || 'Forbidden'}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Network error uploading file to storage. Please verify your connection."));
      };

      xhr.ontimeout = () => {
        reject(new Error("Storage upload timed out."));
      };

      xhr.send(payload);
    } catch (err) {
      reject(err);
    }
  });
}
