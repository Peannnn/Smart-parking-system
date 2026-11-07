import { useEffect, useState } from 'react'
import { supabase } from '../utils/supabase'
import App from './Parking.jsx'

export default function Auth() {
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      authChanged = true
      if (active) { setSession(next); setLoading(false) }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authChanged) return
      setSession(data.session)
      if (error) setError('Could not restore your session. Please log in again.')
      setLoading(false)
    }).catch(() => {
      if (active && !authChanged) { setError('Could not connect. Check your connection and try again.'); setLoading(false) }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!supabase || busy) return
    setError('')
    setNotice('')
    if (mode === 'signup' && password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const credentials = { email: email.trim(), password }
      const { data, error } = mode === 'signup'
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials)
      if (error) throw error
      setPassword('')
      setConfirm('')
      if (mode === 'signup' && !data.session) {
        setNotice('Check your email to confirm your account, then return here to log in. If you already have an account, log in instead.')
        setMode('login')
      }
    } catch (error) {
      setError(error.message || 'Could not connect. Please try again.')
    } finally { setBusy(false) }
  }

  async function signOut() {
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      setSession(null)
      setPassword('')
      setConfirm('')
      setNotice('You have been signed out.')
    } catch { setError('Could not sign out. Please try again.') }
    finally { setBusy(false) }
  }

  if (loading) return <main className="auth-layout"><p role="status">Restoring your session…</p></main>
  if (session) return <>
    <div className="account-bar"><span>Signed in as <strong>{session.user.email}</strong></span><button className="button primary" disabled={busy} onClick={signOut}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p className="error" role="alert">{error}</p>}</div>
    <App key={session.user.id} userId={session.user.id} />
  </>

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#"><span className="brand-icon">P</span>Smart<span className="brand-light">Park</span></a><span className="workspace-label">SMART PARKING SYSTEM</span></header>
    <main className="auth-layout">
      <section className="panel auth-panel" aria-labelledby="auth-title">
        <div className="auth-intro"><p className="eyebrow">WELCOME TO SMARTPARK</p><h1 id="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}<span>.</span></h1><p>{mode === 'signup' ? 'Create an account to access your parking workspace.' : 'Log in to access your parking workspace.'}</p></div>
        {!supabase ? <div className="review-body"><p className="error" role="alert">Account access needs a Supabase connection. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the app.</p></div> : <form className="auth-form" onSubmit={submit}>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={busy} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} minLength={mode === 'signup' ? 8 : undefined} required disabled={busy} aria-describedby={mode === 'signup' ? 'password-hint' : undefined} />
          {mode === 'signup' && <><p id="password-hint" className="review-hint">Use at least 8 characters.</p><label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} required disabled={busy} /></>}
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="notice" role="status">{notice}</p>}
          <button className="button primary save-button" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
          <p className="auth-switch">{mode === 'signup' ? 'Already have an account?' : 'New to SmartPark?'} <button type="button" disabled={busy} onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setNotice(''); setPassword(''); setConfirm('') }}>{mode === 'signup' ? 'Log in' : 'Create an account'}</button></p>
        </form>}
      </section>
    </main>
  </div>
}
