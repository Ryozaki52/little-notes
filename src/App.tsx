import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, SortableContext,
} from '@dnd-kit/sortable'
import AuthForm from './components/AuthForm'
import NoteCard from './components/NoteCard'
import PasswordReset from './components/PasswordReset'
import { supabase } from './lib/supabase'
import { loadCloudNotes, saveVersionedNote } from './lib/notesApi'
import type { Note } from './lib/notesApi'

const colors = ['#FFE5AE', '#FAD5E5', '#E6DDFC', '#D9F1DC', '#D9EAFB', '#FFE2CC']
const stickers = ['', '🌷', '🌼', '🌸', '☁️', '🍓', '🦋', '💗', '🍀', '🧸']
const themes = {
  cream: { name: 'Cream Journal', accent: '#A8B89A', soft: '#E9EEDC', text: '#655B50', background: '#F8F3E9' },
  sakura: { name: 'Sakura Diary', accent: '#D7A2B9', soft: '#F8E4ED', text: '#785C6A', background: '#FFF1F5' },
  forest: { name: 'Forest Cottage', accent: '#79957C', soft: '#DEE8D8', text: '#506B55', background: '#EDF3E8' },
}
type Theme = keyof typeof themes
const gift = {
  greeting: 'A little place, just for you 🌷',
  letter: 'I made this little space for you. I hope it holds your thoughts, tiny memories, and everything that makes you smile. ♡',
  surprise: 'You deserve gentle days, beautiful moments, and lots of happiness. 🌼',
}

function readTheme(): Theme {
  try {
    const value = localStorage.getItem('little-notes-theme')
    if (value === 'cream' || value === 'sakura' || value === 'forest') return value
  } catch { /* Optional preference. */ }
  return 'cream'
}

function AuthGate() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setLoading(false) }
    }).catch(() => { if (active) setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) { setSession(next); setLoading(false) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  if (window.location.pathname === '/reset-password') return <PasswordReset />
  if (loading) return <main className="min-h-screen grid place-items-center">Loading your little space... 🌷</main>
  if (!session) return <AuthForm />
  return <CloudNotes key={session.user.id} userId={session.user.id} email={session.user.email ?? ''} />
}

function CloudNotes({ userId, email }: { userId: string; email: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [themeName, setThemeName] = useState<Theme>(readTheme)
  const [showLetter, setShowLetter] = useState(() => {
    try { return localStorage.getItem('little-notes-letter-seen') !== 'true' }
    catch { return true }
  })
  const [showSurprise, setShowSurprise] = useState(false)
  const [status, setStatus] = useState('Connecting to cloud...')
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
      setError('Browser storage is unavailable. Keep this tab open until changes save.')
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
        setStatus('⚠️ Recovered unsaved drafts — review and retry')
        setRemoteChange(true)
      } else setStatus('☁️ All changes saved')
    } else {
      replace(cloud)
      setStatus('☁️ All changes saved')
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
        setStatus('⏳ Saving to cloud...')
        const result = await saveVersionedNote(userId, snapshot)
        if (unmounted.current) return
        if (result.kind === 'error') {
          setStatus('⚠️ Not saved — Retry available')
          setError(result.message)
          break
        }
        if (result.kind === 'conflict') {
          setConflictId(id)
          conflictRef.current = id
          setStatus('🔀 Another device changed a note')
          break
        }
        // The server accepted the snapshot. New typing may have happened meanwhile.
        replace(notesRef.current.map(note => note.id === id
          ? { ...note, version: result.version } : note))
        if ((revision.current.get(id) ?? 0) === atRevision) dirty.current.delete(id)
        persistDrafts()
        setError('')
      }
      if (!dirty.current.size && !conflictRef.current) setStatus('☁️ All changes saved')
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
    setStatus('✏️ Unsaved changes')
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
        position: notesRef.current.length, version: 1,
      }
      const { data, error: insertError } = await supabase.from('notes')
        .insert({ ...note, user_id: userId })
        .select('version').single()
      if (insertError) throw insertError
      replace([...notesRef.current, { ...note, version: Number(data.version) }])
      setSearch('')
      setEditingId(note.id)
      setError('')
    } catch (e) { setError('Could not create note: ' + String(e)) }
    finally { setBusy(false) }
  }

  async function deleteNote(id: string) {
    if (!window.confirm('Delete this little note? 🌷')) return
    if (busyRef.current || conflictRef.current) return
    if (dirty.current.has(id)) {
      setError('Save or resolve this note before deleting it.')
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
      if (!data) { setConflictId(id); setError('Delete conflict: this note changed on another device.'); return }
      replace(notesRef.current.filter(n => n.id !== id))
      if (editingId === id) setEditingId(null)
      setError('')
    } catch (e) { setError('Delete failed: ' + String(e)) }
    finally { setBusy(false) }
  }

  async function resolveConflict(keepMine: boolean) {
    const id = conflictRef.current
    if (!id || busyRef.current) return
    setBusy(true)
    try {
      const { data, error: readError } = await supabase.from('notes')
        .select('id,title,content,color,pinned,sticker,position,version')
        .eq('id', id).eq('user_id', userId).maybeSingle()
      if (readError) throw readError
      if (!data && keepMine) {
        setError('This note was deleted remotely. Copy your draft before discarding it.')
        return
      }
      if (keepMine && data) {
        replace(notesRef.current.map(n => n.id === id ? { ...n, version: Number(data.version) } : n))
        revision.current.set(id, (revision.current.get(id) ?? 0) + 1)
      } else {
        replace(data
          ? notesRef.current.map(n => n.id === id ? {
              ...data, sticker: data.sticker ?? '', version: Number(data.version), position: Number(data.position),
            } : n)
          : notesRef.current.filter(n => n.id !== id))
        dirty.current.delete(id)
      }
      conflictRef.current = null
      setConflictId(null)
      setError('')
      persistDrafts()
      setStatus(keepMine ? '✏️ Retrying your version...' : '☁️ Cloud version loaded')
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
    setStatus('✏️ Saving new order...')
    scheduleFlush()
  }

  async function refreshCloud() {
    if (dirty.current.size || editingRef.current || busyRef.current) {
      setError('Resolve or save local changes before refreshing.')
      return
    }
    try { await fetchCloud(); setError('') }
    catch (e) { setError(String(e)) }
  }

  async function signOut() {
    if (dirty.current.size || busyRef.current) {
      setError('Unsaved changes remain. Retry saving before signing out.')
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

  if (!ready) return <main className="min-h-screen grid place-items-center">Loading your notes... ☁️</main>

  return (
    <div className="little-notes-page min-h-screen px-4 py-8 sm:px-8" style={{
      '--theme-accent': theme.accent, '--theme-soft': theme.soft,
      '--theme-text': theme.text, '--theme-background': theme.background,
    } as CSSProperties}>
      <main className="mx-auto max-w-6xl">
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold sm:text-4xl">🌷 Little Notes ♡</h1>
            <p className="mt-2 text-sm opacity-70">A little space for your thoughts.</p>
            <p className="mt-1 text-xs opacity-60">{email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="cozy-button" onClick={() => setShowLetter(true)}>💌 Letter</button>
            <button className="cozy-button" onClick={() => setShowSurprise(true)}>💗</button>
            <button className="cozy-button" onClick={() => void signOut()}>Sign Out</button>
          </div>
        </header>

        <section className="cozy-panel mb-7 p-6 sm:p-8">
          <div className="mb-3 text-3xl">🌼 ☁️ 🍃</div>
          <h2 className="mb-3 text-2xl font-bold">{gift.greeting}</h2>
          <p className="opacity-80">Keep your plans, tiny memories, and happy thoughts all in one cozy space. ♡</p>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-black/5 pt-5">
            {(Object.keys(themes) as Theme[]).map(name => (
              <button key={name} onClick={() => setThemeName(name)}
                className={`rounded-full border px-4 py-2 text-sm cursor-pointer ${themeName === name ? 'bg-white font-bold' : 'bg-white/50'}`}>
                {name === 'cream' ? '🍯' : name === 'sakura' ? '🌸' : '🌿'} {themes[name].name}
              </button>
            ))}
          </div>
        </section>

        <section className="cozy-panel mb-7 p-4" aria-live="polite">
          <p className="font-semibold">{status}</p>
          {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
          {conflictId && <div className="mt-3 flex flex-wrap gap-2">
            <button className="cozy-button" disabled={busy} onClick={() => void resolveConflict(false)}>Load cloud version (discard my draft)</button>
            <button className="cozy-button" disabled={busy} onClick={() => void resolveConflict(true)}>Keep my draft and retry</button>
          </div>}
          <div className="mt-3 flex flex-wrap gap-2">
            {dirtyCount > 0 && !conflictId &&
              <button disabled={busy} onClick={() => void retry()} className="cozy-button">↻ Retry Save ({dirtyCount})</button>}
            <button disabled={busy || dirtyCount > 0 || !!editingId}
              className="cozy-button disabled:opacity-40" onClick={() => void refreshCloud()}>☁️ Refresh Cloud</button>
            {remoteChange && <span className="text-sm self-center">Remote changes available</span>}
          </div>
        </section>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-2xl font-bold">Your little note wall ✨</h2>
            <p className="mt-1 text-sm opacity-70">{notes.length} notes · {notes.filter(n => n.pinned).length} pinned</p>
          </div>
          <button disabled={busy || !!conflictId} className="cozy-primary-button disabled:opacity-40" onClick={() => void addNote()}>+ New Note</button>
        </div>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search your little notes..." aria-label="Search notes"
          className="mb-5 w-full rounded-2xl border border-white bg-white/80 p-4 outline-none" />
        <p className="mb-5 text-xs opacity-65">⠿ Drag to reorder · Search and editing temporarily disable dragging</p>

        {filtered.length === 0 ? <div className="cozy-panel p-12 text-center">🌼 No notes found. Create a little memory!</div> :
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={filtered.map(n => n.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(note => <NoteCard key={note.id} note={note} colors={colors} stickers={stickers}
                  editing={editingId === note.id} dragDisabled={dragDisabled}
                  onEdit={() => setEditingId(note.id)} onDone={() => void finishEditing()}
                  onDelete={() => void deleteNote(note.id)}
                  onPin={() => editNote(note.id, { pinned: !note.pinned })}
                  onUpdate={patch => editNote(note.id, patch)} />)}
              </div>
            </SortableContext>
          </DndContext>}
        <footer className="mt-20 pb-6 text-center text-sm opacity-70">Slow days, soft thoughts, little joys. 🌼</footer>
      </main>

      {/* Mobile floating new note button */}
      <button
          type="button"
          onClick={() => void addNote()}
          disabled={busy || !!conflictId}
          aria-label="Create a new note"
          title="Create a new note"
          className="fixed right-5 z-50
             flex h-14 w-14
             items-center justify-center
             rounded-full
             bg-[#A8B89A]
             text-3xl text-[#263526]
             shadow-xl
             transition-transform
             hover:scale-105
             active:scale-95
             disabled:cursor-not-allowed
             disabled:opacity-40
             sm:hidden
             bottom-[calc(env(safe-area-inset-bottom)+1.5rem)]"
      >
        +
      </button>

      {showLetter && <div className="cozy-modal-backdrop"><div role="dialog" aria-modal="true" aria-label="A little letter" className="cozy-letter">
        <div className="mb-5 text-4xl">💌 🌷</div><h2 className="mb-5 text-2xl font-bold">A little letter for you</h2>
        <p className="leading-8">{gift.letter}</p>
        <button autoFocus className="cozy-primary-button mt-7 w-full" onClick={() => {
          setShowLetter(false)
          try { localStorage.setItem('little-notes-letter-seen', 'true') } catch { /* optional */ }
        }}>Keep this little letter ♡</button>
      </div></div>}
      {showSurprise && !showLetter && <div className="cozy-modal-backdrop"><div role="dialog" aria-modal="true" aria-label="A little surprise" className="cozy-letter text-center">
        <div className="mb-5 text-5xl">💗 ✨</div><h2 className="mb-5 text-2xl font-bold">Just a little reminder...</h2>
        <p className="leading-8">{gift.surprise}</p><button autoFocus onClick={() => setShowSurprise(false)} className="cozy-primary-button mt-8 w-full">Aww, thank you ♡</button>
      </div></div>}
    </div>
  )
}

export default AuthGate
