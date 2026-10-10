
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function PasswordReset() {
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
            setMessage('Password must be at least 8 characters.')
            return
        }

        if (password !== confirm) {
            setMessage('Passwords do not match.')
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
            setMessage('Password updated successfully! 🌷')
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

                <div className="mb-5 text-center text-5xl">
                    💌
                </div>

                <h1 className="text-center text-2xl font-bold
                       text-[#75695a]">
                    Reset Password
                </h1>

                <p className="mb-7 mt-3 text-center
                      text-sm text-[#948679]">
                    A fresh start for your little space. ♡
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
                        Back to Sign In ♡
                    </button>
                ) : !ready ? (
                    <div className="text-center">
                        <p className="mb-4 text-sm">
                            Checking recovery session...
                        </p>

                        <button
                            type="button"
                            onClick={returnToLogin}
                            className="cozy-button"
                        >
                            Back to Sign In
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}
                          className="space-y-4">

                        <label className="block text-sm font-medium">
                            New Password
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
                            Confirm Password
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
                                ? 'Updating...'
                                : 'Save New Password 🌷'}
                        </button>

                    </form>
                )}
            </main>
        </div>
    )
}
