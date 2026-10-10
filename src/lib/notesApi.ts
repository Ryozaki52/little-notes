import { supabase } from './supabase'

export type Note = {
  id: string
  title: string
  content: string
  color: string
  pinned: boolean
  sticker?: string
  position: number
  version: number
}

export type SaveResult =
  | { kind: 'saved'; version: number }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string }

export async function saveVersionedNote(userId: string, note: Note): Promise<SaveResult> {
  try {
    const { data, error } = await supabase
      .from('notes')
      .update({
        title: note.title,
        content: note.content,
        color: note.color,
        pinned: note.pinned,
        sticker: note.sticker ?? '',
        position: note.position,
      })
      .eq('id', note.id)
      .eq('user_id', userId)
      .eq('version', note.version)
      .select('version')
      .maybeSingle()
    if (error) return { kind: 'error', message: error.message }
    if (!data) return { kind: 'conflict' }
    return { kind: 'saved', version: Number(data.version) }
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : 'Network error' }
  }
}

export async function loadCloudNotes(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('id,title,content,color,pinned,sticker,position,version')
    .eq('user_id', userId)
    .order('position', { ascending: true })
  if (error) throw error
  return ((data ?? []) as Note[]).map(note => ({
    ...note,
    sticker: note.sticker ?? '',
    position: Number(note.position),
    version: Number(note.version),
  }))
}
