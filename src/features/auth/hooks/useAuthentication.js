import { useEffect, useState } from 'react'
import { supabase } from '../../../services/supabase.js'
export default function useAuthentication() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!supabase) return
    let active = true
    let authChanged = false
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      authChanged = true
      if (active) {
        setSession(next)
        setLoading(false)
      }
    })
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || authChanged) return
        setSession(data.session)
        if (error) setError('Could not restore your session. Please log in again.')
        setLoading(false)
      })
      .catch(() => {
        if (active && !authChanged) {
          setError('Could not connect. Check your connection and try again.')
          setLoading(false)
        }
      })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (!supabase || busy) return
    setError('')
    setNotice('')
    if (mode === 'signup' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const credentials = {
        email: email.trim(),
        password,
      }
      const { data, error } =
        mode === 'signup'
          ? await supabase.auth.signUp(credentials)
          : await supabase.auth.signInWithPassword(credentials)
      if (error) throw error
      setPassword('')
      setConfirm('')
      if (mode === 'signup' && !data.session) {
        setNotice(
          'Check your email to confirm your account, then return here to log in. If you already have an account, log in instead.',
        )
        setMode('login')
      }
    } catch (error) {
      setError(error.message || 'Could not connect. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  async function signOut() {
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.signOut({
        scope: 'local',
      })
      if (error) throw error
      setSession(null)
      setPassword('')
      setConfirm('')
      setNotice('You have been signed out.')
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return {
    loading,
    session,
    busy,
    signOut,
    error,
    mode,
    email,
    setEmail,
    password,
    setPassword,
    confirm,
    setConfirm,
    notice,
    submit,
    setMode,
    setError,
    setNotice,
  }
}
