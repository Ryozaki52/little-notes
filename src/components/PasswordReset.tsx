
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useLanguage } from '../i18n/useLanguage'

export default function PasswordReset() {
    const { language, setLanguage, t } = useLanguage()
    const [ready, setReady] = useState(false)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        let active = true

        const { data: { subscription } } =
            supabase.auth.onAuthStateChange((event, session) => {
                if (!active) return

                if (event === 'PASSWORD_RECOVERY' && session) {
                    setReady(true)
                }
            })

        void supabase.auth.getSession().then(({ data }) => {
            if (active && data.session) {
                setReady(true)
            }
        })

        return () => {
            active = false
            subscription.unsubscribe()
        }
    }, [])

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()

        if (password.length < 8) {
            setMessage(t('passwordTooShort'))
            return
        }

        if (password !== confirm) {
            setMessage(t('passwordsMismatch'))
            return
        }

        setLoading(true)
        setMessage('')

        const { error } = await supabase.auth.updateUser({
            password,
        })

        if (error) {
            setMessage(error.message)
        } else {
            setSuccess(true)
            setMessage(t('passwordUpdated'))
        }

        setLoading(false)
    }

    async function returnToLogin() {
        await supabase.auth.signOut()
        window.location.replace('/')
    }

    return (
        <div className="flex min-h-screen items-center
                    justify-center bg-[#f8f3e9] px-5">
            <main className="w-full max-w-md rounded-3xl
                       bg-white p-8 shadow-xl">
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

                <div className="mb-5 text-center text-5xl">
                    💌
                </div>

                <h1 className="text-center text-2xl font-bold
                       text-[#75695a]">
                    {t('resetPassword')}
                </h1>

                <p className="mb-7 mt-3 text-center
                      text-sm text-[#948679]">
                    {t('resetSubtitle')}
                </p>

                {message && (
                    <p role="status"
                       className="mb-5 rounded-xl bg-[#f2eee4]
                        p-3 text-sm">
                        {message}
                    </p>
                )}

                {success ? (
                    <button
                        type="button"
                        onClick={returnToLogin}
                        className="cozy-primary-button w-full"
                    >
                        {t('backToSignIn')}
                    </button>
                ) : !ready ? (
                    <div className="text-center">
                        <p className="mb-4 text-sm">
                            {t('checkingRecovery')}
                        </p>

                        <button
                            type="button"
                            onClick={returnToLogin}
                            className="cozy-button"
                        >
                            {t('backToSignIn')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}
                          className="space-y-4">

                        <label className="block text-sm font-medium">
                            {t('newPassword')}
                            <input
                                type="password"
                                required
                                minLength={8}
                                autoComplete="new-password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="mt-2 w-full rounded-xl
                           border border-[#e5dfd3] p-3"
                            />
                        </label>

                        <label className="block text-sm font-medium">
                            {t('confirmPassword')}
                            <input
                                type="password"
                                required
                                autoComplete="new-password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                className="mt-2 w-full rounded-xl
                           border border-[#e5dfd3] p-3"
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={loading}
                            className="cozy-primary-button w-full
                         disabled:opacity-50"
                        >
                            {loading
                                ? t('updating')
                                : t('saveNewPassword')}
                        </button>

                    </form>
                )}
            </main>
        </div>
    )
}
