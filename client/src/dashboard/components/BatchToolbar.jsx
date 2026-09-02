import React, { useState, useRef, useEffect } from 'react';
import SnoozePopover from './SnoozePopover.jsx';
import FolderMovePopover from './FolderMovePopover.jsx';

/**
 * Batch action toolbar — sleek, compact single-row floating action ribbon
 */
export default function BatchToolbar({
  selectedCount,
  onArchive,
  onDelete,
  onSnooze,
  onMove,
  onStar,
  onMarkRead,
  onMarkUnread,
  onSpam,
  onSelectAll,
  onDeselectAll,
  totalCount,
  folders = [],
  currentFolder = 'INBOX',
}) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMore(false);
      }
    };
    if (showMore) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMore]);

  if (selectedCount === 0) return null;

  return (
    <div className="batch-toolbar" role="toolbar" aria-label="Batch actions">
      <div className="batch-info">
        <span className="badge badge-purple" style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem', fontWeight: 700 }}>
          {selectedCount} selected
        </span>
        {totalCount && selectedCount < totalCount ? (
          <button type="button" className="batch-select-pill" onClick={onSelectAll} title="Select all messages">
            Select all {totalCount}
          </button>
        ) : (
          <button type="button" className="batch-select-pill" onClick={onDeselectAll} title="Clear selection">
            Clear
          </button>
        )}
      </div>

      <div className="batch-actions">
        {/* Quick Star */}
        {onStar && (
          <button type="button" className="batch-action-btn" onClick={onStar} title="Star / Flag selected (s)" aria-label="Star selected">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
        )}

        {/* Quick Archive */}
        {onArchive && (
          <button type="button" className="batch-action-btn" onClick={onArchive} title="Archive selected (e)" aria-label="Archive selected">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
          </button>
        )}

        {/* Quick Delete */}
        {onDelete && (
          <button type="button" className="batch-action-btn batch-btn-danger" onClick={onDelete} title="Delete selected (#)" aria-label="Delete selected">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </button>
        )}

        {/* Mark Read Quick Button */}
        {onMarkRead && (
          <button type="button" className="batch-action-btn" onClick={onMarkRead} title="Mark selected as read" aria-label="Mark selected as read">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
        )}

        {/* Snooze Popover Anchor */}
        {onSnooze && showSnooze && (
          <SnoozePopover
            onSelect={(isoDate) => {
              setShowSnooze(false);
              onSnooze(isoDate);
            }}
            onClose={() => setShowSnooze(false)}
            anchorRect={moreRef.current?.getBoundingClientRect()}
          />
        )}

        {/* Move Folder Popover Anchor */}
        {onMove && showMove && (
          <FolderMovePopover
            folders={folders}
            currentFolder={currentFolder}
            onSelectFolder={(target) => {
              setShowMove(false);
              onMove(target);
            }}
            onClose={() => setShowMove(false)}
            anchorRect={moreRef.current?.getBoundingClientRect()}
          />
        )}

        {/* More Actions (•••) Dropdown */}
        <div ref={moreRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            className={`batch-action-btn ${showMore ? 'active' : ''}`}
            onClick={() => setShowMore(!showMore)}
            title="More batch actions"
            aria-label="More actions"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>
          </button>

          {showMore && (
            <div
              className="batch-more-dropdown"
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '0.4rem',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: '0.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
                minWidth: '180px',
                zIndex: 1000,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              }}
            >
              {onSnooze && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setShowMore(false);
                    setShowSnooze(true);
                  }}
                  style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>Snooze Selected</span>
                </button>
              )}

              {onMove && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setShowMore(false);
                    setShowMove(true);
                  }}
                  style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.78rem' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '0.45rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
                  <span>Move to Folder</span>
                </button>
              )}

              {onMarkUnread && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setShowMore(false);
                    onMarkUnread();
                  }}
                  style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.78rem' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '0.45rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
                  <span>Mark as Unread</span>
                </button>
              )}

              {onSpam && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setShowMore(false);
                    onSpam();
                  }}
                  style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.78rem', color: 'var(--color-warning)' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: '0.45rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
                  <span>Report as Spam</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
