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
          className="kiosk-welcome-art block w-full h-auto max-h-[min(24dvh,225px)] object-contain object-center"
        />
        <div className="kiosk-welcome-header w-full flex items-center justify-center mt-1">
          <img src={dateImage} alt="14 November to 6 December 2026" className="block w-auto max-w-[37.6%] max-h-[clamp(18px,4dvh,35px)] object-contain object-center mx-auto" />
        </div>
      </section>

      {/* Primary action */}
      <button
        type="button"
        onClick={() => navigate('/details')}
        className="kiosk-start-button w-full rounded-[16px] sm:rounded-[20px] bg-nel-pink text-nel-violet min-h-[52px] sm:min-h-[62px] px-3 sm:px-6 py-2 flex items-center justify-center font-dm font-bold text-[clamp(0.9rem,2.5vw,1.6rem)] leading-tight tracking-tight text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white cursor-pointer"
        aria-label="Tap here to win your exclusive NELBD merchandise and vouchers"
      >
        <span className="max-w-full whitespace-normal break-words">
          Tap here to win your exclusive NELBD merchandise and vouchers!
        </span>
      </button>
      
      {/* Module 3: slim, quiet two-way location toggle; no selector heading. */}
      <div className="kiosk-venue-card w-full rounded-full bg-nel-pink p-1 sm:p-1.5">
        <div role="group" aria-label="Redemption venue" className="kiosk-venue-track grid grid-cols-2 rounded-full">
          {([['PDD', 'Innovation Hub'], ['PS', 'Impact Hub']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={session.site === value}
              onClick={() => handleToggleSite(value)}
              className={`kiosk-venue-button min-w-0 min-h-[32px] sm:min-h-[38px] px-1.5 sm:px-3 flex items-center justify-center gap-1.5 sm:gap-2 font-nel font-semibold text-[clamp(.72rem,2.2vw,.9rem)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nel-violet cursor-pointer ${
                session.site === value
                  ? 'kiosk-venue-selected bg-nel-violet text-nel-pink'
                  : 'kiosk-venue-unselected bg-transparent text-nel-violet border border-nel-violet/60 '
              }`}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
