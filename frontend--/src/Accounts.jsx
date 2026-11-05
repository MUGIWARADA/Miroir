import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Accounts() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const linked = localStorage.getItem('account_linked') === 'true';
    setIsConnected(linked);
    if (linked) setShowModal(false);
  }, []);

  const handleConnect = (broker) => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      localStorage.setItem('account_linked', 'true');
      localStorage.setItem('miroir_identity_created', 'true');
      setShowModal(false);
    }, 1200);
  };

  const handleDeleteAccount = () => {
    setIsConnected(false);
    localStorage.removeItem('account_linked');
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24 relative">
      
      <div className="flex flex-row items-center mb-8 gap-4">
        <button onClick={() => navigate('/profile')} className="w-10 h-10 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center hover:text-brand-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-white">Accounts</h1>
          <p className="text-sm text-text-secondary hidden md:block">Manage your connected platforms.</p>
        </div>
      </div>

      {!isConnected ? (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-20 h-20 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-4xl text-text-tertiary">link_off</span>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-white">No Accounts Linked</h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-8">
            Link a trading account to start auditing your execution quality.
          </p>
          <button onClick={() => setShowModal(true)} className="px-8 py-3 rounded-xl bg-brand-primary text-white font-semibold shadow-lg shadow-brand-primary/25 hover:bg-blue-600 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">add_link</span> Connect Account
          </button>
        </div>
      ) : (
        <div className="glass-card p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface-elevated border border-border-subtle flex items-center justify-center">
                <span className="material-symbols-outlined text-brand-primary text-2xl">account_balance</span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">MetaTrader 5</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 rounded-full bg-adherence-followed animate-pulse"></span>
                  <span className="text-xs text-adherence-followed font-medium">Active Connection</span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleDeleteAccount} 
              className="w-9 h-9 rounded-full bg-adherence-broken/10 border border-adherence-broken/20 flex items-center justify-center text-adherence-broken hover:bg-adherence-broken hover:text-white transition-all shrink-0"
              title="Delete Account"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border-subtle">
            <div><p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Account ID</p><p className="text-sm font-mono text-white">#84920412</p></div>
            <div><p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Balance</p><p className="text-sm font-semibold text-white">$25,000.00</p></div>
            <div><p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Leverage</p><p className="text-sm font-semibold text-white">1:100</p></div>
            <div><p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Last Sync</p><p className="text-sm text-white">Just now</p></div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card p-6 shadow-2xl relative">
            <button onClick={() => navigate('/dashboard')} className="absolute top-4 right-4 text-text-tertiary hover:text-white transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
            
            <div className="text-center mb-8 mt-2">
              <h2 className="text-xl font-semibold text-white mb-2">Connect Account</h2>
              <p className="text-sm text-text-secondary">Select your platform to link.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleConnect('mt5')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">account_balance</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">MetaTrader</span>
              </button>
              <button onClick={() => handleConnect('binance')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">currency_bitcoin</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">Binance</span>
              </button>
              <button onClick={() => handleConnect('roqqu')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">bolt</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">Roqqu</span>
              </button>
              <button onClick={() => handleConnect('wallet')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">wallet</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">WalletConnect</span>
              </button>
            </div>
            
            {isConnecting && (
              <div className="absolute inset-0 bg-[#0B0F19]/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
                <span className="material-symbols-outlined animate-spin text-4xl text-brand-primary mb-4">progress_activity</span>
                <p className="text-sm font-medium text-white">Connecting...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}