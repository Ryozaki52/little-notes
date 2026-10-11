import { useMemo, useState } from 'react'
import type { Language, Translate, TranslationKey } from '../i18n/translations'
import type { Note } from '../lib/notesApi'

type CalendarViewProps = {
    notes: Note[]
    language: Language
    disabled: boolean
    t: Translate
    onAssignDate: (noteId: string, date: string | null) => void
}

const weekKeys: TranslationKey[] = [
    'monday', 'tuesday', 'wednesday', 'thursday',
    'friday', 'saturday', 'sunday',
]

function dateKey(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

export default function CalendarView({
    notes,
    language,
    disabled,
    t,
    onAssignDate,
}: CalendarViewProps) {
    const today = useMemo(() => new Date(), [])
    const [month, setMonth] = useState(() => startOfMonth(today))
    const [selectedDate, setSelectedDate] = useState(() => dateKey(today))
    const [selectedNoteId, setSelectedNoteId] = useState('')
    const locale = language === 'zh' ? 'zh-CN' : 'en-US'

    const days = useMemo(() => {
        const firstWeekday = (month.getDay() + 6) % 7
        const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - firstWeekday)
        return Array.from({ length: 42 }, (_, index) => {
            const day = new Date(gridStart)
            day.setDate(gridStart.getDate() + index)
            return day
        })
    }, [month])

    const notesByDate = useMemo(() => {
        const grouped = new Map<string, Note[]>()
        for (const note of notes) {
            if (!note.calendar_date) continue
            const group = grouped.get(note.calendar_date) ?? []
            group.push(note)
            grouped.set(note.calendar_date, group)
        }
        return grouped
    }, [notes])

    const selectedNotes = notesByDate.get(selectedDate) ?? []
    const availableNotes = notes.filter(note => note.calendar_date !== selectedDate)

    function changeMonth(offset: number) {
        const next = new Date(month.getFullYear(), month.getMonth() + offset, 1)
        setMonth(next)
        setSelectedDate(dateKey(next))
        setSelectedNoteId('')
    }

    function goToToday() {
        setMonth(startOfMonth(today))
        setSelectedDate(dateKey(today))
        setSelectedNoteId('')
    }

    function attachSelectedNote() {
        if (!selectedNoteId || disabled) return
        onAssignDate(selectedNoteId, selectedDate)
        setSelectedNoteId('')
    }

    return (
        <section aria-labelledby="calendar-title">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 id="calendar-title" className="text-2xl font-bold">{t('calendarTitle')}</h2>
                    <p className="mt-1 text-sm opacity-70">{t('calendarDescription')}</p>
                </div>
                <button type="button" className="cozy-button" onClick={goToToday}>
                    {t('today')}
                </button>
            </div>

            <div className="cozy-panel overflow-hidden p-3 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        className="cozy-button"
                        aria-label={t('previousMonth')}
                        title={t('previousMonth')}
                        onClick={() => changeMonth(-1)}
                    >
                        ‹
                    </button>
                    <h3 className="text-lg font-bold">
                        {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(month)}
                    </h3>
                    <button
                        type="button"
                        className="cozy-button"
                        aria-label={t('nextMonth')}
                        title={t('nextMonth')}
                        onClick={() => changeMonth(1)}
                    >
                        ›
                    </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold opacity-65 sm:gap-2">
                    {weekKeys.map(key => <div key={key} className="py-2">{t(key)}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {days.map(day => {
                        const key = dateKey(day)
                        const dayNotes = notesByDate.get(key) ?? []
                        const isCurrentMonth = day.getMonth() === month.getMonth()
                        const isSelected = key === selectedDate
                        const isToday = key === dateKey(today)
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => {
                                    setSelectedDate(key)
                                    if (!isCurrentMonth) setMonth(startOfMonth(day))
                                }}
                                className={`min-h-20 rounded-xl border p-1 text-left align-top transition sm:min-h-28 sm:p-2 ${
                                    isSelected
                                        ? 'border-[var(--theme-accent)] bg-white shadow-sm ring-2 ring-[var(--theme-soft)]'
                                        : 'border-white/70 bg-white/45 hover:bg-white/80'
                                } ${isCurrentMonth ? '' : 'opacity-40'}`}
                            >
                                <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs ${
                                    isToday ? 'bg-[var(--theme-accent)] font-bold text-white' : ''
                                }`}>
                                    {day.getDate()}
                                </span>
                                <span className="mt-1 block space-y-1">
                                    {dayNotes.slice(0, 2).map(note => (
                                        <span
                                            key={note.id}
                                            className="block truncate rounded-md px-1 py-0.5 text-[10px] sm:text-xs"
                                            style={{ backgroundColor: note.color }}
                                        >
                                            {note.sticker} {note.title || t('untitled')}
                                        </span>
                                    ))}
                                    {dayNotes.length > 2 && (
                                        <span className="block px-1 text-[10px] opacity-65">+{dayNotes.length - 2}</span>
                                    )}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            <div className="cozy-panel mt-6 p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{t('selectedDate')}</p>
                <h3 className="mt-1 text-xl font-bold">
                    {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
                        .format(new Date(`${selectedDate}T12:00:00`))}
                </h3>
                <p className="mt-2 text-sm opacity-65">{t('calendarHelp')}</p>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <select
                        value={selectedNoteId}
                        disabled={disabled || availableNotes.length === 0}
                        onChange={event => setSelectedNoteId(event.target.value)}
                        aria-label={t('chooseSavedNote')}
                        className="min-w-0 flex-1 rounded-xl border border-white bg-white/80 p-3 outline-none disabled:opacity-50"
                    >
                        <option value="">{t('chooseSavedNote')}</option>
                        {availableNotes.map(note => (
                            <option key={note.id} value={note.id}>
                                {note.title || t('untitled')}
                                {note.calendar_date ? ` · ${t('scheduledFor')} ${note.calendar_date}` : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="cozy-primary-button disabled:opacity-50"
                        disabled={disabled || !selectedNoteId}
                        onClick={attachSelectedNote}
                    >
                        {t('attachNote')}
                    </button>
                </div>

                <div className="mt-7">
                    <h4 className="font-bold">{t('notesOnDate')}</h4>
                    {selectedNotes.length === 0 ? (
                        <p className="mt-3 rounded-xl bg-white/45 p-4 text-sm opacity-70">{t('noNotesOnDate')}</p>
                    ) : (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {selectedNotes.map(note => (
                                <article key={note.id} className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: note.color }}>
                                    <h5 className="font-bold">{note.sticker} {note.title || t('untitled')}</h5>
                                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm opacity-75">
                                        {note.content || t('emptyContent')}
                                    </p>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => onAssignDate(note.id, null)}
                                        className="mt-4 cursor-pointer rounded-xl bg-white/60 px-3 py-2 text-xs hover:bg-white disabled:opacity-50"
                                    >
                                        {t('removeFromCalendar')}
                                    </button>
                                </article>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}
