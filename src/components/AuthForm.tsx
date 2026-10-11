
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/useLanguage'

type AuthFormProps = {
    onSignupSessionHold?: (hold: boolean) => void
}

export default function AuthForm({ onSignupSessionHold }: AuthFormProps) {
    const { language, setLanguage, t } = useLanguage()
    const [mode, setMode] = useState<'login' | 'signup'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [showSignupSuccess, setShowSignupSuccess] = useState(false)
    const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false)

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (loading) return

        setLoading(true)
        setMessage('')

        try {
            if (mode === 'signup') {
                onSignupSessionHold?.(true)
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                    },
                })

                if (error) throw error

                setNeedsEmailConfirmation(!data.session)
                if (data.session) {
                    const { error: signOutError } = await supabase.auth.signOut()
                    if (signOutError) throw signOutError
                }
                setPassword('')
                setShowSignupSuccess(true)
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email: email.trim(),
                    password,
                })

                if (error) throw error
            }
        } catch (error) {
            setMessage(
                error instanceof Error
                    ? error.message
                    : t('somethingWrong')
            )
        } finally {
            if (mode === 'signup') onSignupSessionHold?.(false)
            setLoading(false)
        }
    }

    async function resetPassword() {
        if (!email.trim()) {
            setMessage(t('enterEmail'))
            return
        }

        setLoading(true)
        setMessage('')

        const { error } = await supabase.auth.resetPasswordForEmail(
            email.trim(),
            {
                redirectTo: new URL('/reset-password', window.location.origin).toString(),
            }
        )

        setMessage(
            error
                ? error.message
                : t('resetEmailSent')
        )

        setLoading(false)
    }

    return (
        <div className="min-h-screen bg-[#f8f3e9] px-5 py-12
                    flex items-center justify-center">
            <main className="w-full max-w-md rounded-3xl
                       border border-white bg-white/85
                       p-7 shadow-xl sm:p-10">
                <div className="mb-5 flex justify-end gap-1" role="group" aria-label={t('selectLanguage')}>
                    <button type="button" onClick={() => setLanguage('zh')} aria-pressed={language === 'zh'}
                            className={`rounded-full px-3 py-1 text-sm ${language === 'zh' ? 'bg-[#a8b89a] font-semibold' : 'bg-[#f6f1e7]'}`}>
                        {t('chinese')}
                    </button>
                    <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'}
                            className={`rounded-full px-3 py-1 text-sm ${language === 'en' ? 'bg-[#a8b89a] font-semibold' : 'bg-[#f6f1e7]'}`}>
                        {t('english')}
                    </button>
                </div>
                <div className="mb-6 text-center text-4xl">
                    🌷 💌 ☁️
                </div>

                <h1 className="text-center text-3xl font-bold
                       text-[#75695a]">
                    {t('appTitle')}
                </h1>

                <p className="mt-3 text-center text-sm text-[#948679]">
                    {t('authSubtitle')}
                </p>

                <h2 className="mt-9 mb-5 text-xl font-semibold
                       text-[#75695a]">
                    {mode === 'login'
                        ? t('welcomeBack')
                        : t('createSpace')}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="email"
                            className="mb-2 block text-sm font-medium"
                        >
                            {t('emailAddress')}
                        </label>

                        <input
                            id="email"
                            type="email"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="w-full rounded-xl border
                         border-[#e5dfd3] bg-white
                         p-3 outline-none
                         focus:border-[#a8b89a]"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="password"
                            className="mb-2 block text-sm font-medium"
                        >
                            {t('password')}
                        </label>

                        <input
                            id="password"
                            type="password"
                            required
                            minLength={6}
                            autoComplete={
                                mode === 'login'
                                    ? 'current-password'
                                    : 'new-password'
                            }
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder={t('passwordPlaceholder')}
                            className="w-full rounded-xl border
                         border-[#e5dfd3] bg-white
                         p-3 outline-none
                         focus:border-[#a8b89a]"
                        />
                    </div>

                    {message && (
                        <p role="status" className="rounded-xl bg-[#f6f1e7]
                                       p-3 text-sm text-[#75695a]">
                            {message}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full cursor-pointer rounded-xl
                       bg-[#a8b89a] px-5 py-3
                       font-semibold text-[#263526]
                       hover:bg-[#99ab89]
                       disabled:opacity-50"
                    >
                        {loading
                            ? t('pleaseWait')
                            : mode === 'login'
                                ? t('signIn')
                                : t('createAccount')}
                    </button>
                </form>

                {mode === 'login' && (
                    <button
                        type="button"
                        onClick={resetPassword}
                        disabled={loading}
                        className="mt-4 w-full cursor-pointer
                       text-sm text-[#827467] underline"
                    >
                        {t('forgotPassword')}
                    </button>
                )}

                <div className="mt-7 text-center text-sm">
                    {mode === 'login'
                        ? t('noAccount')
                        : t('haveAccount')}

                    <button
                        type="button"
                        onClick={() => {
                            setMode(mode === 'login' ? 'signup' : 'login')
                            setMessage('')
                        }}
                        className="ml-2 cursor-pointer font-bold
                       text-[#79957c] underline"
                    >
                        {mode === 'login' ? t('signUp') : t('signInPlain')}
                    </button>
                </div>
            </main>

            {showSignupSuccess && (
                <div className="cozy-modal-backdrop">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="signup-success-title"
                        className="cozy-letter text-center"
                    >
                        <div className="mb-5 text-5xl">🌷 ✨</div>
                        <h2 id="signup-success-title" className="mb-4 text-2xl font-bold">
                            {t('signupSuccessTitle')}
                        </h2>
                        <p className="leading-7">
                            {needsEmailConfirmation
                                ? t('signupSuccessConfirmEmail')
                                : t('signupSuccessBody')}
                        </p>
                        <button
                            type="button"
                            autoFocus
                            className="cozy-primary-button mt-7 w-full"
                            onClick={() => {
                                setShowSignupSuccess(false)
                                setMode('login')
                                setMessage('')
                            }}
                        >
                            {t('backToLogin')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
