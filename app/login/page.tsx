'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAuth = async () => {
    setLoading(true)
    setMessage('')
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMessage(error.message)
      else setMessage('Vérifiez votre email pour confirmer votre compte !')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage(error.message)
      else window.location.href = '/calendar'
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="bg-zinc-900 p-8 rounded-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2">Life in Weeks</h1>
        <p className="text-zinc-400 mb-8">Votre vie, semaine par semaine.</p>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full bg-zinc-800 text-white p-3 rounded-lg mb-3 outline-none"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-zinc-800 text-white p-3 rounded-lg mb-6 outline-none"
        />
        <button
          onClick={handleAuth}
          disabled={loading}
          className="w-full bg-white text-black font-bold p-3 rounded-lg mb-4 hover:bg-zinc-200 transition"
        >
          {loading ? 'Chargement...' : isSignUp ? 'Créer mon compte' : 'Se connecter'}
        </button>
        <p
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-zinc-400 text-center cursor-pointer hover:text-white"
        >
          {isSignUp ? 'Déjà un compte ? Se connecter' : "Pas de compte ? S'inscrire"}
        </p>
        {message && <p className="text-yellow-400 text-center mt-4">{message}</p>}
      </div>
    </div>
  )
}