import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import Strategy from './Strategy';
import Accounts from './Accounts';
import ReviewsList from './ReviewList';
import TradeReview from './TradeReview';
import Profile from './Profile';
import Entry from './Entry';

export function Logo({ size = "md" }) {
  const iconSize = size === "lg" ? "text-4xl" : "text-[20px]";
  const boxSize = size === "lg" ? "w-16 h-16" : "w-8 h-8";
  const textSize = size === "lg" ? "text-3xl" : "text-xl";
  
  return (
    <div className="flex items-center gap-3">
      <div className={`${boxSize} rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg shadow-brand-primary/20`}>
        <span className={`material-symbols-outlined text-white ${iconSize}`}>
          neurology
        </span>
      </div>
      <span className={`font-bold tracking-tight text-white ${textSize}`}>Miroir</span>
    </div>
  );
}

function AppShell({ children }) {
  const location = useLocation();
  
  const navItems = [
    { path: '/reviews', label: 'Reviews', icon: 'history_edu' },
    { path: '/dashboard', label: 'Dashboard', icon: 'query_stats' },
    { path: '/profile', label: 'Profile', icon: 'person' },
  ];

  return (
    <div className="flex h-screen bg-canvas text-text-primary font-sans relative">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-surface-card border-r border-border-subtle p-4 shrink-0 backdrop-blur-xl z-40">
        <div className="mb-8 px-2 mt-2"><Logo /></div>
        <nav className="flex flex-col gap-2">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${location.pathname.startsWith(item.path) ? 'bg-gradient-to-r from-brand-primary/20 to-brand-secondary/20 text-white border border-brand-primary/30' : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary border border-transparent'}`}>
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto pb-24 md:pb-0">{children}</main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full bg-[#0B0F19] border-t border-border-subtle flex justify-around items-end pb-safe pt-2 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link key={item.path} to={item.path} className="relative flex flex-col items-center justify-end h-14 w-16 pb-1">
              {isActive && (
                <div className="absolute -top-5 w-14 h-14 rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg shadow-brand-primary/40 border border-white/10 z-10">
                  <span className="material-symbols-outlined text-white text-[28px]">{item.icon}</span>
                </div>
              )}
              {!isActive && (
                <div className="w-8 h-8 flex items-center justify-center text-text-tertiary mb-1">
                  <span className="material-symbols-outlined text-[24px]">{item.icon}</span>
                </div>
              )}
              <span className={`text-[10px] ${isActive ? 'text-brand-primary font-medium mt-4' : 'text-text-tertiary'}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Entry />} />
        <Route path="*" element={
          <AppShell>
            <Routes>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/plan" element={<Strategy />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/reviews" element={<ReviewsList />} />
              <Route path="/reviews/:id" element={<TradeReview />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </AppShell>
        } />
      </Routes>
    </BrowserRouter>
  );
}