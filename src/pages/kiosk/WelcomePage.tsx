import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../../context/KioskContext';
import { SiteLocation } from '../../firebase/types';
import redeemSvg from '../../assets/img/REDEEM.svg';
import dateImage from '../../assets/img/date.png';

/**
 * Flat signage-style welcome screen. The Redeem artwork is the original SVG asset, recoloured in NELBD violet.
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
    <div className="kiosk-welcome relative w-full max-w-xl mx-auto flex flex-col gap-2 sm:gap-3 py-2 my-auto isolate">

      {/* Primary hierarchy: title first, artwork second, event details supporting. */}
      <section className="kiosk-welcome-hero w-full rounded-[16px] sm:rounded-[20px] bg-nel-pink text-nel-violet px-5 py-4 sm:px-7 sm:py-5 overflow-hidden">
        <h1 className="kiosk-welcome-title font-nel font-semibold text-center text-nel-violet">
          Design Trail Lucky Dip
        </h1>
        <img
          src={redeemSvg}
          alt="NELBD Redeem illustration"
          className="kiosk-welcome-art block w-full h-auto max-h-[min(27dvh,250px)] object-contain object-center"
        />
        <p className="kiosk-trail-intro font-dm text-center text-nel-violet font-bold">
          Win exclusive NELBD merchandise or Grab vouchers!
        </p>
        <div className="kiosk-welcome-header w-full flex items-center justify-center mt-1">
          <img src={dateImage} alt="14 November to 6 December 2026" className="block w-auto max-w-[57.6%] max-h-[clamp(18px,4dvh,35px)] object-contain object-center mx-auto" />
        </div>
      </section>

      {/* Primary action: no double outline, stronger distinction from the hero. */}
      <button
        type="button"
        onClick={() => navigate('/details')}
        className="kiosk-start-button w-full rounded-[16px] sm:rounded-[20px] bg-nel-pink text-nel-violet min-h-[60px] sm:min-h-[76px] px-5 sm:px-8 flex items-center justify-center gap-3 sm:gap-5 font-dm font-bold text-[clamp(1.2rem,4vw,2rem)] tracking-tight  focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white cursor-pointer"
        aria-label="Press to start the trail lucky dip"
      >
        <span className="w-9 h-9 sm:w-12 sm:h-12 rounded-full bg-nel-violet text-nel-pink shrink-0 flex items-center justify-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M13 5l7 7-7 7"/></svg>
        </span>
        <span>Press to Start</span>
      </button>

      {/* Module 3: slim, quiet two-way location toggle; no selector heading. */}
      <div className="kiosk-venue-card w-full rounded-[12px] sm:rounded-[16px] bg-nel-pink p-2 sm:p-2.5">
        <div role="group" aria-label="Redemption venue" className="kiosk-venue-track grid grid-cols-2 rounded-full">
          {([['PDD', 'Innovation Hub'], ['PS', 'Impact Hub']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={session.site === value}
              onClick={() => handleToggleSite(value)}
              className={`kiosk-venue-button min-w-0 min-h-[42px] sm:min-h-[48px] px-1.5 sm:px-3 flex items-center justify-center gap-1.5 sm:gap-2 font-nel font-semibold text-[clamp(.77rem,2.7vw,1.05rem)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nel-violet cursor-pointer ${
                session.site === value
                  ? 'kiosk-venue-selected bg-nel-violet text-nel-pink'
                  : 'kiosk-venue-unselected bg-transparent text-nel-violet hover:bg-nel-violet/10'
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
