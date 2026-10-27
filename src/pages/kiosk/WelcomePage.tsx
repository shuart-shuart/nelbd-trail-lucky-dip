import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../../context/KioskContext';
import { SiteLocation } from '../../firebase/types';
import { WelcomeIllustration } from '../../components/kiosk/WelcomeIllustration';
import abbeySvg from '../../assets/img/ABBEY.svg';

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const { session, setSite, resetSession } = useKiosk();

  // Reset any previous participant session on mounting the welcome screen
  useEffect(() => {
    if (session.nickname || session.mobileNumber || session.ticketNumber || session.drawResult) {
      resetSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = () => {
    navigate('/details');
  };

  const handleToggleSite = (newSite: SiteLocation) => {
    setSite(newSite);
  };

  return (
    <div className="w-full flex flex-col items-center justify-center my-auto py-2 sm:py-4 selection:bg-nel-pink selection:text-nel-violet">
      
      {/* 
        ========================================================================
        1. TOP — RECTANGULAR WELCOME CARD
        ========================================================================
        Wide, landscape-oriented NEL Pink card with rounded corners and consistent
        double-outline border (bold outer purple border + thin inner purple outline).
        Contains event info, replaceable people illustration, dashed divider,
        and welcome headline.
      */}
      <div className="w-full bg-nel-pink rounded-[32px] sm:rounded-[38px] border-4 border-nel-purple p-1.5 sm:p-2 shadow-2xl">
        <div className="w-full rounded-[24px] sm:rounded-[30px] border-2 border-nel-purple/60 p-5 sm:p-7 flex flex-col relative text-nel-violet">
          
          {/* Top-left: Event Title | Top-right: Date Information */}
          <header className="flex items-start justify-between gap-2 pb-2">
            <div className="text-left">
              <h2 className="font-nel font-semibold text-lg sm:text-2xl text-nel-purple leading-tight tracking-tight">
                New Everyday Life,
              </h2>
              <h2 className="font-nel font-semibold text-lg sm:text-2xl text-nel-purple leading-tight tracking-tight">
                By Design
              </h2>
            </div>

            <div className="text-right flex flex-col items-end">
              <span className="font-dm font-bold text-[11px] sm:text-xs text-nel-violet tracking-wide uppercase">
                14 NOV ➔ 6 DEC 2026
              </span>
            </div>
          </header>

          {/* Centre: Replaceable Inclusive-Design Illustration Component */}
          <div className="py-2.5 sm:py-4 flex items-center justify-center">
            <WelcomeIllustration
              src={abbeySvg}
              alt="Design Trail Walkers Illustration"
              className="w-full max-w-[360px] sm:max-w-[420px] md:max-w-[450px] h-[135px] sm:h-[160px] md:h-[175px]"
            />
          </div>

          {/* Dashed Horizontal Divider */}
          <div
            className="w-full border-b-2 sm:border-b-3 border-dashed border-nel-purple/50 my-2.5 sm:my-3.5"
            aria-hidden="true"
          />

          {/* Main Headline */}
          <div className="py-1 text-left">
            <h1 className="font-nel font-semibold text-2xl sm:text-3xl md:text-4xl text-nel-violet leading-[1.08] tracking-tight">
              Completed the trail?
            </h1>
            <p className="font-nel font-semibold text-2xl sm:text-3xl md:text-4xl text-nel-purple leading-[1.08] tracking-tight mt-0.5 sm:mt-1">
              Your prize awaits.
            </p>
          </div>

          {/* Supporting Label */}
          <div className="pt-2 text-left">
            <p className="font-dm font-bold text-[10px] sm:text-xs text-nel-purple uppercase tracking-wider">
              DESIGN TRAIL LUCKY DIP
            </p>
          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        2. MIDDLE — CIRCLE SIGNAGE BUTTON
        ========================================================================
        Positioned to the right of the screen below the top card.
        Interactive double-outline circular button ("PRESS HERE TO START").
      */}
      <div className="w-full my-3 sm:my-4 flex justify-end items-center pr-1 sm:pr-2">
        {/* CIRCULAR START BUTTON */}
        <button
          type="button"
          onClick={handleStart}
          aria-label="Press here to start lucky dip"
          className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 shrink-0 flex items-center justify-center transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-nel-pink rounded-full cursor-pointer ml-auto"
        >
          <svg
            viewBox="0 0 160 160"
            className="w-full h-full filter drop-shadow-md" aria-hidden="true" focusable="false"
          >
            {/* Outer Bold Purple Ring (4px stroke matching square above & left circle) */}
            <circle
              cx="80"
              cy="80"
              r="76"
              fill="#FF8DC6"
              stroke="#7716B5"
              strokeWidth="4"
            />

            {/* Inner Thin Purple Outline (2px stroke with even 6px gap) */}
            <circle
              cx="80"
              cy="80"
              r="68"
              fill="none"
              stroke="#7716B5"
              strokeWidth="1.8"
            />

            {/* Right-pointing Arrow (➔) communicating progression */}
            <path
              d="M69 44 H83 V37 L94 49 L83 61 V54 H69 Z"
              fill="#270342"
            />

            {/* "PRESS HERE" (NEL Rounded SemiBold) */}
            <text
              x="80"
              y="82"
              textAnchor="middle"
              fill="#270342"
              fontFamily="NEL Rounded, sans-serif"
              fontWeight="600"
              fontSize="14"
              letterSpacing="1"
            >
              PRESS HERE
            </text>

            {/* "TO START" (NEL Rounded SemiBold, larger) */}
            <text
              x="80"
              y="108"
              textAnchor="middle"
              fill="#270342"
              fontFamily="NEL Rounded, sans-serif"
              fontWeight="600"
              fontSize="20"
              letterSpacing="1.5"
            >
              TO START
            </text>
          </svg>
        </button>
      </div>

      {/* 
        ========================================================================
        3. BOTTOM — VENUE SELECTOR SIGNAGE STRIP
        ========================================================================
        Unified horizontal two-option signage strip aligned with the welcome card.
        Clean NEL Purple outer border, subtle vertical divider, equal options.
        Stationary layout with zero hover jumps (only background-color/color transitions).
      */}
      <footer className="w-full mt-2 sm:mt-3">
        <div
          role="group"
          aria-label="Select Redemption Venue"
          className="w-full rounded-2xl sm:rounded-3xl bg-[#270342] border-3 sm:border-4 border-nel-purple overflow-hidden flex items-stretch"
        >
          {/* Option 1: Innovation Hub */}
          <button
            type="button"
            aria-pressed={session.site === 'PDD'}
            onClick={() => handleToggleSite('PDD')}
            className={`flex-1 py-3 px-3 sm:px-4 cursor-pointer flex flex-col items-center justify-center text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nel-pink ${
              session.site === 'PDD'
                ? 'bg-nel-pink text-nel-violet'
                : 'bg-[#270342] text-nel-pink hover:bg-nel-purple/25'
            }`}
          >
            <span className="font-nel font-semibold text-xs sm:text-sm md:text-base leading-tight">
              Innovation Hub
            </span>
            <span
              className={`text-[10px] sm:text-xs font-dm mt-1 leading-tight ${
                session.site === 'PDD' ? 'text-nel-violet/90 font-medium' : 'text-nel-pink/80'
              }`}
            >
              Nexus at Punggol Coast Mall
            </span>
          </button>

          {/* Subtle vertical divider between the two options */}
          <div
            className="w-[2px] self-stretch bg-nel-purple flex-shrink-0"
            aria-hidden="true"
          />

          {/* Option 2: Impact Hub */}
          <button
            type="button"
            aria-pressed={session.site === 'PS'}
            onClick={() => handleToggleSite('PS')}
            className={`flex-1 py-3 px-3 sm:px-4 cursor-pointer flex flex-col items-center justify-center text-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nel-pink ${
              session.site === 'PS'
                ? 'bg-nel-pink text-nel-violet'
                : 'bg-[#270342] text-nel-pink hover:bg-nel-purple/25'
            }`}
          >
            <span className="font-nel font-semibold text-xs sm:text-sm md:text-base leading-tight">
              Impact Hub
            </span>
            <span
              className={`text-[10px] sm:text-xs font-dm mt-1 leading-tight ${
                session.site === 'PS' ? 'text-nel-violet/90 font-medium' : 'text-nel-pink/80'
              }`}
            >
              Plaza Singapura
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
};
