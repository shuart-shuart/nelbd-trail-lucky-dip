import React from 'react';
import { Link } from 'react-router-dom';
import { PauseCircle } from 'lucide-react';
import { useKiosk } from '../../context/KioskContext';

interface KioskLayoutProps {
  children: React.ReactNode;
}

export const KioskLayout: React.FC<KioskLayoutProps> = ({ children }) => {
  const { session, settings, isSettingsLoading } = useKiosk();

  // If kiosk is explicitly paused by admin
  const isPaused = !isSettingsLoading && settings && settings.kioskActive === false;

  return (
    <div className="nel-kiosk-root min-h-[100dvh] w-full flex flex-col justify-between relative overflow-x-hidden selection:bg-nel-pink selection:text-nel-violet">
      {/* Main Centered Responsive Container */}
      <main className="w-full max-w-md sm:max-w-lg lg:max-w-xl mx-auto flex-1 flex flex-col justify-center px-4 py-4 sm:py-6 sm:px-6 z-10 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.75rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        {isPaused ? (
          <div className="w-full flex flex-col items-center text-center my-auto py-6 bg-nel-pink text-nel-violet rounded-3xl p-6 sm:p-8 border-4 border-nel-purple/30">
            <div
              className="w-16 h-16 rounded-2xl bg-nel-purple flex items-center justify-center text-nel-pink mb-4"
              aria-hidden="true"
            >
              <PauseCircle className="w-9 h-9 text-nel-pink" />
            </div>
            <div className="text-xs font-bold tracking-[0.2em] uppercase text-nel-purple mb-1 font-dm">
              New Everyday Life, By Design
            </div>
            <h1 className="font-nel font-semibold text-2xl sm:text-3xl text-nel-violet tracking-tight leading-[1.1] mb-2">
              Trail Lucky Dip is Paused
            </h1>
            <p className="font-dm text-sm sm:text-base text-nel-violet/80 max-w-sm leading-relaxed">
              The lucky dip booth is temporarily paused. Please check with our booth crew.
            </p>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Discreet site indicator in the bottom corner for staff reference (NO public navigation) */}
      <aside
        className="fixed bottom-2 right-3 z-20 pointer-events-auto"
        aria-label="Staff site reference"
      >
        <Link
          to="/admin"
          className="text-[10px] font-mono font-medium text-nel-pink/50 hover:text-nel-pink transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-nel-pink rounded px-1"
          tabIndex={0}
          title="Staff Portal"
        >
          {session.site || 'PDD'}
        </Link>
      </aside>
    </div>
  );
};
