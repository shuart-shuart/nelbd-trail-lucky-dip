import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKiosk } from '../../context/KioskContext';
import { executeServerLuckyDipDraw } from '../../api/luckyDipClient';
import { DuplicateParticipantView } from '../../components/kiosk/DuplicateParticipantView';
import drawStepsGif from '../../assets/img/steps.gif';

export const DrawPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, setDrawResult, resetSession } = useKiosk();

  const [isDrawing, setIsDrawing] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const revealTimerRef = useRef<NodeJS.Timeout | null>(null);
  const drawStartedAtRef = useRef<number>(0);

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
    drawStartedAtRef.current = Date.now();
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

      // Allow the branded animation to run for at least two seconds, without
      // delaying the draw request itself or revealing an unconfirmed prize.
      const remaining = Math.max(0, 2000 - (Date.now() - drawStartedAtRef.current));
      revealTimerRef.current = setTimeout(() => {
        navigate('/result');
      }, remaining);
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
    <div className="kiosk-draw w-full min-h-0 flex-1 flex flex-col items-center justify-center text-center my-auto py-4">
      {/* Minimal draw screen: preserve the background stripe from the kiosk layout.
          The entire pink circle is the touch target, with no extra heading or site pill. */}
      <button
        type="button"
        onClick={handleDraw}
        disabled={isDrawing}
        aria-label={isDrawing ? 'Drawing your prize' : 'Tap here to draw'}
        aria-busy={isDrawing}
        className="kiosk-draw-module kiosk-draw-action kiosk-inset-frame relative flex aspect-square w-[min(84vw,480px,58dvh)] max-w-full shrink-0 items-center justify-center rounded-full bg-nel-pink text-nel-violet cursor-pointer select-none transition-transform active:scale-[0.98] disabled:cursor-wait focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        {isDrawing ? (
        <div
          className="w-full flex flex-col items-center justify-center"
          role="status"
          aria-label="Drawing your prize"
        >
          <div className="w-full max-w-[300px] flex flex-col items-center justify-center p-4 rounded-2xl bg-nel-pink/10">
            <img
              src={drawStepsGif}
              alt=""
              aria-hidden="true"
              className="block w-full max-w-[220px] max-h-[28dvh] aspect-square object-contain rounded-xl"
            />
           <span className="font-dm font-normal text-nel-violet text-xs">
              Drawing your prize…
            </span>
          </span>
        ) : (
          <span className="font-dm font-bold text-[clamp(1.5rem,5vw,2.75rem)] leading-tight tracking-tight px-5">
            TAP HERE<br />TO DRAW
          </span>
        )}
      </button>

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
