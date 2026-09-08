import { useState, useEffect, useRef } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";

// Admin deletes used a native window.confirm(): unstyled, jarring against the
// rest of the app, and impossible to make say anything useful. The wording was
// also inconsistent - deleting a request never warned it was permanent while
// deleting a book did - so the weakest guard sat on actions that destroy other
// people's data, while the strongest (type DELETE) sat on deleting your own
// account, which only affects you.
//
// `confirmText` turns this into a type-to-confirm dialog. Bulk actions use it;
// single deletes do not, so the friction matches the blast radius.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Delete",
  confirmText = null,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [typed, setTyped] = useState("");
  const boxRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) { setTyped(""); return; }
    previousFocusRef.current = document.activeElement;
    const node = boxRef.current;
    const focusable = () => Array.from(
      node?.querySelectorAll('button:not([disabled]), input:not([disabled])') || []
    );
    focusable()[0]?.focus();

    const onKeyDown = (e) => {
      if (e.key === "Escape") { onCancel?.(); return; }
      if (e.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  const satisfied = !confirmText || typed.trim() === confirmText;

  return (
    <div className="admin-modal-overlay" onClick={onCancel}>
      <div
        className="admin-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        ref={boxRef}
      >
        <div className="admin-modal-header">
          <h3 id="confirm-dialog-title" className="admin-modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {destructive && <AlertTriangle size={17} color="#f87171" />}
            {title}
          </h3>
          <button className="admin-modal-close" onClick={onCancel} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: 13.5, color: "#a1a1aa", lineHeight: 1.6, marginBottom: 16 }}>
          {body}
        </div>

        {confirmText && (
          <div className="admin-field">
            <label className="admin-field-label" htmlFor="confirm-dialog-input">
              Type <strong style={{ color: "#e4e4e7" }}>{confirmText}</strong> to confirm
            </label>
            <input
              id="confirm-dialog-input"
              className="admin-field-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              placeholder={confirmText}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className={destructive ? "btn btn-danger" : "btn btn-primary"}
            onClick={onConfirm}
            disabled={!satisfied || busy}
          >
            {busy ? <Loader2 size={14} className="spin" /> : null} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Promise-based wrapper so a call site reads like the window.confirm() it
// replaces: `if (!(await confirm({...}))) return;`
export function useConfirm() {
  const [pending, setPending] = useState(null);

  const confirm = (props) =>
    new Promise((resolve) => setPending({ props, resolve }));

  const settle = (value) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = (
    <ConfirmDialog
      open={!!pending}
      {...(pending?.props || {})}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return [confirm, dialog];
}
