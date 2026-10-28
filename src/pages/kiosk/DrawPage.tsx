import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../../context/KioskContext';
import { executeServerLuckyDipDraw } from '../../api/luckyDipClient';
import { DuplicateParticipantView } from '../../components/kiosk/DuplicateParticipantView';
import { DrawPictogram } from '../../components/kiosk/DrawPictogram';

export const DrawPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, setDrawResult, resetSession } = useKiosk();

  const [isDrawing, setIsDrawing] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
      }
    };
  }, []);

  const nickname = session.nickname?.trim() || 'Explorer';
  const site = session.site || 'PDD';
  const ticketNumber = session.ticketNumber;

  const handleFinishDuplicate = () => {
    resetSession();
    navigate('/');
  };

  const handleDraw = async () => {
    // Prevent multiple concurrent taps
    if (isDrawing) return;
    setIsDrawing(true);
    setErrorMessage(null);

    try {
      // Execute secure server-side draw
      const response = await executeServerLuckyDipDraw({
        ticketNumber,
        nickname,
        mobileNumber: session.mobileNumber,
        site,
        kioskId: session.kioskId,
      });

      if (!response.success) {
        const errorText = response.error || '';
        // If error indicates duplicate mobile/redemption, show friendly standalone state
        if (
          errorText.toLowerCase().includes('already drawn') ||
          errorText.toLowerCase().includes('already redeemed') ||
          errorText.toLowerCase().includes('duplicate')
        ) {
          setIsDuplicate(true);
          setIsDrawing(false);
          return;
        }

        const fallback = "We're having trouble connecting. Please ask our booth crew for assistance.";
        const cleanError =
          !errorText ||
          errorText.includes('<') ||
          errorText.toLowerCase().includes('token') ||
          errorText.toLowerCase().includes('doctype') ||
          errorText.toLowerCase().includes('json')
            ? fallback
            : errorText;

        setErrorMessage(cleanError);
        setIsDrawing(false);
        return;
      }

      setDrawResult(response);

      // Short pause for tactile reveal
      revealTimerRef.current = setTimeout(() => {
        navigate('/result');
      }, 700);
    } catch (err: any) {
      console.error('Server draw error:', err);
      setErrorMessage("We're having trouble connecting. Please ask our booth crew for assistance.");
      setIsDrawing(false);
    }
  };

  // If duplicate participant was detected, show friendly standalone state
  if (isDuplicate) {
    return <DuplicateParticipantView onFinish={handleFinishDuplicate} />;
  }

  return (
    <div className="kiosk-draw w-full flex flex-col items-center justify-between text-center my-auto py-2 sm:py-3">
      
      {/* 
        HEADER SECTION
        Reduced excessive top whitespace, keeping heading and circle visually connected.
      */}
    < /* header className="kiosk-draw-header mb-3 sm:mb-5">
        <div className="inline-flex items-center gap-2 mb-1">
          <span className="font-dm font-bold text-[10px] sm:text-xs uppercase tracking-wider text-nel-pink/80">
            Step 2 of 2
          </span>
          <span className="text-nel-pink/40 font-bold">•</span>
          <span className="font-dm font-bold text-[10px] sm:text-xs uppercase tracking-wider text-nel-pink">
            Trail Lucky Dip
          </span>
        </div>

        {/* Large Personalised Heading */}
        <h1 className="font-nel font-semibold text-3xl sm:text-4xl md:text-5xl text-white tracking-tight leading-[1.1]">
          Ready, {nickname}?
        </h1>

        {/* Short Supporting Instruction */}
    < /* p className="font-dm font-semibold text-xl sm:text-2xl text-nel-pink mt-1 sm:mt-1.5 leading-[1.1]">
          Eight stamps. One lucky dip.
        </p>
      </header */ >

      {/* 
        CENTRAL INTERACTION:
        CIRCULAR "TAP TO DRAW" SIGNAGE BUTTON
        - Solid NEL Pink fill (#FF8DC6)
        - Bold NEL Purple outer border (#7716B5)
        - Thin inner purple outline (#7716B5) with consistent spacing
        - Flat colours with no gradients, glow, or shadows
        - True circular shape (aspect-square, rounded-full) at all screen sizes
        - Reserved area for official PNG pictogram above the text
        - Centred NEL Rounded SemiBold typography
      */}
      <div className="my-auto py-2 sm:py-4 flex flex-col items-center justify-center w-full">
        <button
          type="button"
          onClick={handleDraw}
          disabled={isDrawing}
          aria-label={isDrawing ? 'Drawing your prize...' : 'Tap to draw your prize'}
          className={`kiosk-draw-action relative w-[min(16rem,72vw,36dvh)] sm:w-[min(18rem,48dvh)] md:w-[min(20rem,50dvh)] aspect-square rounded-full flex flex-col items-center justify-center select-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-nel-pink transition-transform duration-200 ${
            isDrawing ? 'scale-95 cursor-wait' : 'hover:scale-[1.02] active:scale-95'
          }`}
        >
          {/* Double-Outline Signage Circle SVG Background */}
          <svg
            viewBox="0 0 280 280"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {/* Outer Bold Purple Border */}
            <circle
              cx="140"
              cy="140"
              r="132"
              fill="#FF8DC6"
              stroke="#270342"
              strokeWidth="3"
            />

            {/* Inset Thin Inner Purple Outline */}
            <circle
              cx="140"
              cy="140"
              r="120"
              fill="none"
              stroke="#270342"
              strokeWidth="1.5"
            />
          </svg>

          {/* Central Signage Content */}
          <div className="relative z-10 flex flex-col items-center justify-center p-3 text-center">
            {!isDrawing ? (
              <>
                {/* 
                  Reserved Graphic Area:
                  Replaceable graphic component that supports transparent PNG.
                  Left clean until official asset is provided. Dimensions are stable.
                */}
                <DrawPictogram />

                {/* Centred Bold "TAP TO DRAW" Typography */}
                <span className="font-dm font-bold text-2xl sm:text-3xl text-nel-violet leading-none tracking-tight">
                  TAP HERE
                </span>
                <span className="font-dm font-bold text-3xl sm:text-5xl text-nel-violet leading-none tracking-tight mt-1 sm:mt-1.5">
                  TO DRAW
                </span>
              </>
            ) : (
              /* Loading State */
              <div className="flex flex-col items-center justify-center">
                <div
                  className="w-12 h-12 rounded-full border-4 border-nel-violet border-t-transparent animate-spin mb-2"
                  aria-hidden="true"
                />
                <span className="font-dm font-bold text-lg sm:text-xl text-nel-violet tracking-wide">
                  DRAWING...
                </span>
              </div>
            )}
          </div>
        </button>
      </div>

      {/* Error Retry Message in Signage Double-Outline Box */}
      {errorMessage && !isDrawing && (
        <div className="w-full max-w-sm mt-3 p-3.5 rounded-2xl bg-nel-pink text-nel-violet border-2 border-nel-purple outline outline-1 outline-offset-[-3px] outline-nel-purple/40 font-dm text-xs sm:text-sm font-bold">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={handleDraw}
            className="mt-2 px-4 py-1.5 rounded-xl bg-nel-violet text-nel-pink font-bold text-xs font-dm uppercase tracking-wider cursor-pointer border border-nel-purple"
          >
            Try Again
          </button>
        </div>
      )}

      {/* 
        DISCREET SITE INDICATOR FOOTER
        Clean, non-interactive site indicator near bottom edge.
        Removed repeated event title and horizontal divider as requested.
      */}
      <footer className="kiosk-draw-footer w-full mt-3 flex items-center justify-center" aria-hidden="true">
        <span className="font-dm text-[11px] font-bold text-nel-pink tracking-wider uppercase">
          {site}
        </span>
      </footer>
    </div>
  );
};
