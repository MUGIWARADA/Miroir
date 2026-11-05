import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [hasIdentity, setHasIdentity] = useState(false);

  useEffect(() => {
    setHasIdentity(localStorage.getItem('miroir_identity_created') === 'true');
    setIsConnected(localStorage.getItem('account_linked') === 'true');
  }, []);

  const mockUser = { display_name: "Demo Trader", id: "c7549069-4957-4436-b281-19837edd6a3e" };
  const shortId = mockUser.id ? `${mockUser.id.slice(0, 8)}...${mockUser.id.slice(-4)}` : '...';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1">Profile</h1>
        <p className="text-sm text-text-secondary">Your Miroir Identity and connected accounts.</p>
      </div>

      {/* Identity Card */}
      <div className="glass-card p-6 mb-6 flex flex-col md:flex-row items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-brand-primary/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shrink-0 shadow-lg shadow-brand-primary/30">
          <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white mb-1">{hasIdentity ? mockUser.display_name : 'Guest User'}</h2>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-subtle text-[10px] font-mono text-text-secondary uppercase tracking-wider">
              Miroir ID: {hasIdentity ? shortId : 'Not Created'}
            </span>
            {hasIdentity && (
              <span className="px-2.5 py-1 rounded-md bg-adherence-followed/10 border border-adherence-followed/20 text-[10px] font-bold text-adherence-followed uppercase tracking-wider">
                Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Cards */}
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
    </div>
  );
}