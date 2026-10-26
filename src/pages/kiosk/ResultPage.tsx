import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useKiosk } from '../../context/KioskContext';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export const ResultPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, resetSession } = useKiosk();
  const [countdown, setCountdown] = useState(45);
  const resetSessionRef = useRef(resetSession);

  useEffect(() => {
    resetSessionRef.current = resetSession;
  }, [resetSession]);

  const drawResult = session.drawResult;
  const prizeName = drawResult?.prize?.name || 'Exclusive Trail Reward';
  const ticketNumber = drawResult?.ticketNumber || session.ticketNumber;

  const [prizeImageUrl, setPrizeImageUrl] = useState<string | undefined>(
    drawResult?.prize?.imageUrl
  );

  useEffect(() => {
    if (drawResult?.prize?.imageUrl) {
      setPrizeImageUrl(drawResult.prize.imageUrl);
      return;
    }
    // If not in drawResult, attempt to find matching prize in Firestore by ID or name
    if (drawResult?.prize?.id) {
      getDoc(doc(db, 'prizes', drawResult.prize.id))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.imageUrl) {
              setPrizeImageUrl(data.imageUrl);
            }
          }
        })
        .catch(() => {});
    } else if (drawResult?.prize?.name) {
      const q = query(collection(db, 'prizes'), where('name', '==', drawResult.prize.name));
      getDocs(q)
        .then((snap) => {
          if (!snap.empty) {
            const data = snap.docs[0].data();
            if (data?.imageUrl) {
              setPrizeImageUrl(data.imageUrl);
            }
          }
        })
        .catch(() => {});
    }
  }, [drawResult]);

  useEffect(() => {
    // Retain automatic kiosk reset countdown
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          resetSessionRef.current();
          navigate('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const handleFinish = () => {
    resetSession();
    navigate('/');
  };

  const configuredSiteName =
    session.site === 'PS' ? 'Impact Hub' : 'Innovation Hub';

  return (
    <div className="w-full flex flex-col items-center justify-between text-center my-auto py-2">
      {/* 
        BOOKLET CAMPAIGN RESULT PANEL (SHAPE SYSTEM: SQUARE WITH DOUBLE OUTLINE)
        Follows the official signage reference:
        - Bold outer border with inset concentric double outline
        - Dashed dividers
        - High-contrast prize name in oversized NEL Rounded SemiBold
        - Integrated pink/purple signage framing (no stark white blocks)
      */}
      <div className="w-full bg-nel-pink text-nel-violet rounded-3xl sm:rounded-[32px] p-5 sm:p-7 md:p-8 border-4 border-nel-purple outline outline-2 outline-offset-[-6px] sm:outline-offset-[-8px] outline-nel-purple/40 shadow-2xl flex flex-col items-center justify-between">
        
        {/* Top Tag & Campaign Header */}
        <div className="w-full flex items-center justify-between pb-2">
          <span className="font-dm font-bold text-[10px] sm:text-xs text-nel-purple uppercase tracking-wider">
            New Everyday Life, By Design
          </span>

        </div>

        {/* Celebration Headline */}
        <div className="py-1">
          <h1 className="font-nel font-semibold text-3xl sm:text-4xl md:text-5xl text-nel-violet tracking-tight uppercase leading-[1.05]">
            YOU'VE WON!
          </h1>
        </div>

        {/* Booklet Dashed Divider Line */}
        <div className="w-full border-b-2 sm:border-b-4 border-dashed border-nel-purple/35 my-3" aria-hidden="true" />

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-nel-purple text-nel-pink font-dm font-bold text-xs uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-nel-pink" aria-hidden="true" />
            <span>Trail Reward Confirmed</span>
          </div>

        {/* PRIZE DISPLAY SECTION */}
        <section className="my-2 py-2 w-full flex flex-col items-center justify-center">
          {/* 
            Prize PNG Image:
            Integrated pink container with double-outline signage framing.
            Preserves original photographic proportions and transparency.
          */}
          {prizeImageUrl && (
            <div className="mb-3 sm:mb-4">
              <div className="w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52 rounded-2xl bg-nel-pink border-2 border-nel-purple outline outline-1 outline-offset-[-3px] outline-nel-purple/40 p-2.5 sm:p-3 flex items-center justify-center">
                <img
                  src={prizeImageUrl}
                  alt={prizeName}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Actual Prize Name in Oversized NEL Rounded Typography */}
          <div className="font-nel font-semibold text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-nel-violet leading-[1.08] tracking-tight px-2 break-words max-w-md">
            {prizeName}
          </div>
        </section>

        {/* Booklet Dashed Divider Line */}
        <div className="w-full border-b-2 sm:border-b-4 border-dashed border-nel-purple/35 my-3" aria-hidden="true" />

        {/* 
          Signage Information Panel: Redemption Instruction
          Uses square with double-outline styling and violet tint.
        */}
        <div className="w-full max-w-sm p-3.5 rounded-2xl bg-nel-purple/15 border-2 border-nel-purple outline outline-1 outline-offset-[-3px] outline-nel-purple/40 text-center mb-4">
          <p className="font-nel font-semibold text-base sm:text-lg text-nel-violet leading-tight">
            Show this screen to our booth crew.
          </p>
          {ticketNumber && (
            <p className="font-mono text-xs font-bold text-nel-purple mt-1 tracking-wide">
              Ticket: {ticketNumber}
            </p>
          )}
        </div>

        {/* ONE Primary Action: FINISH (Signage bar) */}
        <div className="w-full max-w-sm">
          <button
            type="button"
            onClick={handleFinish}
            className="w-full min-h-[58px] py-4 px-6 rounded-2xl bg-nel-violet hover:bg-[#340557] active:scale-[0.98] text-nel-pink font-nel font-semibold text-xl sm:text-2xl tracking-wide border-2 border-nel-purple shadow-xl flex items-center justify-center gap-3 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-nel-purple"
          >
            <span>FINISH</span>
            <ArrowRight className="w-6 h-6 text-nel-pink stroke-[2.5]" aria-hidden="true" />
          </button>

          {/* Automatic Reset Countdown */}
          <p className="text-xs text-nel-purple font-medium font-dm mt-3" aria-live="polite">
            Resetting in {countdown}s
          </p>
        </div>
      </div>
    </div>
  );
};
