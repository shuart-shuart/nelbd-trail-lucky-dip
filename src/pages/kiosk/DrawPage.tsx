import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../../context/KioskContext';
import { executeServerLuckyDipDraw } from '../../api/luckyDipClient';
import { DuplicateParticipantView } from '../../components/kiosk/DuplicateParticipantView';

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
    <div className="kiosk-draw w-full min-h-[min(75dvh,780px)] flex flex-col items-center justify-center text-center my-auto py-4">
      {/* Pink signage module surrounds a separate, accessible dark-violet draw button. */}
      <div className="relative flex items-center justify-center w-full py-4">
        <div className="kiosk-draw-module relative flex aspect-square w-[min(92vw,560px,65dvh)] max-w-full items-center justify-center rounded-full bg-nel-pink border-[3px] border-nel-violet shadow-[inset_0_0_0_12px_#FF8DC6,inset_0_0_0_14px_#270342]">
          <button
            type="button"
            onClick={handleDraw}
            disabled={isDrawing}
            aria-label={isDrawing ? 'Drawing your prize' : 'Tap here to draw'}
            aria-busy={isDrawing}
            className={`kiosk-draw-action relative z-10 flex aspect-square w-[54%] items-center justify-center rounded-full bg-nel-violet border-2 border-nel-violet text-nel-pink shadow-[0_8px_16px_rgba(39,3,66,0.22)] select-none focus-visible:outline focus-visible:outline-[4px] focus-visible:outline-offset-[6px] focus-visible:outline-nel-violet transition-[transform,box-shadow] duration-200 motion-reduce:transition-none ${isDrawing ? 'scale-95 cursor-wait shadow-inner' : 'cursor-pointer hover:scale-[1.035] active:scale-95 active:shadow-inner'}`}
          >
            {isDrawing ? (
              <span className="flex items-center justify-center" role="status" aria-label="Drawing your prize">
                <span className="w-10 h-10 sm:w-14 sm:h-14 rounded-full border-4 border-nel-pink/40 border-t-nel-pink animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="sr-only">Drawing your prize, please wait</span>
              </span>
            ) : (
              <span style={{ fontFamily: '"NEL Rounded", sans-serif' }} className="font-semibold text-[clamp(0.85rem,3.5vw,1.5rem)] leading-tight tracking-tight px-2 text-center">
                TAP HERE<br />TO DRAW
              </span>
            )}
          </button>
        </div>
      </div>

      {errorMessage && !isDrawing && (
        <div role="alert" className="w-full max-w-sm mt-3 p-4 rounded-2xl bg-nel-pink text-nel-violet border-2 border-nel-violet font-dm text-sm font-bold">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={handleDraw}
            className="mt-3 px-5 py-2 rounded-xl bg-nel-violet text-nel-pink font-bold text-sm min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nel-violet"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
};
