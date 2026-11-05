import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const navigate = useNavigate();
  const [hasIdentity, setHasIdentity] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setHasIdentity(localStorage.getItem('miroir_identity_created') === 'true');
    setIsConnected(localStorage.getItem('account_linked') === 'true');
  }, []);

  const handleDeleteProfile = () => {
    localStorage.clear();
    setHasIdentity(false);
    setIsConnected(false);
  };

  const mockUser = { display_name: "Miroir User", id: "c7549069-4957-4436-b281-19837edd6a3e" };
  const shortId = mockUser.id ? `${mockUser.id.slice(0, 8)}...${mockUser.id.slice(-4)}` : '...';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-text-secondary">Your identity and connected tools.</p>
      </div>

      {!hasIdentity ? (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <span className="material-symbols-outlined text-5xl text-text-tertiary mb-4">person_off</span>
          <h2 className="text-xl font-semibold mb-2 text-white">No Identity Created</h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-6">
            Connect an account to generate your unique Miroir Identity.
          </p>
          <button onClick={() => navigate('/accounts')} className="px-6 py-2.5 rounded-lg bg-brand-primary text-white font-semibold shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add_link</span>
            Connect Account
          </button>
        </div>
      ) : (
        <>
          <div className="glass-card p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none"></div>
            
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shrink-0 shadow-lg shadow-brand-primary/30">
              <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1">{mockUser.display_name}</h2>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle text-[10px] font-mono text-text-secondary uppercase tracking-wider">
                  Miroir ID: {shortId}
                </span>
              </div>
            </div>

            <button 
              onClick={handleDeleteProfile} 
              className="absolute top-4 right-4 md:static w-9 h-9 rounded-full bg-adherence-broken/10 border border-adherence-broken/20 flex items-center justify-center text-adherence-broken hover:bg-adherence-broken hover:text-white transition-all shrink-0"
              title="Delete Profile"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => navigate('/plan')} className="glass-card p-6 text-left hover:border-brand-primary transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-brand-primary">psychology</span>
                <h3 className="text-lg font-semibold text-white group-hover:text-brand-primary transition-colors">Plan</h3>
              </div>
              <p className="text-sm text-text-secondary">View your confirmed strategy and rules.</p>
            </button>

            <button onClick={() => navigate('/accounts')} className="glass-card p-6 text-left hover:border-brand-primary transition-all group">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-brand-primary">account_balance_wallet</span>
                <h3 className="text-lg font-semibold text-white group-hover:text-brand-primary transition-colors">Accounts</h3>
              </div>
              <p className="text-sm text-text-secondary">{isConnected ? '1 Account Connected' : 'No accounts connected.'}</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}