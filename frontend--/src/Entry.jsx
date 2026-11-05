import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { Logo } from './App';

export default function Entry() {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const handleStart = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await api.createDemoSession();
      navigate('/dashboard');
    } catch (err) {
      setError("Failed to initialize demo. Check backend status.");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col relative overflow-hidden text-text-primary">
      
      {/* Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-brand-primary/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-brand-secondary/10 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Header - Logo Left, Prototype Badge Right */}
      <header className="w-full p-6 flex justify-between items-center z-10">
        <Logo />
        <div className="flex items-center gap-2 bg-surface-card/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-border-subtle">
          <span className="w-2 h-2 rounded-full bg-brand-tertiary"></span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary">Local Prototype</span>
        </div>
      </header>

      {/* Main Content - Centered Card */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        
        <div className="w-full max-w-md glass-card p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
          
          <div className="flex flex-col items-center text-center mb-8">
            {/* Stacked Logo Icon - Neurology Outline with FIXED Sizing */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20">
              <span 
                className="material-symbols-outlined text-white" 
                style={{ fontSize: '56px', fontVariationSettings: "'FILL' 0" }}
              >
                neurology
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Miroir</h1>
            <p className="text-sm text-brand-primary font-medium tracking-wide">Review your execution.</p>
            <p className="text-xs text-text-secondary mt-3 leading-relaxed px-4">
              Miroir checks your evidence against the strategy rules you confirmed.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg bg-adherence-broken/10 border border-adherence-broken/30 text-adherence-broken text-xs text-center">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <button 
              onClick={handleStart}
              disabled={isConnecting}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/25 disabled:opacity-70 group"
            >
              {isConnecting ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                  Starting Demo...
                </>
              ) : (
                <>
                  
                  Start Demo
                  <span className="material-symbols-outlined text-[18px] opacity-70 group-hover:translate-x-1 transition-transform">arrow_forward</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-[10px] text-text-tertiary">
              Sample data is clearly labelled throughout.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}