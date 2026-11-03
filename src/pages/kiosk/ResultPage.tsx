import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CheckCircle2 } from 'lucide-react';
import { useKiosk } from '../../context/KioskContext';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

export const ResultPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, resetSession } = useKiosk();
  const [countdown, setCountdown] = useState(180);
  const [grabEmail,setGrabEmail]=useState('');
  const [grabMessage,setGrabMessage]=useState('');
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
    <div className="kiosk-result w-full flex flex-col items-center justify-between text-center my-auto py-1">
      {/* 
        BOOKLET CAMPAIGN RESULT PANEL (SHAPE SYSTEM: SQUARE WITH DOUBLE OUTLINE)
        Follows the official signage reference:
        - Bold outer border with inset concentric double outline
        - Dashed dividers
        - High-contrast prize name in oversized NEL Rounded SemiBold
        - Integrated pink/purple signage framing (no stark white blocks)
      */}
      <div className="kiosk-result-card kiosk-primary-panel kiosk-inset-frame relative w-full bg-nel-pink text-nel-violet rounded-3xl sm:rounded-[32px] p-4 sm:p-5 md:p-6 shadow-none flex flex-col items-center justify-between">
        
        {/* Close control: ends this result session and returns to Welcome. */}
        <button
          type="button"
          onClick={handleFinish}
          aria-label="Close prize result and return to welcome"
          title="Close"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-11 h-11 rounded-full bg-nel-violet text-nel-pink border-2 border-nel-purple flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-nel-purple/50"
        >
          <X className="w-6 h-6" aria-hidden="true" />
        </button>

        {/* Top Tag & Campaign Header */}
        <div className="w-full flex items-center justify-between pb-2 pr-12">
          <span className="font-dm font-bold text-xs sm:text-sm text-nel-violet/80 uppercase tracking-wider">
            New Everyday Life, By Design
          </span>

        </div>

        {/* Celebration Headline */}
        <div className="py-1">
          <h1 className="font-nel font-semibold text-[clamp(1.7rem,5vw,2.8rem)] text-nel-violet tracking-tight uppercase leading-[1.05]">
            YOU'VE WON!
          </h1>
        </div>

        {/* Booklet Dashed Divider Line */}
        <div className="w-full border-b border-solid border-nel-violet/25 my-2" aria-hidden="true" />

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-nel-purple text-nel-pink font-dm font-bold text-xs uppercase tracking-wider mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-nel-pink" aria-hidden="true" />
            <span>Trail Reward Confirmed</span>
          </div>

        {drawResult?.voucherClaimToken && (
          <form onSubmit={async e=>{
            e.preventDefault();
            const response=await fetch('/api/grab/submit-email',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({claimToken:drawResult.voucherClaimToken,email:grabEmail})});
            const data=await response.json();
            setGrabMessage(data.message||data.error||'Please ask booth staff for help.');
          }} className="w-full max-w-md p-4 rounded-xl border-2 border-nel-violet">
            <label htmlFor="grab-email" className="block font-bold mb-2">Email for your Grab voucher</label>
            <input id="grab-email" type="email" required maxLength={254} value={grabEmail}
              onChange={e=>setGrabEmail(e.target.value)} className="w-full rounded-lg p-3 text-base bg-white text-nel-violet"/>
            <button type="submit" className="mt-3 rounded-lg bg-nel-violet text-white px-5 py-3 font-bold">Submit email</button>
            {grabMessage&&<p role="status" className="mt-2 text-sm">{grabMessage}</p>}
          </form>
        )}
        {/* PRIZE DISPLAY SECTION */}
        <section className="my-1 py-1 w-full flex flex-col items-center justify-center">
          {/* 
            Prize PNG Image:
            Integrated pink container with double-outline signage framing.
            Preserves original photographic proportions and transparency.
          */}
          {prizeImageUrl && (
            <div className="mb-2">
              <div className="w-[clamp(100px,19dvh,190px)] h-[clamp(100px,19dvh,190px)] rounded-2xl bg-nel-pink border-2 border-nel-violet p-2.5 sm:p-3 flex items-center justify-center">
                <img
                  src={prizeImageUrl}
                  alt={prizeName}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Actual Prize Name in Oversized NEL Rounded Typography */}
          <div className="font-dm font-bold text-[clamp(1.65rem,4.5vw,3rem)] text-nel-violet leading-[1.08] tracking-tight px-2 break-words max-w-md">
            {prizeName}
          </div>
        </section>

        {/* Booklet Dashed Divider Line */}
        <div className="w-full border-b-2 sm:border-b-4 border-dashed border-nel-purple/35 my-3" aria-hidden="true" />

        {/* 
          Signage Information Panel: Redemption Instruction
          Uses square with double-outline styling and violet tint.
        */}
        <div className="w-full max-w-sm p-3.5 rounded-2xl bg-nel-purple/15 border-2 border-nel-violet text-center mb-2">
          <p className="font-dm font-semibold text-base sm:text-lg text-nel-violet leading-tight">
            Show this screen and your Design Trail booklet to our booth crew.
          </p>
          {ticketNumber && (
            <p className="font-mono text-sm font-bold text-nel-violet/80 mt-1 tracking-wide">
              Ticket: {ticketNumber}
            </p>
          )}
        </div>

        <p className="font-dm text-sm text-nel-violet mt-1">Prizes are subject to availability. Limited to one redemption per person.</p>
        {/* Automatic return to Welcome after three minutes on the result screen */}
        <div className="w-full max-w-sm">
          {/* Automatic Reset Countdown */}
          <p className="text-xs text-nel-purple font-medium font-dm mt-1" aria-live="off">
            Resetting in {countdown}s
          </p>
        </div>
      </div>
    </div>
  );
};
