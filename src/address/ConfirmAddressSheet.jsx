import { useEffect, useRef } from 'react';

/**
 * Final gate before submit. Showing the assembled delivery label is the
 * highest-yield nudge in the flow: people fix vague addresses when they see
 * what the courier will read, and they abandon when they see red errors.
 */
export default function ConfirmAddressSheet({ lines, warnings = [], onEdit, onConfirm, submitting }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onEdit();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEdit]);

  return (
    <div className="eq-sheet__scrim" onMouseDown={(e) => e.target === e.currentTarget && onEdit()}>
      <div className="eq-sheet" role="dialog" aria-modal="true" aria-labelledby="eq-sheet-title">
        <div className="eq-sheet__grip" aria-hidden="true" />
        <div className="eq-sheet__head">
          <h2 id="eq-sheet-title">Confirm your address</h2>
          <button type="button" className="eq-sheet__close" onClick={onEdit} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="eq-sheet__sub">Your card and all documents will be delivered here.</p>

        <address className="eq-label">
          {lines.map((line, i) => (
            <span key={i}>{line}</span>
          ))}
        </address>

        {warnings.length > 0 && (
          <ul className="eq-sheet__warn">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        <div className="eq-sheet__actions">
          <button type="button" className="eq-btn eq-btn--ghost" onClick={onEdit}>
            Edit address
          </button>
          <button
            type="button"
            ref={confirmRef}
            className="eq-btn eq-btn--primary"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
