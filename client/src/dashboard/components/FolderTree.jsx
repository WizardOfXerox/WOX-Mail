import { getFolderIcon } from './Sidebar.jsx';
import React, { useState, useCallback } from 'react';

/**
 * Folder tree sidebar with drag-and-drop move-to-folder support.
 * System folders (Inbox, Sent, Drafts, Spam, Trash) + custom folders.
 */
export default function FolderTree({
  folders = [],
  activeFolder,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  unreadCounts = {},
  onDrop,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [dragOverFolder, setDragOverFolder] = useState(null);

  const systemFolders = [
    { name: 'INBOX', label: 'Inbox' },
    { name: 'Sent', label: 'Sent' },
    { name: 'Drafts', label: 'Drafts' },
    { name: 'Spam', label: 'Spam' },
    { name: 'Trash', label: 'Trash' },
  ];

  const customFolders = (folders || []).filter((f) => {
    if (!f) return false;
    const fName = (typeof f === 'string' ? f : f.name || f.path || '').toLowerCase();
    return fName && !systemFolders.some((s) => s.name.toLowerCase() === fName);
  });

  const handleCreate = () => {
    if (newName.trim()) {
      onCreateFolder?.(newName.trim());
      setNewName('');
      setCreating(false);
    }
  };

  const handleRename = (oldName) => {
    if (editName.trim() && editName !== oldName) {
      onRenameFolder?.(oldName, editName.trim());
    }
    setEditingId(null);
  };

  const handleDragOver = useCallback((e, folderName) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolder(folderName);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverFolder(null);
  }, []);

  const handleDrop = useCallback((e, folderName) => {
    e.preventDefault();
    setDragOverFolder(null);
    const data = e.dataTransfer.getData('application/json');
    if (data) {
      try {
        const { uids } = JSON.parse(data);
        onDrop?.(uids, folderName);
      } catch {}
    }
  }, [onDrop]);

  const renderFolder = (folder, isSystem = false) => {
    const name = isSystem ? folder.name : folder.name || folder;
    const label = isSystem ? folder.label : name;
    const icon = getFolderIcon(name);
    const unread = unreadCounts[name] || 0;
    const isActive = activeFolder === name;
    const isDragOver = dragOverFolder === name;

    return (
      <div
        key={name}
        className={`folder-item ${isActive ? 'active' : ''} ${isDragOver ? 'drag-over' : ''}`}
        onClick={() => onSelectFolder?.(name)}
        onDragOver={(e) => handleDragOver(e, name)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, name)}
      >
        <span className="folder-icon" style={{ display: "inline-flex", alignItems: "center" }}>{icon}</span>

        {editingId === name ? (
          <input
            className="folder-edit-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => handleRename(name)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename(name)}
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="folder-label">{label}</span>
        )}

        {unread > 0 && <span className="folder-badge">{unread}</span>}

        {!isSystem && (
          <div className="folder-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="folder-action-btn"
              onClick={() => { setEditingId(name); setEditName(name); }}
              title="Rename"
             title="Rename"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
            <button
              className="folder-action-btn"
              onClick={() => onDeleteFolder?.(name)}
              title="Delete"
             title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="folder-tree">
      <div className="folder-section">
        {systemFolders.map((f) => renderFolder(f, true))}
      </div>

      {customFolders.length > 0 && (
        <div className="folder-section">
          <div className="folder-section-title">Folders</div>
          {customFolders.map((f) => renderFolder(f))}
        </div>
      )}

      {creating ? (
        <div className="folder-create-form">
          <input
            className="folder-create-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Folder name"
            autoFocus
          />
          <button className="btn btn-sm btn-primary" onClick={handleCreate}>Add</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setCreating(false)}>✕</button>
        </div>
      ) : (
        <button className="folder-add-btn" onClick={() => setCreating(true)}>
          + New Folder
        </button>
      )}
    </div>
  );
}
