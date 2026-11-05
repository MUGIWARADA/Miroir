import React, { useState, useEffect } from 'react';

export default function Accounts() {
  const [isConnected, setIsConnected] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    const linked = localStorage.getItem('account_linked') === 'true';
    setIsConnected(linked);
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

  const handleDisconnect = () => {
    setIsConnected(false);
    localStorage.removeItem('account_linked'); 
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto text-text-primary pb-24 relative">
      
      {/* HEADER WITH ADD ACCOUNT BUTTON (Only if connected) */}
      <div className="flex flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-1 text-white">Accounts</h1>
          <p className="text-sm text-text-secondary hidden md:block">Manage your connected trading platforms.</p>
        </div>
        
        {isConnected && (
          <button 
            onClick={() => setShowModal(true)}
            className="px-4 py-2 rounded-lg bg-surface-elevated border border-border-subtle text-sm font-medium hover:text-brand-primary hover:border-brand-primary transition-all flex items-center gap-2 shrink-0 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add Account
          </button>
        )}
      </div>

      {!isConnected ? (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-20 h-20 rounded-full bg-surface-elevated border border-border-subtle flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-4xl text-text-tertiary">link_off</span>
          </div>
          <h2 className="text-xl font-semibold mb-2 text-white">No Accounts Linked</h2>
          <p className="text-sm text-text-secondary max-w-sm mx-auto mb-8">
            Link a trading account to automatically import your trades and start auditing your execution quality.
          </p>
          <button 
            onClick={() => setShowModal(true)}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-semibold shadow-lg shadow-brand-primary/25 hover:opacity-90 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add_link</span>
            Connect Account
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connected Account Card */}
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
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-adherence-broken hover:bg-adherence-broken/10 transition-colors border border-transparent hover:border-adherence-broken/20"
              >
                Disconnect
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-border-subtle">
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Account ID</p>
                <p className="text-sm font-mono text-white">#84920412</p>
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Balance</p>
                <p className="text-sm font-semibold text-white">$25,000.00</p>
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Leverage</p>
                <p className="text-sm font-semibold text-white">1:100</p>
              </div>
              <div>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Last Sync</p>
                <p className="text-sm text-white">Just now</p>
              </div>
            </div>
          </div>

          {/* Recent Trades Table */}
          <div className="glass-card overflow-hidden">
             <div className="p-4 border-b border-border-subtle flex justify-between items-center bg-[#0B0F19]/50">
              <h3 className="text-sm font-semibold text-white">Recent Imported Trades</h3>
              <span className="text-xs text-brand-primary cursor-pointer hover:underline">View All</span>
            </div>
            <div className="overflow-x-auto">
              {/* Table content remains the same... */}
              <table className="w-full text-left text-sm">
                <thead className="bg-[#0B0F19]/80 text-text-tertiary text-[10px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">Side</th>
                    <th className="px-4 py-3 font-medium text-right">Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Entry</th>
                    <th className="px-4 py-3 font-medium text-right">Exit</th>
                    <th className="px-4 py-3 font-medium text-right">P&L</th>
                    <th className="px-4 py-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">BTC/USDT</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-adherence-followed/10 text-adherence-followed">LONG</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">0.5</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">$63,000.00</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">$65,000.00</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-medium">+$1,000.00</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 rounded text-[10px] font-bold bg-surface-elevated text-text-secondary border border-border-subtle">Reviewed</span>
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">ETH/USDT</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-adherence-broken/10 text-adherence-broken">SHORT</span></td>
                    <td className="px-4 py-3 text-right tabular-nums">2.0</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">$3,500.00</td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">$3,450.00</td>
                    <td className="px-4 py-3 text-right tabular-nums text-white font-medium">+$100.00</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-1 rounded text-[10px] font-bold bg-brand-primary/20 text-brand-primary border border-brand-primary/30">Pending</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Broker Selection Modal (Remains the same) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card p-6 shadow-2xl relative">
            <button 
              onClick={() => setShowModal(false)} 
              className="absolute top-4 right-4 text-text-tertiary hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
            
            <div className="text-center mb-8 mt-2">
              <h2 className="text-xl font-semibold text-white mb-2">Connect Account</h2>
              <p className="text-sm text-text-secondary">Select your trading platform to link.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => handleConnect('mt5')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">account_balance</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">MetaTrader 5</span>
              </button>

              <button onClick={() => handleConnect('mt4')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">account_balance</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">MetaTrader 4</span>
              </button>

              <button onClick={() => handleConnect('ctrader')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">candlestick_chart</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">cTrader</span>
              </button>

              <button onClick={() => handleConnect('bybit')} disabled={isConnecting} className="p-4 rounded-xl bg-[#0B0F19]/50 border border-border-subtle hover:border-brand-primary hover:bg-surface-elevated transition-all flex flex-col items-center gap-3 group">
                <div className="w-14 h-14 rounded-full bg-surface-elevated flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-text-tertiary">currency_bitcoin</span>
                </div>
                <span className="text-xs font-medium text-text-secondary group-hover:text-white">ByBit Futures</span>
              </button>
            </div>
            
            {isConnecting && (
              <div className="absolute inset-0 bg-[#0B0F19]/80 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-10">
                <span className="material-symbols-outlined animate-spin text-4xl text-brand-primary mb-4">progress_activity</span>
                <p className="text-sm font-medium text-white">Authenticating with broker...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}