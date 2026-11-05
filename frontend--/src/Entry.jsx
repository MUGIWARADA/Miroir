import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';

export default function Entry() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState('home');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const verificationToken = searchParams.get('token') || searchParams.get('verify');
    if (!verificationToken) return;
    let active = true;
    api.verifyEmail(verificationToken)
      .then(() => { if (active) navigate('/dashboard', { replace: true }); })
      .catch((err) => { if (active) { setError(err.message || 'The verification link is invalid or expired.'); setView('login'); } });
    return () => { active = false; };
  }, [navigate, searchParams]);

  const handleStartDemo = async () => {
    setIsBusy(true); setError(''); setNotice('');
    try {
      await api.createDemoSession();
      // Verify the saved session before navigating, including the custom-header fallback used by preview proxies.
      await api.getIdentity();
      navigate('/dashboard');
    } catch (err) {
      setError(err?.message || 'Could not start the demo.');
    } finally { setIsBusy(false); }
  };

  const handleLogin = async (event) => {
    event.preventDefault(); setIsBusy(true); setError(''); setNotice('');
    try {
      await api.login({ email, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err?.message || 'Could not sign in.');
    } finally { setIsBusy(false); }
  };

  const handleRegister = async (event) => {
    event.preventDefault(); setIsBusy(true); setError(''); setNotice('');
    try {
      const result = await api.registerAccount({ email, password, display_name: displayName });
      setNotice(result?.message || 'If that address can be registered, a verification link will be sent.');
      setView('login');
    } catch (err) {
      setError(err?.message || 'Could not create the account.');
    } finally { setIsBusy(false); }
  };

  const handleResend = async () => {
    setIsBusy(true); setError(''); setNotice('');
    try {
      const result = await api.resendVerification(email);
      setNotice(result?.message || 'If that address can be registered, a verification link will be sent.');
    } catch (err) { setError(err?.message || 'Could not request a verification link.'); }
    finally { setIsBusy(false); }
  };

  const verificationToken = searchParams.get('token') || searchParams.get('verify');
  const activeView = verificationToken && !error ? 'verify' : view;
  const title = activeView === 'register' ? 'Create your account' : activeView === 'login' ? 'Welcome back' : activeView === 'verify' ? 'Verifying email' : 'Miroir';

  return (
    <div className="min-h-screen bg-canvas flex flex-col relative overflow-hidden text-text-primary">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-secondary/10 rounded-full blur-[120px] pointer-events-none" />

      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        <div className="w-full max-w-md glass-card p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20">
              <span className="material-symbols-outlined text-white" style={{ fontSize: '56px', fontVariationSettings: "'FILL' 0" }}>neurology</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{title}</h1>
            <p className="text-sm text-brand-primary font-medium tracking-wide">Review your execution.</p>
            {activeView === 'home' && <p className="text-xs text-text-secondary mt-3 leading-relaxed px-4">Miroir checks your evidence against the strategy rules you confirmed. Demo access uses sample data; verified accounts can connect Roqqu for read-only account data.</p>}
            {activeView === 'register' && <p className="text-xs text-text-secondary mt-3">A verified email is required before signing in or linking a live Roqqu identity.</p>}
          </div>

          {error && <div role="alert" className="mb-5 p-3 rounded-lg bg-adherence-broken/10 border border-adherence-broken/30 text-adherence-broken text-xs text-center">{error}</div>}
          {notice && <div role="status" className="mb-5 p-3 rounded-lg bg-brand-primary/10 border border-brand-primary/30 text-text-primary text-xs text-center">{notice}</div>}

          {activeView === 'home' && (
            <div className="space-y-3">
              <button onClick={handleStartDemo} disabled={isBusy} className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/25 disabled:opacity-70">
                {isBusy ? <><span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>Starting…</> : <>Start Demo<span className="material-symbols-outlined text-[18px]">arrow_forward</span></>}
              </button>
              <button onClick={() => { setView('login'); setError(''); setNotice(''); }} className="w-full py-3 rounded-xl bg-surface-elevated border border-border-subtle hover:border-brand-primary text-white font-semibold text-sm transition-all">Sign in</button>
              <button onClick={() => { setView('register'); setError(''); setNotice(''); }} className="w-full py-3 rounded-xl text-text-secondary hover:text-white text-sm transition-all">Create a Miroir account</button>
            </div>
          )}

          {(activeView === 'login' || activeView === 'register') && (
            <form onSubmit={activeView === 'login' ? handleLogin : handleRegister} className="space-y-4">
              {activeView === 'register' && <label className="block text-xs text-text-secondary">Display name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={80} className="mt-2 w-full rounded-lg bg-[#0B0F19]/70 border border-border-subtle px-3 py-3 text-sm text-white outline-none focus:border-brand-primary" placeholder="Your name" /></label>}
              <label className="block text-xs text-text-secondary">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} className="mt-2 w-full rounded-lg bg-[#0B0F19]/70 border border-border-subtle px-3 py-3 text-sm text-white outline-none focus:border-brand-primary" placeholder="you@example.com" /></label>
              <label className="block text-xs text-text-secondary">Password<input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={activeView === 'login' ? 'current-password' : 'new-password'} minLength={activeView === 'register' ? 12 : undefined} maxLength={128} className="mt-2 w-full rounded-lg bg-[#0B0F19]/70 border border-border-subtle px-3 py-3 text-sm text-white outline-none focus:border-brand-primary" placeholder={activeView === 'register' ? 'At least 12 characters' : 'Your password'} /></label>
              <button type="submit" disabled={isBusy} className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold text-sm shadow-lg shadow-brand-primary/25 disabled:opacity-70">{isBusy ? 'Please wait…' : activeView === 'login' ? 'Sign in' : 'Create account'}</button>
              {activeView === 'login' && error && error.toLowerCase().includes('verify') && <button type="button" onClick={handleResend} disabled={isBusy || !email} className="w-full py-2 text-xs text-brand-primary hover:text-white disabled:opacity-50">Resend verification email</button>}
              <button type="button" onClick={() => { setView(view === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }} className="w-full py-2 text-xs text-text-secondary hover:text-white">{view === 'login' ? 'New to Miroir? Create an account' : 'Already registered? Sign in'}</button>
            </form>
          )}

          {activeView === 'verify' && <div className="text-center text-sm text-text-secondary py-4">{isBusy ? 'Confirming your email address…' : 'Finishing verification…'}</div>}
          {activeView !== 'home' && <button onClick={() => { setView('home'); setError(''); setNotice(''); }} className="w-full mt-5 text-xs text-text-tertiary hover:text-white">Back to demo</button>}
          <div className="mt-8 text-center"><p className="text-[10px] text-text-tertiary">Demo sessions are separate from accounts. Roqqu access is read-only and requires a verified Miroir account.</p></div>
        </div>
      </main>
    </div>
  );
}
