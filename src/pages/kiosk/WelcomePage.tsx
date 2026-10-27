import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../../context/KioskContext';
import { SiteLocation } from '../../firebase/types';
import abbeySvg from '../../assets/img/ABBEY.svg';
import nelLogo from '../../assets/img/nel-logo.png';

/**
 * Flat signage-style welcome screen. The Abbey asset is the original SVG
 * already committed under src/assets/img/ABBEY.svg (not a generated redraw).
 */
export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();
  const { session, setSite, resetSession } = useKiosk();

  useEffect(() => {
    if (session.nickname || session.mobileNumber || session.ticketNumber || session.drawResult) {
      resetSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleSite = (newSite: SiteLocation) => setSite(newSite);

  return (
    <div className="relative w-full max-w-xl mx-auto flex flex-col gap-4 sm:gap-5 py-4 sm:py-6 my-auto isolate">
      {/* Flat signpost, 15% of module width, behind all three cards. */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[15%] bg-nel-pink -z-10 pointer-events-none" aria-hidden="true" />

      {/* Module 1: logo/date split with the original Abbey illustration fully visible. */}
      <section className="w-full rounded-[26px] sm:rounded-[32px] bg-nel-pink text-nel-violet px-5 py-5 sm:px-7 sm:py-7 overflow-hidden">
        <div className="grid grid-cols-2 gap-3 sm:gap-5 items-start">
          <div className="min-w-0">
            <h1 className="m-0"><img src={nelLogo} alt="New Everyday Life, By Design" className="block w-full h-auto object-contain object-left" /></h1>
          </div>
          <div className="min-w-0 border-l border-nel-violet/60 pl-3 sm:pl-5 text-right">
            <p className="font-nel font-semibold text-[clamp(.8rem,3vw,1.4rem)] leading-tight text-nel-violet whitespace-nowrap">
              14 NOV <span aria-hidden="true">→</span> 6 DEC 2026
            </p>
            <p className="font-dm font-bold text-[10px] sm:text-xs leading-snug mt-2">
              Various Locations Along The North East Line
            </p>
          </div>
        </div>
        <div className="w-full border-t-2 border-dashed border-nel-violet/70 mt-5 mb-3" aria-hidden="true" />
        <img
          src={abbeySvg}
          alt="Abbey illustration showing a child, walking adult and wheelchair user"
          className="block w-full h-auto max-h-[45dvh] object-contain object-center"
        />
      </section>

      {/* Module 2: the entire flat rounded rectangle is the start button. */}
      <button
        type="button"
        onClick={() => navigate('/details')}
        className="w-full rounded-[24px] sm:rounded-[28px] bg-nel-pink text-nel-violet min-h-[94px] sm:min-h-[116px] px-5 sm:px-8 flex items-center justify-center gap-4 sm:gap-6 font-nel font-semibold text-[clamp(1.45rem,5.3vw,2.6rem)] tracking-tight transition-colors hover:bg-[#ffc0de] active:bg-[#f7a7d1] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white cursor-pointer"
        aria-label="Press to start the trail lucky dip"
      >
        <span className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-nel-violet text-nel-pink shrink-0 flex items-center justify-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-9 sm:h-9" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M13 5l7 7-7 7"/></svg>
        </span>
        <span>PRESS TO START</span>
      </button>

      {/* Module 3: slim, quiet two-way location toggle; no selector heading. */}
      <div className="w-full rounded-[22px] sm:rounded-[26px] bg-nel-pink p-2 sm:p-2.5">
        <div role="group" aria-label="Redemption venue" className="grid grid-cols-2 overflow-hidden rounded-[16px] sm:rounded-[18px]">
          {([['PDD', 'Innovation Hub'], ['PS', 'Impact Hub']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={session.site === value}
              onClick={() => handleToggleSite(value)}
              className={`min-w-0 min-h-[48px] sm:min-h-[54px] px-1.5 sm:px-3 flex items-center justify-center gap-1.5 sm:gap-2 font-nel font-semibold text-[clamp(.77rem,2.7vw,1.05rem)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nel-violet cursor-pointer ${
                session.site === value
                  ? 'bg-nel-violet text-nel-pink'
                  : 'bg-transparent text-nel-violet hover:bg-nel-violet/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" aria-hidden="true" fill={session.site === value ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"><path d="M12 22s7-7.2 7-13a7 7 0 1 0-14 0c0 5.8 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5" fill={session.site === value ? '#270342' : 'none'}/></svg>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
