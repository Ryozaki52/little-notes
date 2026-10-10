
import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthForm() {
    const [mode, setMode] = useState<'login' | 'signup'>('login')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (loading) return

        setLoading(true)
        setMessage('')

        try {
            if (mode === 'signup') {
                const { data, error } = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                    },
                })

                if (error) throw error

                setMessage(
                    data.session
                        ? 'Account created! Welcome to Little Notes ♡'
                        : 'Check your email for a confirmation link 💌'
                )
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
                    : 'Something went wrong.'
            )
        } finally {
            setLoading(false)
        }
    }

    async function resetPassword() {
        if (!email.trim()) {
            setMessage('Enter your email address first.')
            return
        }

        setLoading(true)
        setMessage('')

        const { error } = await supabase.auth.resetPasswordForEmail(
            email.trim(),
            {
                redirectTo: window.location.origin,
            }
        )

        setMessage(
            error
                ? error.message
                : 'If the account exists, a password reset email will be sent.'
        )

        setLoading(false)
    }

    return (
        <div className="min-h-screen bg-[#f8f3e9] px-5 py-12
                    flex items-center justify-center">
            <main className="w-full max-w-md rounded-3xl
                       border border-white bg-white/85
                       p-7 shadow-xl sm:p-10">
                <div className="mb-6 text-center text-4xl">
                    🌷 💌 ☁️
                </div>

                <h1 className="text-center text-3xl font-bold
                       text-[#75695a]">
                    Little Notes ♡
                </h1>

                <p className="mt-3 text-center text-sm text-[#948679]">
                    Your own cozy little corner.
                </p>

                <h2 className="mt-9 mb-5 text-xl font-semibold
                       text-[#75695a]">
                    {mode === 'login'
                        ? 'Welcome back 🌼'
                        : 'Create your little space 🌷'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="email"
                            className="mb-2 block text-sm font-medium"
                        >
                            Email address
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
                            Password
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
                            placeholder="Your password"
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
                            ? 'Please wait...'
                            : mode === 'login'
                                ? 'Sign In ♡'
                                : 'Create Account 🌷'}
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
                        Forgot password?
                    </button>
                )}

                <div className="mt-7 text-center text-sm">
                    {mode === 'login'
                        ? "Don't have an account?"
                        : 'Already have an account?'}

                    <button
                        type="button"
                        onClick={() => {
                            setMode(mode === 'login' ? 'signup' : 'login')
                            setMessage('')
                        }}
                        className="ml-2 cursor-pointer font-bold
                       text-[#79957c] underline"
                    >
                        {mode === 'login' ? 'Sign Up' : 'Sign In'}
                    </button>
                </div>
            </main>
        </div>
    )
}
