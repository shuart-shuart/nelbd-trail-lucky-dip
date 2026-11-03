import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import nelbdLogo from '../../assets/img/nelbd-logo.png';
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

  return (
    <div className="kiosk-result w-full flex flex-col items-center justify-between text-center my-auto py-1">
      <div className="kiosk-result-card kiosk-primary-panel kiosk-inset-frame relative w-full bg-nel-pink text-nel-violet rounded-3xl sm:rounded-[32px] p-4 sm:p-5 md:p-6 shadow-none flex flex-col items-center justify-between">
        {/* Original NELBD branding replaces text and the cross button. */}
        <div className="w-full flex justify-center items-center py-1">
          <img
            src={nelbdLogo}
            alt="New Everyday Life, By Design"
            className="block w-auto max-w-[min(58%,250px)] max-h-[clamp(34px,7dvh,72px)] object-contain"
          />
        </div>

        {/* Single prize announcement; name is part of the headline. */}
        <h1 className="font-nel font-semibold text-[clamp(1.75rem,5.3vw,3.2rem)] text-nel-violet tracking-tight leading-[1.1] text-center text-balance px-2 py-2">
          You've won {prizeName}!
        </h1>

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
              <div className="w-[clamp(190px,34dvh,320px)] h-[clamp(190px,34dvh,320px)] rounded-2xl bg-nel-pink border-[3px] border-nel-violet p-2 sm:p-3 flex items-center justify-center">
                <img
                  src={prizeImageUrl}
                  alt={prizeName}
                  className="w-full h-full object-contain"
                />
              </div>
            </div>
          )}

        </section>

        {/* Booklet Dashed Divider Line */}
        <div className="w-full border-b border-solid border-nel-violet/25 my-2" aria-hidden="true" />

        {/* 
          Signage Information Panel: Redemption Instruction
          Uses square with double-outline styling and violet tint.
        */}
        <div className="w-full max-w-sm p-3.5 rounded-2xl bg-nel-violet/10 border-2 border-nel-violet text-center mb-2">
          <p className="font-dm font-normal text-xs sm:text-sm text-nel-violet leading-snug">
            Show this screen and your Design Trail booklet to our booth crew.
          </p>
          {ticketNumber && (
            <p className="font-dm text-xs font-medium text-nel-violet/80 mt-1">
              Ticket: {ticketNumber}
            </p>
          )}
        </div>

        <p className="font-dm text-xs sm:text-sm text-nel-violet mt-1">Prizes are subject to availability. Limited to one redemption per person.</p>
        {/* Automatic return to Welcome after three minutes on the result screen */}
        <div className="w-full max-w-sm">
          {/* Automatic Reset Countdown */}
          <p className="text-xs text-nel-violet/75 font-medium font-dm mt-1" aria-live="off">
            Resetting in {countdown}s
          </p>
        </div>
      </div>
    </div>
  );
};
