
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import type { Translate } from '../i18n/translations'

export type Note = {
    id: string
    title: string
    content: string
    color: string
    pinned: boolean
    sticker?: string
    calendar_date: string | null
    position: number
    version: number
}

type NoteCardProps = {
    note: Note
    editing: boolean
    dragDisabled: boolean
    colors: string[]
    stickers: string[]
    onEdit: () => void
    onDone: () => void
    onDelete: () => void
    onPin: () => void
    onUpdate: (changes: Partial<Note>) => void
    t: Translate
}


export default function NoteCard({
                                     note,
                                     editing,
                                     dragDisabled,
                                     colors,
                                     stickers,
                                     onEdit,
                                     onDone,
                                     onDelete,
                                     onPin,
                                     onUpdate,
                                     t,
                                 }: NoteCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: note.id,
        disabled: dragDisabled || editing,
    })

    const style: CSSProperties = {
        backgroundColor: note.color,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 20 : undefined,
        opacity: isDragging ? 0.82 : 1,
        boxShadow: isDragging
            ? '0 22px 40px rgba(105, 85, 65, 0.2)'
            : undefined,
    }

    return (
        <article
            ref={setNodeRef}
            style={style}
            className="note-card relative flex min-h-72
                 flex-col rounded-2xl p-6"
        >
            {/* Washi tape decoration */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute
                   -top-2 left-1/2 h-7 w-24
                   -translate-x-1/2 -rotate-3
                   rounded-sm bg-white/45"
            />

            {/* Drag and pin toolbar */}
            <div className="mb-5 flex items-center
                      justify-between gap-3">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    disabled={dragDisabled || editing}
                    style={{ touchAction: 'none' }}
                    aria-label={`${t('dragNote')}: ${note.title || t('untitled')}`}
                    title={t('dragTitle')}
                    className="cursor-grab rounded-xl
                     bg-white/45 px-3 py-2
                     text-sm text-[#665B52]
                     hover:bg-white/80
                     active:cursor-grabbing
                     disabled:cursor-not-allowed
                     disabled:opacity-50"
                >
                    {t('drag')}
                </button>

                <button
                    type="button"
                    onClick={onPin}
                    aria-label={note.pinned ? t('unpinNote') : t('pinNote')}
                    aria-pressed={note.pinned}
                    className="cursor-pointer rounded-full
                     bg-white/50 p-2
                     hover:bg-white/85"
                >
                    {note.pinned ? '📌' : '📍'}

                </button>
            </div>

            {editing ? (
                <div className="flex flex-1 flex-col gap-3">

                    <input
                        aria-label={t('noteTitle')}
                        value={note.title}
                        maxLength={100}
                        onChange={e =>
                            onUpdate({ title: e.target.value })
                        }
                        placeholder={t('titlePlaceholder')}
                        className="w-full rounded-xl bg-white/55
                       p-3 font-semibold outline-none"
                    />

                    <textarea
                        aria-label={t('noteContent')}
                        value={note.content}
                        onChange={e =>
                            onUpdate({ content: e.target.value })
                        }
                        placeholder={t('contentPlaceholder')}
                        className="min-h-32 w-full flex-1
                       resize-y rounded-xl
                       bg-white/55 p-3 text-sm
                       leading-7 outline-none"
                    />

                    {/* Note color */}
                    <div>
                        <p className="mb-2 text-xs font-semibold
                          text-[#76675D]">
                            {t('paperColor')}
                        </p>

                        <div className="flex flex-wrap gap-2">
                            {colors.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    aria-label={`${t('chooseColor')} ${color}`}
                                    aria-pressed={note.color === color}
                                    onClick={() => onUpdate({ color })}
                                    className={`h-8 w-8 cursor-pointer
                              rounded-full border-2
                              hover:scale-110 ${
                                        note.color === color
                                            ? 'border-[#907664] ring-2 ring-white'
                                            : 'border-white'
                                    }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Sticker selection */}
                    <div>
                        <p className="mb-2 text-xs font-semibold
                          text-[#76675D]">
                            {t('sticker')}
                        </p>

                        <div className="flex flex-wrap gap-2">
                            {stickers.map(sticker => (
                                <button
                                    key={sticker || 'none'}
                                    type="button"
                                    aria-label={
                                        sticker
                                            ? `${t('chooseSticker')} ${sticker}`
                                            : t('removeSticker')
                                    }
                                    aria-pressed={
                                        (note.sticker || '') === sticker
                                    }
                                    onClick={() => onUpdate({ sticker })}
                                    className={`flex h-10 w-10
                              cursor-pointer items-center
                              justify-center rounded-xl
                              bg-white/50 text-xl
                              hover:bg-white/85 ${
                                        (note.sticker || '') === sticker
                                            ? 'ring-2 ring-[#907664]'
                                            : ''
                                    }`}
                                >
                                    {sticker || '✕'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onDone}
                        className="mt-2 cursor-pointer rounded-xl
                       bg-white/75 px-4 py-3
                       font-semibold text-[#675549]
                       hover:bg-white"
                    >
                        {t('save')}
                    </button>
                </div>
            ) : (
                <div className="flex flex-1 flex-col">

                    {note.sticker && (
                        <div
                            aria-label={`${t('stickerLabel')} ${note.sticker}`}
                            className="mb-3 text-3xl"
                        >
                            {note.sticker}
                        </div>
                    )}

                    <h3 className="mb-4 break-words text-lg
                         font-bold text-[#564B46]">
                        {note.title || t('untitled')}
                    </h3>

                    <p className="mb-6 flex-1 whitespace-pre-wrap
                        break-words text-sm leading-7
                        text-[#655A53]">
                        {note.content || t('emptyContent')}
                    </p>

                    <div className="flex flex-wrap gap-2
                          border-t border-black/5 pt-4">
                        <button
                            type="button"
                            onClick={onEdit}
                            className="cursor-pointer rounded-xl
                         bg-white/50 px-3 py-2
                         text-sm hover:bg-white/85"
                        >
                            {t('edit')}
                        </button>

                        <button
                            type="button"
                            onClick={onDelete}
                            className="cursor-pointer rounded-xl
                         bg-white/50 px-3 py-2
                         text-sm hover:bg-white/85"
                        >
                            {t('delete')}
                        </button>
                    </div>
                </div>
            )}
        </article>
    )
}
