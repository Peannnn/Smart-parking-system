import useAuthentication from './hooks/useAuthentication.js'
import { supabase } from '../../services/supabase.js'
import ParkingWorkspace from '../parking/ParkingWorkspace.jsx'
export default function AuthScreen() {
  const {
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
  } = useAuthentication()
  if (loading)
    return (
      <main className="auth-layout">
        <p role="status">Restoring your session…</p>
      </main>
    )
  if (session)
    return (
      <>
        <div className="account-bar">
          <span>
            Signed in as <strong>{session.user.email}</strong>
          </span>
          <button className="button primary" disabled={busy} onClick={signOut}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <ParkingWorkspace key={session.user.id} userId={session.user.id} />
      </>
    )
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-icon">P</span>Smart<span className="brand-light">Park</span>
        </a>
        <span className="workspace-label">SMART PARKING SYSTEM</span>
      </header>
      <main className="auth-layout">
        <section className="panel auth-panel" aria-labelledby="auth-title">
          <div className="auth-intro">
            <p className="eyebrow">WELCOME TO SMARTPARK</p>
            <h1 id="auth-title">
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
              <span>.</span>
            </h1>
            <p>
              {mode === 'signup'
                ? 'Create an account to access your parking workspace.'
                : 'Log in to access your parking workspace.'}
            </p>
          </div>
          {!supabase ? (
            <div className="review-body">
              <p className="error" role="alert">
                Account access needs a Supabase connection. Set VITE_SUPABASE_URL and
                VITE_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart the app.
              </p>
            </div>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
                disabled={busy}
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === 'signup' ? 8 : undefined}
                required
                disabled={busy}
                aria-describedby={mode === 'signup' ? 'password-hint' : undefined}
              />
              {mode === 'signup' && (
                <>
                  <p id="password-hint" className="review-hint">
                    Use at least 8 characters.
                  </p>
                  <label htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    required
                    disabled={busy}
                  />
                </>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="notice" role="status">
                  {notice}
                </p>
              )}
              <button className="button primary save-button" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
              </button>
              <p className="auth-switch">
                {mode === 'signup' ? 'Already have an account?' : 'New to SmartPark?'}{' '}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMode(mode === 'signup' ? 'login' : 'signup')
                    setError('')
                    setNotice('')
                    setPassword('')
                    setConfirm('')
                  }}
                >
                  {mode === 'signup' ? 'Log in' : 'Create an account'}
                </button>
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
