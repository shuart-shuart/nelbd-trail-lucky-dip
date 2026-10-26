import React, { useEffect, useState, useRef } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';

interface DuplicateParticipantViewProps {
  onFinish: () => void;
  autoResetSeconds?: number;
}

export const DuplicateParticipantView: React.FC<DuplicateParticipantViewProps> = ({
  onFinish,
  autoResetSeconds = 25,
}) => {
  const [countdown, setCountdown] = useState(autoResetSeconds);
  const onFinishRef = useRef(onFinish);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onFinishRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full flex flex-col items-center justify-between text-center my-auto py-2">
      {/* Booklet Editorial Card (Square with Double Outline) */}
      <div className="w-full bg-nel-pink text-nel-violet rounded-3xl sm:rounded-[32px] p-6 sm:p-8 border-4 border-nel-purple outline outline-2 outline-offset-[-6px] sm:outline-offset-[-8px] outline-nel-purple/40 shadow-2xl flex flex-col items-center">
        
        {/* Signage Icon */}
        <div
          className="w-16 h-16 rounded-2xl bg-nel-purple flex items-center justify-center mb-4 text-nel-pink"
          aria-hidden="true"
        >
          <AlertTriangle className="w-8 h-8 text-nel-pink" />
        </div>

        <span className="font-dm font-bold text-[11px] sm:text-xs uppercase tracking-wider text-nel-purple mb-1">
          Redemption Notice
        </span>

        {/* Primary Message */}
        <h2 className="font-nel font-semibold text-2xl sm:text-3xl text-nel-violet tracking-tight leading-snug mb-2">
          Already redeemed!
        </h2>

        <p className="font-dm text-sm sm:text-base text-nel-violet/90 mb-4 max-w-sm leading-relaxed">
          This mobile number has already drawn a prize for the NELBD Design Trail. Limited to one prize per participant.
        </p>

        {/* Booklet Dashed Divider */}
        <div className="w-full border-b-2 sm:border-b-4 border-dashed border-nel-purple/35 my-3" aria-hidden="true" />

        {/* Primary Action: FINISH */}
        <div className="w-full max-w-sm mt-2">
          <button
            type="button"
            onClick={onFinish}
            className="w-full min-h-[58px] py-4 px-6 rounded-2xl bg-nel-violet hover:bg-[#340557] active:scale-[0.98] text-nel-pink font-nel font-semibold text-xl tracking-wide border-2 border-nel-purple/50 shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-nel-purple"
          >
            <span>FINISH</span>
            <ArrowRight className="w-5 h-5 text-nel-pink stroke-[2.5]" aria-hidden="true" />
          </button>

          {/* Automatic reset timer */}
          <p className="text-xs text-nel-purple font-medium font-dm mt-3" aria-live="polite">
            Resetting in {countdown}s
          </p>
        </div>
      </div>
    </div>
  );
};
