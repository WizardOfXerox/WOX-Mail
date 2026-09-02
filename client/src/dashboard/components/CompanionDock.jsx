import React, { useState, useEffect, useMemo } from 'react';
import { get, post, del, put } from '../../shared/api.js';

/**
 * Enhanced Slide-Over Productivity Companion Hub
 * 
 * Features:
 * 1. 📅 Interactive Mini-Calendar & Agenda Timeline (with month grid, dots, presets & email-to-event)
 * 2. 📝 AES-256 Encrypted Notes & Interactive Checklists Vault (multi-note, colors, pin, sync)
 * 3. 👥 Contacts Directory & People Hub (quick add, VIP stars, SMS, copy & filter inbox)
 * 4. ⚡ In-Dock Disposable Burner Inbox (live message viewer, lifetime presets, extend & self-destruct)
 */
export default function CompanionDock({ user, onClose, onComposeTo, activeMessage, onFilterBySender }) {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('woxmail_dock_tab') || 'agenda';
  });

  const switchTab = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('woxmail_dock_tab', tab);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 1. AGENDA & MINI-CALENDAR STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [currentCalMonth, setCurrentCalMonth] = useState(() => new Date());
  const [selectedCalDate, setSelectedCalDate] = useState(() => new Date());
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [eventDuration, setEventDuration] = useState('60'); // minutes
  const [eventCategory, setEventCategory] = useState('purple'); // purple, emerald, sky, rose
  const [eventLocation, setEventLocation] = useState('');

  const fetchEvents = () => {
    setLoadingEvents(true);
    fetch('/api/calendar/events', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoadingEvents(false));
  };

  useEffect(() => {
    if (activeTab === 'agenda') {
      fetchEvents();
    }
  }, [activeTab]);

  // Mini-Calendar calculations
  const calendarGrid = useMemo(() => {
    const year = currentCalMonth.getFullYear();
    const month = currentCalMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];
    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }
    // Next month filler days to complete 35 or 42 cells
    const remaining = 35 - days.length >= 0 ? 35 - days.length : 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
      });
    }
    return days;
  }, [currentCalMonth]);

  // Dates with scheduled events for dot markers
  const eventDateSet = useMemo(() => {
    const set = new Set();
    events.forEach((ev) => {
      if (ev.start_time) {
        const d = new Date(ev.start_time);
        set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
      }
    });
    return set;
  }, [events]);

  const handlePrevMonth = () => {
    setCurrentCalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentCalMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDay = (dayObj) => {
    setSelectedCalDate(dayObj.date);
    const d = new Date(dayObj.date);
    d.setHours(new Date().getHours() + 1, 0, 0, 0);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    setEventStart(d.toISOString().slice(0, 16));
  };

  const applyEventPreset = (preset) => {
    const now = new Date();
    if (preset === '1h') {
      now.setHours(now.getHours() + 1, 0, 0, 0);
    } else if (preset === 'tomorrow9') {
      now.setDate(now.getDate() + 1);
      now.setHours(9, 0, 0, 0);
    } else if (preset === 'friday3') {
      const day = now.getDay();
      const diff = (5 - day + 7) % 7 || 7;
      now.setDate(now.getDate() + diff);
      now.setHours(15, 0, 0, 0);
    }
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setEventStart(now.toISOString().slice(0, 16));
    setShowEventForm(true);
  };

  const handleCreateEventFromEmail = () => {
    if (!activeMessage) return;
    setEventTitle(`Follow-up: ${activeMessage.subject || 'Email discussion'}`);
    const sender = activeMessage.from?.address || activeMessage.from?.name || '';
    setEventLocation(sender ? `With: ${sender}` : '');
    applyEventPreset('tomorrow9');
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    const startDate = new Date(eventStart);
    const endDate = new Date(startDate.getTime() + parseInt(eventDuration, 10) * 60000);

    const categoryColors = {
      purple: '#7c3aed',
      emerald: '#10b981',
      sky: '#0284c7',
      rose: '#ef4444',
    };

    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: eventTitle.trim(),
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          color: categoryColors[eventCategory] || '#7c3aed',
          location: eventLocation.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.event) {
        setEvents((prev) => [data.event, ...prev]);
        setEventTitle('');
        setEventLocation('');
        setShowEventForm(false);
        if (window.WoxToast) window.WoxToast.success('Event added to calendar');
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to create event: ' + err.message);
    }
  };

  const handleDeleteEvent = async (id) => {
    try {
      await fetch(`/api/calendar/events/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      if (window.WoxToast) window.WoxToast.info('Event removed');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to delete event');
    }
  };

  // Filter events for selected date
  const selectedDayEvents = useMemo(() => {
    const selYear = selectedCalDate.getFullYear();
    const selMonth = selectedCalDate.getMonth();
    const selDay = selectedCalDate.getDate();

    return events.filter((ev) => {
      if (!ev.start_time) return false;
      const d = new Date(ev.start_time);
      return d.getFullYear() === selYear && d.getMonth() === selMonth && d.getDate() === selDay;
    });
  }, [events, selectedCalDate]);

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ENCRYPTED NOTES & CHECKLIST VAULT STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [vaultNotes, setVaultNotes] = useState([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [noteSearch, setNoteSearch] = useState('');
  const [newChecklistInput, setNewChecklistInput] = useState('');

  const fetchVaultNotes = () => {
    setLoadingNotes(true);
    fetch('/api/notes/vault', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.notes) {
          setVaultNotes(d.notes);
          if (d.notes.length > 0 && !selectedNoteId) {
            setSelectedNoteId(d.notes[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingNotes(false));
  };

  useEffect(() => {
    if (activeTab === 'scratchpad') {
      fetchVaultNotes();
    }
  }, [activeTab]);

  const activeNote = useMemo(() => {
    return vaultNotes.find((n) => n.id === selectedNoteId) || null;
  }, [vaultNotes, selectedNoteId]);

  const handleCreateNote = async (isChecklist = false) => {
    const defaultTitle = isChecklist ? 'New Checklist' : 'Quick Note';
    const defaultContent = isChecklist
      ? JSON.stringify([{ id: '1', text: 'First task', done: false }])
      : '';

    try {
      const res = await fetch('/api/notes/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: defaultTitle,
          content: defaultContent,
          color: isChecklist ? 'emerald' : 'purple',
          isPinned: false,
          isChecklist,
        }),
      });
      const data = await res.json();
      if (data.note) {
        setVaultNotes((prev) => [data.note, ...prev]);
        setSelectedNoteId(data.note.id);
        if (window.WoxToast) window.WoxToast.success(`Created ${isChecklist ? 'checklist' : 'note'}`);
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to create note');
    }
  };

  const handleUpdateActiveNote = async (updates) => {
    if (!activeNote) return;
    const updated = { ...activeNote, ...updates };

    // Update local state immediately for zero latency
    setVaultNotes((prev) => prev.map((n) => (n.id === activeNote.id ? updated : n)));

    // Debounced or direct API sync
    try {
      await fetch(`/api/notes/vault/${activeNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error('Note auto-save error:', err);
    }
  };

  const handleDeleteActiveNote = async (id) => {
    try {
      await fetch(`/api/notes/vault/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const remaining = vaultNotes.filter((n) => n.id !== id);
      setVaultNotes(remaining);
      setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
      if (window.WoxToast) window.WoxToast.info('Note deleted');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to delete note');
    }
  };

  const handleTogglePin = (note) => {
    handleUpdateActiveNote({ isPinned: !note.isPinned });
  };

  const handleAttachNoteToEmail = () => {
    if (!activeMessage || !activeNote) return;
    const uidStr = String(activeMessage.uid);
    handleUpdateActiveNote({
      linkedMessageUid: uidStr,
      title: (activeNote.title === 'Quick Note' || activeNote.title === '📝 Quick Note') ? `Note: ${activeMessage.subject || 'Conversation'}` : activeNote.title,
    });
    if (window.WoxToast) window.WoxToast.success('Note linked to this email thread');
  };

  // Checklist Helpers
  const checklistItems = useMemo(() => {
    if (!activeNote || !activeNote.isChecklist) return [];
    try {
      const parsed = JSON.parse(activeNote.content || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }, [activeNote]);

  const handleToggleChecklistItem = (itemId) => {
    const updated = checklistItems.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    handleUpdateActiveNote({ content: JSON.stringify(updated) });
  };

  const handleAddChecklistItem = (e) => {
    e.preventDefault();
    if (!newChecklistInput.trim()) return;
    const newItem = {
      id: Date.now().toString(),
      text: newChecklistInput.trim(),
      done: false,
    };
    const updated = [...checklistItems, newItem];
    handleUpdateActiveNote({ content: JSON.stringify(updated) });
    setNewChecklistInput('');
  };

  const handleDeleteChecklistItem = (itemId) => {
    const updated = checklistItems.filter((item) => item.id !== itemId);
    handleUpdateActiveNote({ content: JSON.stringify(updated) });
  };

  const filteredNotes = useMemo(() => {
    if (!noteSearch.trim()) return vaultNotes;
    const q = noteSearch.toLowerCase();
    return vaultNotes.filter(
      (n) => (n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
    );
  }, [vaultNotes, noteSearch]);

  // ══════════════════════════════════════════════════════════════════════════
  // 3. CONTACTS & PEOPLE HUB STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactIsVip, setContactIsVip] = useState(false);

  const fetchContacts = () => {
    setLoadingContacts(true);
    fetch('/api/settings/contacts', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts || []))
      .catch(() => {})
      .finally(() => setLoadingContacts(false));
  };

  useEffect(() => {
    if (activeTab === 'contacts') {
      fetchContacts();
    }
  }, [activeTab]);

  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!contactEmail.trim()) return;

    try {
      const res = await fetch('/api/settings/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: contactName.trim() || undefined,
          email: contactEmail.trim().toLowerCase(),
          phone: contactPhone.trim() || undefined,
          isVip: contactIsVip,
        }),
      });
      const data = await res.json();
      if (data.contact) {
        setContacts((prev) => [data.contact, ...prev]);
        setContactName('');
        setContactEmail('');
        setContactPhone('');
        setContactIsVip(false);
        setShowAddContact(false);
        if (window.WoxToast) window.WoxToast.success('Contact saved');
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to save contact');
    }
  };

  const handleDeleteContact = async (id) => {
    try {
      await fetch(`/api/settings/contacts/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setContacts((prev) => prev.filter((c) => c.id !== id));
      if (window.WoxToast) window.WoxToast.info('Contact removed');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to remove contact');
    }
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.toLowerCase();
    const list = contacts.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
    );
    // Sort VIP contacts to top
    return list.sort((a, b) => (b.is_vip ? 1 : 0) - (a.is_vip ? 1 : 0));
  }, [contacts, contactSearch]);

  // ══════════════════════════════════════════════════════════════════════════
  // 4. DISPOSABLE BURNER & IN-DOCK INBOX STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [tempAddress, setTempAddress] = useState(null);
  const [tempExpiresAt, setTempExpiresAt] = useState(null);
  const [generatingTemp, setGeneratingTemp] = useState(false);
  const [copiedTemp, setCopiedTemp] = useState(false);
  const [tempMessages, setTempMessages] = useState([]);
  const [loadingTempMessages, setLoadingTempMessages] = useState(false);
  const [selectedBurnerExpiry, setSelectedBurnerExpiry] = useState(24); // hours
  const [selectedTempDomain, setSelectedTempDomain] = useState('mail.wox.world');
  const [expandedMsgUid, setExpandedMsgUid] = useState(null);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customHandle, setCustomHandle] = useState('');

  const fetchTempSession = () => {
    get('/tempmail/session')
      .then((d) => {
        if (d && d.active && d.address) {
          setTempAddress(d.address);
          setTempExpiresAt(d.expiresAt);
          fetchBurnerInbox(d.address);
        } else {
          setTempAddress(null);
          setTempExpiresAt(null);
          setTempMessages([]);
        }
      })
      .catch(() => {
        setTempAddress(null);
        setTempExpiresAt(null);
        setTempMessages([]);
      });
  };

  const fetchBurnerInbox = (address) => {
    if (!address) return;
    setLoadingTempMessages(true);
    get(`/tempmail/inbox/${encodeURIComponent(address)}`)
      .then((d) => {
        if (d && d.messages) {
          setTempMessages(d.messages);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTempMessages(false));
  };

  useEffect(() => {
    if (activeTab === 'tempmail') {
      fetchTempSession();
    }
  }, [activeTab]);

  const handleGenerateTemp = async (customName = null, domainChoice = null) => {
    setGeneratingTemp(true);
    try {
      const payload = {
        expiryHours: selectedBurnerExpiry,
        domain: domainChoice || selectedTempDomain,
        forceNew: true,
        captchaToken: 'dev-bypass',
      };
      if (customName && typeof customName === 'string' && customName.trim()) {
        const cleanName = customName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanName.length < 3) {
          if (window.WoxToast) window.WoxToast.error('Custom handle must be at least 3 alphanumeric characters');
          setGeneratingTemp(false);
          return;
        }
        payload.username = cleanName;
      }

      const data = await post('/tempmail/generate', payload);
      if (data.error) {
        if (window.WoxToast) window.WoxToast.error(data.error);
        return;
      }
      if (data.address) {
        setTempAddress(data.address);
        setTempExpiresAt(data.expiresAt);
        setTempMessages([]);
        setCustomHandle('');
        setIsCustomMode(false);
        if (window.WoxToast) window.WoxToast.success(`Burner active: ${data.address}`);
        fetchBurnerInbox(data.address);
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to generate temp address');
    } finally {
      setGeneratingTemp(false);
    }
  };

  const handleExtendBurner = async (addHours = 1) => {
    if (!tempAddress) return;
    try {
      const data = await post('/tempmail/extend', { address: tempAddress, addHours });
      if (data.expiresAt) {
        setTempExpiresAt(data.expiresAt);
        if (window.WoxToast) window.WoxToast.success(`Extended by +${addHours}h`);
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to extend lifetime');
    }
  };

  const handleSelfDestructBurner = async () => {
    if (!tempAddress) return;
    const targetAddr = tempAddress;
    // Wipe local state immediately so UI updates instantly
    setTempAddress(null);
    setTempExpiresAt(null);
    setTempMessages([]);
    setCustomHandle('');
    try {
      localStorage.removeItem('woxmail_temp_addr');
      localStorage.removeItem('woxmail_temp_expiry');
      sessionStorage.removeItem('woxmail_temp_addr');
      document.cookie = 'woxmail_temp=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
    } catch (e) {}
    try {
      await del(`/tempmail/delete/${encodeURIComponent(targetAddr)}`);
    } catch (err) {
      console.error('Destroy error:', err);
    }
    if (window.WoxToast) window.WoxToast.info('Burner mailbox purged & destroyed');
  };

  const handleCopyTemp = () => {
    if (!tempAddress) return;
    navigator.clipboard.writeText(tempAddress);
    setCopiedTemp(true);
    setTimeout(() => setCopiedTemp(false), 2000);
    if (window.WoxToast) window.WoxToast.success('Address copied');
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 5. CONTACT INTELLIGENCE & DOSSIER STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [dossierData, setDossierData] = useState(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [dossierEmailInput, setDossierEmailInput] = useState('');

  const targetDossierEmail = useMemo(() => {
    if (dossierEmailInput.trim()) return dossierEmailInput.trim();
    if (activeMessage) {
      const fromAddr = typeof activeMessage.from === 'object' ? (activeMessage.from?.address || '') : String(activeMessage.from || '');
      return fromAddr;
    }
    return '';
  }, [dossierEmailInput, activeMessage]);

  const fetchDossier = async (email) => {
    if (!email || !email.includes('@')) return;
    setLoadingDossier(true);
    try {
      const res = await get(`/dossier/${encodeURIComponent(email)}`);
      if (res && res.dossier) setDossierData(res.dossier);
    } catch {
      setDossierData(null);
    } finally {
      setLoadingDossier(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dossier' && targetDossierEmail) {
      fetchDossier(targetDossierEmail);
    }
  }, [activeTab, targetDossierEmail]);

  // ══════════════════════════════════════════════════════════════════════════
  // 6. SNIPPETS & SLASH MACROS STATE
  // ══════════════════════════════════════════════════════════════════════════
  const [snippets, setSnippets] = useState([]);
  const [loadingSnippets, setLoadingSnippets] = useState(false);
  const [showSnippetForm, setShowSnippetForm] = useState(false);
  const [snippetShortcut, setSnippetShortcut] = useState('');
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetContent, setSnippetContent] = useState('');

  const fetchSnippets = async () => {
    setLoadingSnippets(true);
    try {
      const res = await get('/snippets');
      if (res && res.snippets) setSnippets(res.snippets);
    } catch {} finally {
      setLoadingSnippets(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'snippets') {
      fetchSnippets();
    }
  }, [activeTab]);

  const handleCreateSnippet = async (e) => {
    e.preventDefault();
    if (!snippetShortcut || !snippetTitle || !snippetContent) return;
    try {
      const res = await post('/snippets', {
        shortcut: snippetShortcut,
        title: snippetTitle,
        contentHtml: snippetContent,
      });
      if (res && res.snippet) {
        setSnippets((prev) => [...prev, res.snippet]);
        setSnippetShortcut('');
        setSnippetTitle('');
        setSnippetContent('');
        setShowSnippetForm(false);
        if (window.WoxToast) window.WoxToast.success('Snippet macro created');
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to create snippet');
    }
  };

  const handleDeleteSnippet = async (id) => {
    try {
      await del(`/snippets/${id}`);
      setSnippets((prev) => prev.filter((s) => s.id !== id));
      if (window.WoxToast) window.WoxToast.info('Snippet deleted');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to delete snippet');
    }
  };

  return (
    <aside className="companion-dock-drawer" aria-label="Productivity companion dock">
      {/* Dock Top Banner */}
      <div className="dock-top-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-primary-light)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          </span>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Productivity Hub</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-xs dock-close-btn"
            onClick={onClose}
            aria-label="Close productivity dock"
            title="Close Hub (Esc or Ctrl+.)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Segmented Pill Tabs */}
      <div className="dock-tabs-scroller">
        <div className="dock-tabs-pill-group">
          <button
            type="button"
            className={`dock-tab-pill ${activeTab === 'agenda' ? 'active' : ''}`}
            onClick={() => switchTab('agenda')}
            title="Calendar & Agenda"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>Agenda</span>
          </button>
          <button
            type="button"
            className={`dock-tab-pill ${activeTab === 'scratchpad' ? 'active' : ''}`}
            onClick={() => switchTab('scratchpad')}
            title="Encrypted Notes & Checklists"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>Notes</span>
          </button>
          <button
            type="button"
            className={`dock-tab-pill ${activeTab === 'dossier' ? 'active' : ''}`}
            onClick={() => switchTab('dossier')}
            title="Contact Intelligence & Dossier"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>Dossier</span>
          </button>
          <button
            type="button"
            className={`dock-tab-pill ${activeTab === 'snippets' ? 'active' : ''}`}
            onClick={() => switchTab('snippets')}
            title="Snippets & Slash Macros"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            <span>Snippets</span>
          </button>
          <button
            type="button"
            className={`dock-tab-pill ${activeTab === 'contacts' ? 'active' : ''}`}
            onClick={() => switchTab('contacts')}
            title="Frequent Contacts & People"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>People</span>
          </button>
          <button
            type="button"
            className={`dock-tab-pill ${activeTab === 'tempmail' ? 'active' : ''}`}
            onClick={() => switchTab('tempmail')}
            title="Disposable Burner Inbox"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Burner</span>
          </button>
        </div>
      </div>

      {/* Dock Body Content Canvas */}
      <div className="dock-content-canvas">
        {/* ══════════════════════════════════════════════════════ */}
        {/* 1. AGENDA & INTERACTIVE MINI-CALENDAR TAB              */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'agenda' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Convert Active Email Action Banner */}
            {activeMessage && (
              <div className="dock-email-link-banner" onClick={handleCreateEventFromEmail}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>Create event from current email</div>
                    <div className="truncate" style={{ fontSize: '0.6875rem', opacity: 0.8 }}>
                      {activeMessage.subject || '(No Subject)'}
                    </div>
                  </div>
                </div>
                <span className="badge badge-purple" style={{ fontSize: '0.6875rem' }}>+ Add</span>
              </div>
            )}

            {/* Interactive Mini-Calendar Month Widget */}
            <div className="dock-card" style={{ padding: '0.75rem' }}>
              <div className="mini-cal-header">
                <button type="button" className="btn btn-ghost btn-xs" onClick={handlePrevMonth} title="Previous Month">
                  ◀
                </button>
                <span className="mini-cal-month-label">
                  {currentCalMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button type="button" className="btn btn-ghost btn-xs" onClick={handleNextMonth} title="Next Month">
                  ▶
                </button>
              </div>

              {/* Day Headers (S M T W T F S) */}
              <div className="mini-cal-weekdays">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <span key={d} className="mini-cal-weekday-label">{d}</span>
                ))}
              </div>

              {/* Day Cells Grid */}
              <div className="mini-cal-grid">
                {calendarGrid.map((dayObj, i) => {
                  const isSelected =
                    dayObj.date.getFullYear() === selectedCalDate.getFullYear() &&
                    dayObj.date.getMonth() === selectedCalDate.getMonth() &&
                    dayObj.date.getDate() === selectedCalDate.getDate();

                  const isToday =
                    dayObj.date.getFullYear() === new Date().getFullYear() &&
                    dayObj.date.getMonth() === new Date().getMonth() &&
                    dayObj.date.getDate() === new Date().getDate();

                  const dayKey = `${dayObj.date.getFullYear()}-${dayObj.date.getMonth()}-${dayObj.date.getDate()}`;
                  const hasEvent = eventDateSet.has(dayKey);

                  return (
                    <button
                      key={i}
                      type="button"
                      className={`mini-cal-cell ${dayObj.isCurrentMonth ? '' : 'other-month'} ${
                        isSelected ? 'selected' : ''
                      } ${isToday ? 'today' : ''}`}
                      onClick={() => handleSelectDay(dayObj)}
                    >
                      <span>{dayObj.date.getDate()}</span>
                      {hasEvent && <span className="mini-cal-event-dot" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Presets & Add Event Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="dock-section-title">
                {selectedCalDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ({selectedDayEvents.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowEventForm(!showEventForm)}
              >
                {showEventForm ? '✕ Close' : '+ Quick Add'}
              </button>
            </div>

            {/* Quick Add Presets Bar */}
            {!showEventForm && (
              <div className="dock-presets-row">
                <button type="button" className="btn btn-ghost btn-xs dock-preset-btn" onClick={() => applyEventPreset('1h')}>
                  ⏱️ In 1h
                </button>
                <button type="button" className="btn btn-ghost btn-xs dock-preset-btn" onClick={() => applyEventPreset('tomorrow9')}>
                  Tomorrow 9am
                </button>
                <button type="button" className="btn btn-ghost btn-xs dock-preset-btn" onClick={() => applyEventPreset('friday3')}>
                  Friday 3pm
                </button>
              </div>
            )}

            {/* Event Form */}
            {showEventForm && (
              <form onSubmit={handleAddEvent} className="dock-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <input
                  className="input"
                  placeholder="Event title or task..."
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  style={{ fontSize: '0.8125rem' }}
                  required
                  autoFocus
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                  <input
                    type="datetime-local"
                    className="input"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    style={{ fontSize: '0.75rem' }}
                    required
                  />
                  <select
                    className="input"
                    value={eventDuration}
                    onChange={(e) => setEventDuration(e.target.value)}
                    style={{ fontSize: '0.75rem' }}
                  >
                    <option value="15">15 min</option>
                    <option value="30">30 min</option>
                    <option value="60">1 hour</option>
                    <option value="120">2 hours</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    className="input"
                    placeholder="Location / URL (optional)"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    style={{ fontSize: '0.75rem', flex: 1 }}
                  />
                  <div className="dock-color-picker-mini">
                    {['purple', 'emerald', 'sky', 'rose'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`dock-color-dot dot-${c} ${eventCategory === c ? 'active' : ''}`}
                        onClick={() => setEventCategory(c)}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowEventForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-xs">
                    Save Event
                  </button>
                </div>
              </form>
            )}

            {/* Selected Date Timeline */}
            <div className="dock-timeline-list">
              {loadingEvents ? (
                <div className="text-secondary" style={{ fontSize: '0.8125rem', textAlign: 'center', padding: '1rem 0' }}>
                  Loading schedule...
                </div>
              ) : selectedDayEvents.length === 0 ? (
                <div className="dock-empty-state">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                  <p>No events scheduled for this day.</p>
                </div>
              ) : (
                selectedDayEvents.map((ev) => (
                  <div key={ev.id} className="dock-card dock-event-card" style={{ borderLeft: `3px solid ${ev.color || 'var(--color-primary)'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <strong style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{ev.title}</strong>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleDeleteEvent(ev.id)}
                        title="Delete event"
                        style={{ color: 'var(--color-text-tertiary)', padding: '0 0.2rem' }}
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.25rem' }}>
                      <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                        {new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {ev.location && (
                        <span className="truncate" style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>
                          {ev.location}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* 2. ENCRYPTED NOTES & CHECKLISTS VAULT TAB              */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'scratchpad' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
            {/* Action Top Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => handleCreateNote(false)}
                  title="Create new markdown text note"
                >
                  + Note
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleCreateNote(true)}
                  title="Create interactive checklist"
                >
                  + Checklist
                </button>
              </div>

              {activeNote && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className={`btn btn-ghost btn-xs ${activeNote.isPinned ? 'active-pin' : ''}`}
                    onClick={() => handleTogglePin(activeNote)}
                    title={activeNote.isPinned ? 'Unpin note' : 'Pin note to top'}
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => handleDeleteActiveNote(activeNote.id)}
                    title="Delete note"
                    style={{ color: 'var(--color-error)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              )}
            </div>

            {/* Search notes */}
            <input
              className="input"
              placeholder="Search notes & checklists..."
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.6rem' }}
            />

            {/* Note Selector Pills Horizontal Carousel */}
            <div className="dock-notes-pill-scroller">
              {filteredNotes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`dock-note-pill ${selectedNoteId === n.id ? 'active' : ''} color-${n.color || 'purple'}`}
                  onClick={() => setSelectedNoteId(n.id)}
                >
                  
                  
                  <span className="truncate" style={{ maxWidth: '110px' }}>{n.title || 'Untitled'}</span>
                </button>
              ))}
            </div>

            {/* Active Note / Checklist Canvas */}
            {activeNote ? (
              <div className="dock-card dock-note-editor-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1 }}>
                {/* Note Header & Title */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    className="input dock-note-title-input"
                    value={activeNote.title || ''}
                    onChange={(e) => handleUpdateActiveNote({ title: e.target.value })}
                    placeholder="Note Title..."
                  />

                  {/* Color Selector */}
                  <div className="dock-color-picker-mini">
                    {['purple', 'amber', 'emerald', 'rose', 'sky'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`dock-color-dot dot-${c} ${activeNote.color === c ? 'active' : ''}`}
                        onClick={() => handleUpdateActiveNote({ color: c })}
                      />
                    ))}
                  </div>
                </div>

                {/* Link to Current Email Action */}
                {activeMessage && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={handleAttachNoteToEmail}
                      style={{ color: 'var(--color-primary-light)', padding: 0 }}
                    >
                      Link to current email ({activeMessage.subject ? activeMessage.subject.slice(0, 20) + '...' : 'thread'})
                    </button>
                  </div>
                )}

                {/* Editor Content Area */}
                {activeNote.isChecklist ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
                    <form onSubmit={handleAddChecklistItem} style={{ display: 'flex', gap: '0.4rem' }}>
                      <input
                        className="input"
                        placeholder="Add todo item... (Enter)"
                        value={newChecklistInput}
                        onChange={(e) => setNewChecklistInput(e.target.value)}
                        style={{ fontSize: '0.75rem' }}
                      />
                      <button type="submit" className="btn btn-secondary btn-xs">Add</button>
                    </form>

                    <div className="dock-checklist-container">
                      {checklistItems.map((item) => (
                        <div key={item.id} className="dock-checklist-row">
                          <input
                            type="checkbox"
                            checked={Boolean(item.done)}
                            onChange={() => handleToggleChecklistItem(item.id)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span className={`dock-checklist-text ${item.done ? 'done' : ''}`}>
                            {item.text}
                          </span>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleDeleteChecklistItem(item.id)}
                            style={{ color: 'var(--color-text-tertiary)', padding: 0 }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="dock-scratchpad-area"
                    value={activeNote.content || ''}
                    onChange={(e) => handleUpdateActiveNote({ content: e.target.value })}
                    placeholder="Write encrypted notes, markdown snippets, or paste quick keys. Auto-saved to AES-256 vault..."
                  />
                )}

                {/* Note Footer Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                  <span>AES-256 Vault Synced</span>
                  <span>{activeNote.content ? activeNote.content.length : 0} chars</span>
                </div>
              </div>
            ) : (
              <div className="dock-empty-state">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                <p>No notes in your vault yet. Click "+ Note" to create one.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* 3. CONTACTS & PEOPLE DIRECTORY TAB                     */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'contacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="dock-section-title">Frequent People ({filteredContacts.length})</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowAddContact(!showAddContact)}
              >
                {showAddContact ? '✕ Close' : '+ Contact'}
              </button>
            </div>

            {/* Add Contact Form */}
            {showAddContact && (
              <form onSubmit={handleAddContact} className="dock-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  className="input"
                  placeholder="Full Name (e.g. Alice Smith)"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  style={{ fontSize: '0.8125rem' }}
                  autoFocus
                />
                <input
                  type="email"
                  className="input"
                  placeholder="Email address"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  style={{ fontSize: '0.8125rem' }}
                  required
                />
                <input
                  type="tel"
                  className="input"
                  placeholder="Phone / SMS number (optional)"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  style={{ fontSize: '0.8125rem' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={contactIsVip}
                    onChange={(e) => setContactIsVip(e.target.checked)}
                  />
                  <span>⭐ Mark as VIP Sender</span>
                </label>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowAddContact(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-xs">
                    Save Contact
                  </button>
                </div>
              </form>
            )}

            {/* Search contacts */}
            <input
              className="input"
              placeholder="Search by name, email, or phone..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              style={{ fontSize: '0.8125rem' }}
            />

            {/* Contact List */}
            {loadingContacts ? (
              <div className="text-secondary" style={{ fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 0' }}>
                Loading address book...
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="dock-empty-state">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10"/><path d="M7 12h10"/><path d="M7 17h10"/></svg>
                <p>No contacts found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '60vh', overflowY: 'auto' }}>
                {filteredContacts.map((c) => {
                  const initial = (c.name || c.email || '?')[0].toUpperCase();
                  return (
                    <div key={c.id || c.email} className="dock-card dock-contact-card">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="dock-contact-avatar">{initial}</div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <strong style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} className="truncate">
                              {c.name || c.email}
                            </strong>
                            {c.is_vip && <span title="VIP Contact" style={{ fontSize: '0.75rem' }}>⭐</span>}
                          </div>
                          {c.name && (
                            <span className="text-tertiary truncate" style={{ fontSize: '0.7rem', display: 'block' }}>
                              {c.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Contact Actions */}
                      <div className="dock-contact-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => onComposeTo && onComposeTo(c.email)}
                          title={`Compose email to ${c.email}`}
                        >
                          Email
                        </button>
                        {onFilterBySender && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => onFilterBySender(c.email)}
                            title="Filter inbox messages from this sender"
                          >
                            Filter
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(c.email);
                            if (window.WoxToast) window.WoxToast.success('Email copied');
                          }}
                          title="Copy email"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDeleteContact(c.id)}
                          title="Remove contact"
                          style={{ color: 'var(--color-text-tertiary)' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* 4. DISPOSABLE BURNER & IN-DOCK LIVE INBOX TAB          */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'tempmail' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="dock-section-title">Quick Burner Mailbox</span>
              {tempAddress && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => fetchBurnerInbox(tempAddress)}
                  title="Refresh incoming burner messages"
                >
                  Sync
                </button>
              )}
            </div>

            {/* Burner Control Card */}
            <div className="dock-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* Mode Selector Toggle: Random vs Custom */}
              <div style={{ display: 'flex', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-pill)', padding: '2px', border: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  onClick={() => setIsCustomMode(false)}
                  style={{
                    flex: 1,
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-pill)',
                    border: 'none',
                    background: !isCustomMode ? 'var(--color-primary)' : 'transparent',
                    color: !isCustomMode ? '#ffffff' : 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Instant Random
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomMode(true)}
                  style={{
                    flex: 1,
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-pill)',
                    border: 'none',
                    background: isCustomMode ? 'var(--color-primary)' : 'transparent',
                    color: isCustomMode ? '#ffffff' : 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  Custom Email
                </button>
              </div>

              {!isCustomMode ? (
                /* INSTANT RANDOM MODE */
                <>
                  {/* Current Active Burner Display */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <input
                      className="input mono"
                      readOnly
                      value={tempAddress || 'No active burner'}
                      style={{
                        fontSize: '0.78rem',
                        color: tempAddress ? 'var(--color-primary-light)' : 'var(--color-text-tertiary)',
                        background: tempAddress ? 'rgba(124, 58, 237, 0.08)' : 'var(--color-bg-input)',
                        borderColor: tempAddress ? 'rgba(124, 58, 237, 0.3)' : 'var(--color-border)',
                      }}
                    />
                    {tempAddress && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={handleCopyTemp}
                        title="Copy address"
                        style={{ padding: '0.4rem 0.55rem' }}
                      >
                        {copiedTemp ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>

                  {/* Lifetime & Domain / Generation Bar */}
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <select
                      className="input"
                      value={selectedTempDomain}
                      onChange={(e) => setSelectedTempDomain(e.target.value)}
                      style={{ fontSize: '0.72rem', flex: 1 }}
                      title="Choose burner domain"
                    >
                      <option value="mail.wox.world">@mail.wox.world</option>
                      <option value="wox.world">@wox.world</option>
                    </select>

                    <select
                      className="input"
                      value={selectedBurnerExpiry}
                      onChange={(e) => setSelectedBurnerExpiry(parseInt(e.target.value, 10))}
                      style={{ fontSize: '0.72rem', width: '70px' }}
                    >
                      <option value="1">1h</option>
                      <option value="24">24h</option>
                      <option value="72">72h</option>
                    </select>

                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => handleGenerateTemp(null, selectedTempDomain)}
                      disabled={generatingTemp}
                      style={{ flexShrink: 0 }}
                    >
                      {generatingTemp ? '...' : 'Generate'}
                    </button>
                  </div>
                </>
              ) : (
                /* CUSTOM EMAIL MODE */
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleGenerateTemp(customHandle, selectedTempDomain);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0 0.5rem' }}>
                    <input
                      className="mono"
                      placeholder="custom-name"
                      value={customHandle}
                      onChange={(e) => setCustomHandle(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-primary)',
                        padding: '0.45rem 0',
                        fontSize: '0.78rem',
                        outline: 'none',
                      }}
                      autoFocus
                    />
                    <select
                      value={selectedTempDomain}
                      onChange={(e) => setSelectedTempDomain(e.target.value)}
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--color-primary-light)',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        cursor: 'pointer',
                        padding: '0.2rem 0',
                        fontWeight: 600,
                      }}
                      title="Choose domain"
                    >
                      <option value="mail.wox.world" style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' }}>@mail.wox.world</option>
                      <option value="wox.world" style={{ background: 'var(--color-bg-card)', color: 'var(--color-text-primary)' }}>@wox.world</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <select
                      className="input"
                      value={selectedBurnerExpiry}
                      onChange={(e) => setSelectedBurnerExpiry(parseInt(e.target.value, 10))}
                      style={{ fontSize: '0.75rem', width: '90px' }}
                    >
                      <option value="1">1 Hour</option>
                      <option value="24">24 Hours</option>
                      <option value="72">72 Hours</option>
                    </select>

                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => handleGenerateTemp(customHandle, selectedTempDomain)}
                      disabled={generatingTemp || customHandle.trim().length < 3}
                      style={{ flex: 1 }}
                    >
                      {generatingTemp ? 'Creating...' : 'Create Custom'}
                    </button>
                  </div>
                </form>
              )}

              {/* Lifetime Extenders & Self-Destruct */}
              {tempAddress && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.35rem', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>Extend:</span>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleExtendBurner(1)} title="Extend +1 hour">
                      +1h
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleExtendBurner(24)} title="Extend +24 hours">
                      +24h
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={handleSelfDestructBurner}
                    style={{ color: 'var(--color-error)', fontWeight: 600 }}
                    title="Permanently purge mailbox now"
                  >
                    Destroy
                  </button>
                </div>
              )}
            </div>

            {/* In-Dock Live Messages Stream */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="dock-section-title">Live Incoming Messages ({tempMessages.length})</span>
            </div>

            {loadingTempMessages ? (
              <div className="text-secondary" style={{ fontSize: '0.8125rem', textAlign: 'center', padding: '1rem 0' }}>
                Checking incoming stream...
              </div>
            ) : tempMessages.length === 0 ? (
              <div className="dock-empty-state">
                <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
                <p>{tempAddress ? 'Waiting for incoming emails...' : 'Generate a burner to receive emails.'}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '45vh', overflowY: 'auto' }}>
                {tempMessages.map((m) => {
                  const isExpanded = expandedMsgUid === m.uid;
                  return (
                    <div
                      key={m.uid}
                      className="dock-card dock-temp-msg-card"
                      onClick={() => setExpandedMsgUid(isExpanded ? null : m.uid)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <strong style={{ fontSize: '0.8125rem', color: 'var(--color-text-primary)' }} className="truncate">
                          {m.subject || '(No Subject)'}
                        </strong>
                        <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--color-text-tertiary)' }}>
                          {m.date ? new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <span className="text-secondary truncate" style={{ fontSize: '0.71875rem', display: 'block' }}>
                        From: {m.from?.name || m.from?.address || 'Unknown'}
                      </span>

                      {isExpanded && (
                        <div className="dock-temp-msg-body">
                          <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--color-text-secondary)' }}>
                            {m.textSnippet || m.intro || 'No text snippet available.'}
                          </p>
                          <a
                            href={`/tempmail?address=${encodeURIComponent(tempAddress)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-link"
                            style={{ fontSize: '0.71875rem', color: 'var(--color-primary-light)', display: 'inline-block', marginTop: '0.4rem' }}
                          >
                            Open Full Message in Webmail ↗
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* 5. CONTACT INTELLIGENCE & DOSSIER TAB                  */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'dossier' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Search / Target Contact Email Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (dossierEmailInput.trim()) fetchDossier(dossierEmailInput.trim());
              }}
              style={{ display: 'flex', gap: '0.4rem' }}
            >
              <input
                className="input"
                placeholder="contact@domain.com"
                value={dossierEmailInput}
                onChange={(e) => setDossierEmailInput(e.target.value)}
                style={{ fontSize: '0.78rem', flex: 1 }}
              />
              <button type="submit" className="btn btn-secondary btn-xs" disabled={loadingDossier}>
                {loadingDossier ? '...' : 'Inspect'}
              </button>
            </form>

            {loadingDossier ? (
              <div className="text-secondary" style={{ textAlign: 'center', padding: '2rem 0', fontSize: '0.8125rem' }}>
                Loading intelligence telemetry...
              </div>
            ) : !dossierData ? (
              <div className="dock-empty-state">
                <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </span>
                <p>Select an email in your inbox or enter an address above to generate a contact dossier.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Profile Card */}
                <div className="dock-card" style={{ padding: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ overflow: 'hidden' }}>
                      <strong style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }} className="truncate">
                        {dossierData.email}
                      </strong>
                      <div className="text-secondary" style={{ fontSize: '0.72rem' }}>
                        Domain: {dossierData.domain}
                      </div>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                      {dossierData.timezoneLabel}
                    </span>
                  </div>

                  {/* Local Time Clock */}
                  <div style={{ background: 'var(--color-bg-input)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Recipient Local Time:</span>
                    <span className="mono" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                      {dossierData.localTime}
                    </span>
                  </div>
                </div>

                {/* Telemetry Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div className="dock-card" style={{ padding: '0.65rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-success)' }}>
                      {dossierData.metrics?.openRatePercent || 0}%
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.6875rem' }}>Open Rate ({dossierData.metrics?.totalOpened || 0}/{dossierData.metrics?.totalEmailsSent || 0})</div>
                  </div>
                  <div className="dock-card" style={{ padding: '0.65rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-primary-light)' }}>
                      {dossierData.metrics?.averageOpenLatencyHours !== null ? `${dossierData.metrics.averageOpenLatencyHours}h` : '—'}
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.6875rem' }}>Avg. Open Latency</div>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={() => onComposeTo && onComposeTo(dossierData.email)}
                    style={{ flex: 1 }}
                  >
                    Compose Email
                  </button>
                  {onFilterBySender && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => onFilterBySender(dossierData.email)}
                    >
                      Filter Thread
                    </button>
                  )}
                </div>

                {/* Shared Controlled Attachments */}
                {dossierData.sharedAttachments && dossierData.sharedAttachments.length > 0 && (
                  <div className="dock-card" style={{ padding: '0.75rem' }}>
                    <span className="dock-section-title" style={{ marginBottom: '0.4rem', display: 'block' }}>
                      Shared Controlled Attachments ({dossierData.sharedAttachments.length})
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {dossierData.sharedAttachments.map((att) => (
                        <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '0.3rem 0', borderBottom: '1px solid var(--color-border)' }}>
                          <span className="truncate" style={{ maxWidth: '140px' }}>{att.filename}</span>
                          <span className="mono text-secondary" style={{ fontSize: '0.6875rem' }}>
                            {att.max_views ? `${att.view_count}/${att.max_views}v` : 'Unl'} • {att.max_downloads !== null ? `${att.download_count}/${att.max_downloads}d` : 'Unl'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════ */}
        {/* 6. SNIPPETS & SLASH MACROS TAB                         */}
        {/* ══════════════════════════════════════════════════════ */}
        {activeTab === 'snippets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="dock-section-title">Saved Macros ({snippets.length})</span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setShowSnippetForm(!showSnippetForm)}
              >
                {showSnippetForm ? 'Cancel' : '+ New Snippet'}
              </button>
            </div>

            {/* Create Snippet Form */}
            {showSnippetForm && (
              <form onSubmit={handleCreateSnippet} className="dock-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    className="input"
                    placeholder="shortcut (e.g. intro)"
                    value={snippetShortcut}
                    onChange={(e) => setSnippetShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    style={{ fontSize: '0.75rem', flex: 1 }}
                    required
                  />
                  <input
                    className="input"
                    placeholder="Title"
                    value={snippetTitle}
                    onChange={(e) => setSnippetTitle(e.target.value)}
                    style={{ fontSize: '0.75rem', flex: 1.5 }}
                    required
                  />
                </div>
                <textarea
                  className="input"
                  placeholder="Template HTML / text..."
                  value={snippetContent}
                  onChange={(e) => setSnippetContent(e.target.value)}
                  rows={3}
                  style={{ fontSize: '0.75rem', resize: 'vertical' }}
                  required
                />
                <button type="submit" className="btn btn-primary btn-xs">
                  Save Snippet
                </button>
              </form>
            )}

            {loadingSnippets ? (
              <div className="text-secondary" style={{ textAlign: 'center', padding: '1rem 0', fontSize: '0.8125rem' }}>
                Loading snippets...
              </div>
            ) : snippets.length === 0 ? (
              <div className="dock-empty-state">
                <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                </span>
                <p>No text snippets saved yet. Create a snippet to use slash macros like <code>/intro</code> in the composer.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '55vh', overflowY: 'auto' }}>
                {snippets.map((snip) => (
                  <div key={snip.id} className="dock-card" style={{ padding: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span className="badge badge-purple mono" style={{ fontSize: '0.7rem' }}>
                          /{snip.shortcut}
                        </span>
                        <strong style={{ fontSize: '0.8125rem' }}>{snip.title}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            navigator.clipboard.writeText(snip.content_html || '');
                            if (window.WoxToast) window.WoxToast.success('Snippet copied');
                          }}
                          title="Copy snippet to clipboard"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDeleteSnippet(snip.id)}
                          style={{ color: 'var(--color-error)' }}
                          title="Delete snippet"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.72rem', maxHeight: '40px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {snip.content_html}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
