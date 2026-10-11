import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useLanguage } from './i18n/useLanguage'
import type { TranslationKey } from './i18n/translations'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, SortableContext,
} from '@dnd-kit/sortable'
import AuthForm from './components/AuthForm'
import CalendarView from './components/CalendarView'
import NoteCard from './components/NoteCard'
import PasswordReset from './components/PasswordReset'
import { supabase } from './lib/supabase'
import { loadCloudNotes, saveVersionedNote } from './lib/notesApi'
import type { Note } from './lib/notesApi'

const colors = ['#FFE5AE', '#FAD5E5', '#E6DDFC', '#D9F1DC', '#D9EAFB', '#FFE2CC']
const stickers = ['', '🌷', '🌼', '🌸', '☁️', '🍓', '🦋', '💗', '🍀', '🧸']
const themes = {
  cream: { accent: '#A8B89A', soft: '#E9EEDC', text: '#655B50', background: '#F8F3E9' },
  sakura: { accent: '#D7A2B9', soft: '#F8E4ED', text: '#785C6A', background: '#FFF1F5' },
  forest: { accent: '#79957C', soft: '#DEE8D8', text: '#506B55', background: '#EDF3E8' },
}
type Theme = keyof typeof themes
const themeLabels: Record<Theme, TranslationKey> = {
  cream: 'creamTheme',
  sakura: 'sakuraTheme',
  forest: 'forestTheme',
}

function readTheme(): Theme {
  try {
    const value = localStorage.getItem('little-notes-theme')
    if (value === 'cream' || value === 'sakura' || value === 'forest') return value
  } catch { /* Optional preference. */ }
  return 'cream'
}

function AuthGate() {
  const { t } = useLanguage()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const signupSessionHold = useRef(false)
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setLoading(false) }
    }).catch(() => { if (active) setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) {
        setSession(signupSessionHold.current ? null : next)
        setLoading(false)
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  if (window.location.pathname === '/reset-password') return <PasswordReset />
  if (loading) return <main className="min-h-screen grid place-items-center">{t('loadingSpace')}</main>
  if (!session) return <AuthForm onSignupSessionHold={hold => {
    signupSessionHold.current = hold
    if (hold) setSession(null)
  }} />
  return <CloudNotes key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />
}

function CloudNotes({ userId, email }: { userId: string; email: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'notes' | 'calendar'>('notes')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [themeName, setThemeName] = useState<Theme>(readTheme)
  const { language, setLanguage, t } = useLanguage()
  const [showLetter, setShowLetter] = useState(() => {
    try { return localStorage.getItem('little-notes-letter-seen') !== 'true' }
    catch { return true }
  })
  const [showSurprise, setShowSurprise] = useState(false)
  const [status, setStatus] = useState<TranslationKey>('connecting')
  const [error, setError] = useState('')
  const [conflictId, setConflictId] = useState<string | null>(null)
  const [remoteChange, setRemoteChange] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dirtyCount, setDirtyCount] = useState(0)

  const notesRef = useRef<Note[]>([])
  const dirty = useRef(new Set<string>())
  const revision = useRef(new Map<string, number>())
  const flushRunning = useRef(false)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editingRef = useRef<string | null>(null)
  const busyRef = useRef(false)
  const conflictRef = useRef<string | null>(null)
  const unmounted = useRef(false)
  const draftKey = `little-notes-unsaved-${userId}`
  const theme = themes[themeName]

  useEffect(() => {
    editingRef.current = editingId
    busyRef.current = busy
    conflictRef.current = conflictId
  }, [editingId, busy, conflictId])

  function replace(next: Note[]) {
    notesRef.current = next
    if (!unmounted.current) setNotes(next)
  }

  function persistDrafts() {
    if (!unmounted.current) setDirtyCount(dirty.current.size)
    try {
      const drafts = notesRef.current.filter(note => dirty.current.has(note.id))
      if (drafts.length) localStorage.setItem(draftKey, JSON.stringify(drafts))
      else localStorage.removeItem(draftKey)
    } catch {
      setError(t('storageUnavailable'))
    }
  }

  function readDrafts(): Note[] {
    try {
      const raw = localStorage.getItem(draftKey)
      const value: unknown = raw ? JSON.parse(raw) : []
      if (!Array.isArray(value)) return []
      return value.filter((v): v is Note => v !== null && typeof v === 'object' &&
        typeof v.id === 'string' && typeof v.version === 'number' &&
        typeof v.title === 'string' && typeof v.content === 'string' &&
        typeof v.position === 'number' && typeof v.color === 'string')
        .map(note => ({
          ...note,
          calendar_date: typeof note.calendar_date === 'string' ? note.calendar_date : null,
        }))
    } catch { return [] }
  }

  const fetchCloud = useCallback(async (initial = false) => {
    const cloud = await loadCloudNotes(userId)
    // Never replace locally modified notes with remote data.
    if (!initial && (dirty.current.size || editingRef.current || busyRef.current)) {
      setRemoteChange(true)
      return
    }
    if (initial) {
      const drafts = readDrafts()
      const draftMap = new Map(drafts.map(note => [note.id, note]))
      const merged = cloud.map(note => draftMap.get(note.id) ?? note)
      replace(merged)
      drafts.forEach(note => {
        if (cloud.some(c => c.id === note.id)) dirty.current.add(note.id)
      })
      // Drafts are not automatically uploaded: remote state may have changed.
      if (dirty.current.size) {
        setDirtyCount(dirty.current.size)
        setStatus('recoveredDrafts')
        setRemoteChange(true)
      } else setStatus('saved')
    } else {
      replace(cloud)
      setStatus('saved')
      setRemoteChange(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    unmounted.current = false
    void fetchCloud(true).catch(e => setError(String(e))).finally(() => setReady(true))
    return () => {
      unmounted.current = true
      if (flushTimer.current) clearTimeout(flushTimer.current)
    }
  }, [fetchCloud])

  useEffect(() => {
    try { localStorage.setItem('little-notes-theme', themeName) } catch { /* optional */ }
  }, [themeName])

  useEffect(() => {
    if (!ready) return
    const channel = supabase.channel(`notes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, () => {
        if (dirty.current.size || editingRef.current || busyRef.current) {
          setRemoteChange(true)
        } else {
          void fetchCloud().catch(e => setError(String(e)))
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [ready, userId, fetchCloud])

  const flush = async () => {
    if (flushRunning.current || conflictRef.current) return
    flushRunning.current = true
    setBusy(true)
    try {
      while (dirty.current.size && !conflictRef.current) {
        const id = [...dirty.current][0]
        const snapshot = notesRef.current.find(n => n.id === id)
        if (!snapshot) { dirty.current.delete(id); persistDrafts(); continue }
        const atRevision = revision.current.get(id) ?? 0
        setStatus('saving')
        const result = await saveVersionedNote(userId, snapshot)
        if (unmounted.current) return
        if (result.kind === 'error') {
          setStatus('notSaved')
          setError(result.message)
          break
        }
        if (result.kind === 'conflict') {
          setConflictId(id)
          conflictRef.current = id
          setStatus('conflict')
          break
        }
        // The server accepted the snapshot. New typing may have happened meanwhile.
        replace(notesRef.current.map(note => note.id === id
          ? { ...note, version: result.version } : note))
        if ((revision.current.get(id) ?? 0) === atRevision) dirty.current.delete(id)
        persistDrafts()
        setError('')
      }
      if (!dirty.current.size && !conflictRef.current) setStatus('saved')
    } finally {
      flushRunning.current = false
      if (!unmounted.current) setBusy(false)
    }
  }

  function scheduleFlush() {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => { void flush() }, 750)
  }

  function editNote(id: string, patch: Partial<Note>) {
    replace(notesRef.current.map(n => n.id === id ? { ...n, ...patch, id: n.id, version: n.version } : n))
    dirty.current.add(id)
    revision.current.set(id, (revision.current.get(id) ?? 0) + 1)
    persistDrafts()
    setStatus('unsavedChanges')
    scheduleFlush()
  }

  async function finishEditing() {
    setEditingId(null)
    if (flushTimer.current) clearTimeout(flushTimer.current)
    await flush()
  }

  async function addNote() {
    if (busyRef.current || conflictRef.current) return
    setBusy(true)
    try {
      const note: Note = {
        id: crypto.randomUUID(), title: '', content: '',
        color: '#FFE5AE', pinned: false, sticker: '',
        calendar_date: null,
        position: notesRef.current.length, version: 1,
      }
      const { data, error: insertError } = await supabase.from('notes')
        .insert({ ...note, user_id: userId })
        .select('version').single()
      if (insertError) throw insertError
      replace([...notesRef.current, { ...note, version: Number(data.version) }])
      setSearch('')
      setView('notes')
      setEditingId(note.id)
      setError('')
    } catch (e) { setError(`${t('createFailed')} ${String(e)}`) }
    finally { setBusy(false) }
  }

  async function deleteNote(id: string) {
    if (!window.confirm(t('deleteConfirm'))) return
    if (busyRef.current || conflictRef.current) return
    if (dirty.current.has(id)) {
      setError(t('saveBeforeDelete'))
      return
    }
    const note = notesRef.current.find(n => n.id === id)
    if (!note) return
    setBusy(true)
    try {
      const { data, error: deleteError } = await supabase.from('notes').delete()
        .eq('id', id).eq('user_id', userId).eq('version', note.version)
        .select('id').maybeSingle()
      if (deleteError) throw deleteError
      if (!data) { setConflictId(id); setError(t('deleteConflict')); return }
      replace(notesRef.current.filter(n => n.id !== id))
      if (editingId === id) setEditingId(null)
      setError('')
    } catch (e) { setError(`${t('deleteFailed')} ${String(e)}`) }
    finally { setBusy(false) }
  }

  async function resolveConflict(keepMine: boolean) {
    const id = conflictRef.current
    if (!id || busyRef.current) return
    setBusy(true)
    try {
      const { data, error: readError } = await supabase.from('notes')
        .select('id,title,content,color,pinned,sticker,calendar_date,position,version')
        .eq('id', id).eq('user_id', userId).maybeSingle()
      if (readError) throw readError
      if (!data && keepMine) {
        setError(t('remotelyDeleted'))
        return
      }
      if (keepMine && data) {
        replace(notesRef.current.map(n => n.id === id ? { ...n, version: Number(data.version) } : n))
        revision.current.set(id, (revision.current.get(id) ?? 0) + 1)
      } else {
        replace(data
          ? notesRef.current.map(n => n.id === id ? {
              ...data, sticker: data.sticker ?? '', calendar_date: data.calendar_date ?? null,
              version: Number(data.version), position: Number(data.position),
            } : n)
          : notesRef.current.filter(n => n.id !== id))
        dirty.current.delete(id)
      }
      conflictRef.current = null
      setConflictId(null)
      setError('')
      persistDrafts()
      setStatus(keepMine ? 'retryingVersion' : 'cloudVersionLoaded')
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
    if (keepMine) void flush()
  }

  async function retry() {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    await flush()
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || dirty.current.size || editingRef.current || busyRef.current) return
    const all = notesRef.current
    const item = all.find(n => n.id === active.id)
    const target = all.find(n => n.id === over.id)
    if (!item || !target || item.pinned !== target.pinned) return
    const pinned = all.filter(n => n.pinned)
    const normal = all.filter(n => !n.pinned)
    const group = item.pinned ? pinned : normal
    const from = group.findIndex(n => n.id === item.id)
    const to = group.findIndex(n => n.id === target.id)
    if (from < 0 || to < 0) return
    const sorted = arrayMove(group, from, to)
    const next = (item.pinned ? [...sorted, ...normal] : [...pinned, ...sorted])
      .map((n, index) => ({ ...n, position: index }))
    replace(next)
    for (const n of next) {
      const prev = all.find(p => p.id === n.id)
      if (prev?.position !== n.position) {
        dirty.current.add(n.id)
        revision.current.set(n.id, (revision.current.get(n.id) ?? 0) + 1)
      }
    }
    persistDrafts()
    setStatus('savingOrder')
    scheduleFlush()
  }

  async function refreshCloud() {
    if (dirty.current.size || editingRef.current || busyRef.current) {
      setError(t('resolveBeforeRefresh'))
      return
    }
    try { await fetchCloud(); setError('') }
    catch (e) { setError(String(e)) }
  }

  async function signOut() {
    if (dirty.current.size || busyRef.current) {
      setError(t('saveBeforeSignOut'))
      return
    }
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ordered = [...notes.filter(n => n.pinned), ...notes.filter(n => !n.pinned)]
  const filtered = ordered.filter(n => `${n.title} ${n.content}`.toLowerCase().includes(search.trim().toLowerCase()))
  const dragDisabled = !!search.trim() || !!editingId || !!conflictId || dirtyCount > 0 || busy

  if (!ready) return <main className="min-h-screen grid place-items-center">{t('loadingNotes')}</main>

  return (
    <div className="little-notes-page min-h-screen px-4 py-8 sm:px-8" style={{
      '--theme-accent': theme.accent, '--theme-soft': theme.soft,
      '--theme-text': theme.text, '--theme-background': theme.background,
    } as CSSProperties}>
      <main className="mx-auto max-w-6xl">
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">


          <div
              className="flex items-center gap-1
             rounded-full bg-white/75
             p-1 shadow-sm"
              role="group"
              aria-label={t('selectLanguage')}
          >
            <button
                type="button"
                onClick={() => setLanguage('zh')}
                aria-pressed={language === 'zh'}
                className={`cursor-pointer rounded-full
                px-4 py-2 text-sm transition-all ${
                    language === 'zh'
                        ? 'bg-[#A8B89A] font-semibold text-[#263526]'
                        : 'text-[#655B50] hover:bg-white/80'
                }`}
            >
              {t('chinese')}
            </button>

            <button
                type="button"
                onClick={() => setLanguage('en')}
                aria-pressed={language === 'en'}
                className={`cursor-pointer rounded-full
                px-4 py-2 text-sm transition-all ${
                    language === 'en'
                        ? 'bg-[#A8B89A] font-semibold text-[#263526]'
                        : 'text-[#655B50] hover:bg-white/80'
                }`}
            >
              {t('english')}
            </button>
          </div>
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">🌷 {t('appTitle')}</h1>
            <p className="mt-2 text-sm opacity-70">{t('appSubtitle')}</p>
            <p className="mt-1 text-xs opacity-60">{email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="cozy-button" onClick={() => setShowLetter(true)}>{t('letter')}</button>
            <button className="cozy-button" aria-label={t('surprise')} title={t('surprise')} onClick={() => setShowSurprise(true)}>💗</button>
            <button className="cozy-button" onClick={() => void signOut()}>{t('signOut')}</button>
          </div>
        </header>

        <section className="cozy-panel mb-7 p-6 sm:p-8">
          <div className="mb-3 text-3xl">🌼 ☁️ 🍃</div>
          <h2 className="mb-3 text-2xl font-bold">{t('welcome')}</h2>
          <p className="opacity-80">{t('welcomeDescription')}</p>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/5 pt-5">
            {(Object.keys(themes) as Theme[]).map(name => (
              <button key={name} onClick={() => setThemeName(name)}
                className={`rounded-full border px-4 py-2 text-sm cursor-pointer ${themeName === name ? 'bg-white font-bold' : 'bg-white/50'}`}>
                {name === 'cream' ? '🍯' : name === 'sakura' ? '🌸' : '🌿'} {t(themeLabels[name])}
              </button>
            ))}
          </div>
        </section>

        <section className="cozy-panel mb-7 p-4" aria-live="polite">
          <p className="font-semibold">{t(status)}</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
          {conflictId && <div className="mt-3 flex flex-wrap gap-2">
            <button className="cozy-button" disabled={busy} onClick={() => void resolveConflict(false)}>{t('loadCloudVersion')}</button>
            <button className="cozy-button" disabled={busy} onClick={() => void resolveConflict(true)}>{t('keepDraft')}</button>
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {dirtyCount > 0 && !conflictId &&
              <button disabled={busy} onClick={() => void retry()} className="cozy-button">{t('retrySave')} ({dirtyCount})</button>}
            <button disabled={busy || dirtyCount > 0 || !!editingId}
              className="cozy-button disabled:opacity-40" onClick={() => void refreshCloud()}>{t('refreshCloud')}</button>
            {remoteChange && <span className="text-sm self-center">{t('remoteChanges')}</span>}
          </div>
        </section>

        <nav className="mb-7 flex gap-2" aria-label={`${t('notesView')} / ${t('calendarView')}`}>
          <button
            type="button"
            aria-current={view === 'notes' ? 'page' : undefined}
            onClick={() => setView('notes')}
            className={`rounded-full px-5 py-2 font-semibold ${view === 'notes' ? 'bg-[var(--theme-accent)] text-white' : 'bg-white/65'}`}
          >
            📝 {t('notesView')}
          </button>
          <button
            type="button"
            aria-current={view === 'calendar' ? 'page' : undefined}
            onClick={() => {
              setEditingId(null)
              setView('calendar')
            }}
            className={`rounded-full px-5 py-2 font-semibold ${view === 'calendar' ? 'bg-[var(--theme-accent)] text-white' : 'bg-white/65'}`}
          >
            🗓️ {t('calendarView')}
          </button>
        </nav>

        {view === 'notes' ? (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-bold">{t('noteWall')}</h2>
                <p className="mt-1 text-sm opacity-70">{notes.length} {t('notes')} · {notes.filter(n => n.pinned).length} {t('pinned')}</p>
              </div>
              <button
                  disabled={busy || !!conflictId}
                  className="cozy-primary-button"
                  onClick={() => void addNote()}
              >
                {t('newNote')}
              </button>
            </div>
            <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
                className="mb-5 w-full rounded-2xl border
                 border-white bg-white/80 p-4 outline-none"
            />
            <p className="mb-5 text-xs opacity-65">{t('dragHint')}</p>

            {filtered.length === 0 ? <div className="cozy-panel p-12 text-center">{t('noNotes')}</div> :
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={filtered.map(n => n.id)} strategy={rectSortingStrategy}>
                  <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map(note => <NoteCard key={note.id} note={note} colors={colors} stickers={stickers}
                      editing={editingId === note.id} dragDisabled={dragDisabled}
                      t={t}
                      onEdit={() => setEditingId(note.id)} onDone={() => void finishEditing()}
                      onDelete={() => void deleteNote(note.id)}
                      onPin={() => editNote(note.id, { pinned: !note.pinned })}
                      onUpdate={patch => editNote(note.id, patch)} />)}
                  </div>
                </SortableContext>
              </DndContext>}
          </>
        ) : (
          <CalendarView
            notes={notes}
            language={language}
            disabled={!!conflictId}
            t={t}
            onAssignDate={(noteId, date) => editNote(noteId, { calendar_date: date })}
          />
        )}
        <footer className="mt-20 pb-6 text-center text-sm opacity-70">{t('footer')}</footer>
      </main>

      <button
          type="button"
          onClick={() => void addNote()}
          disabled={busy || !!conflictId}
          aria-label={t('createNote')}
          title={t('createNote')}
          className={editingId ? 'hidden' : 'sm:hidden'}
          style={{
            position: 'fixed',
            right: '20px',
            bottom: 'max(24px, env(safe-area-inset-bottom))',
            zIndex: 9999,
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            backgroundColor: '#A8B89A',
            color: '#263526',
            fontSize: '32px',
            fontWeight: 'bold',
            border: 'none',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            cursor: 'pointer',
            opacity: busy || !!conflictId ? 0.45 : 1,
          }}
      >
        +
      </button>


      {showLetter && <div className="cozy-modal-backdrop"><div role="dialog" aria-modal="true" aria-label={t('letterDialogLabel')} className="cozy-letter">
        <div className="mb-5 text-4xl">💌 🌷</div><h2 className="mb-5 text-2xl font-bold">{t('letterTitle')}</h2>
        <p className="leading-8">{t('letterBody')}</p>
        <button autoFocus className="cozy-primary-button mt-7 w-full" onClick={() => {
          setShowLetter(false)
          try { localStorage.setItem('little-notes-letter-seen', 'true') } catch { /* optional */ }
        }}>{t('keepLetter')}</button>
      </div></div>}
      {showSurprise && !showLetter && <div className="cozy-modal-backdrop"><div role="dialog" aria-modal="true" aria-label={t('surprise')} className="cozy-letter text-center">
        <div className="mb-5 text-5xl">💗 ✨</div><h2 className="mb-5 text-2xl font-bold">{t('surpriseTitle')}</h2>
        <p className="leading-8">{t('surpriseBody')}</p><button autoFocus onClick={() => setShowSurprise(false)} className="cozy-primary-button mt-8 w-full">{t('surpriseThanks')}</button>
      </div></div>}
    </div>
  )
}

export default AuthGate
