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
  const [isEmailRecorded,setIsEmailRecorded]=useState(false);
  const [isSubmittingEmail,setIsSubmittingEmail]=useState(false);
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

  const submitGrabEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!drawResult?.voucherClaimToken || isSubmittingEmail || isEmailRecorded) return;
    setIsSubmittingEmail(true);
    setGrabMessage('');
    try {
      const response = await fetch('/api/grab/submit-email', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({claimToken:drawResult.voucherClaimToken,email:grabEmail}),
      });
      const data = await response.json();
      if (!response.ok || !data.accepted) {
        setGrabMessage(data.error || 'Email could not be recorded. Please try again.');
        return;
      }
      setIsEmailRecorded(true);
      setGrabMessage(data.message || 'Email recorded. Your voucher is being prepared for delivery.');
    } catch {
      setGrabMessage('Unable to submit your email. Please try again or ask booth staff for help.');
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  return (
    <div className="kiosk-result w-full min-h-0 flex-1 flex flex-col items-center justify-center text-center">
      <div className="kiosk-result-card kiosk-primary-panel kiosk-inset-frame relative w-full bg-nel-pink text-nel-violet rounded-3xl sm:rounded-[32px] shadow-none flex flex-col items-center">

        <div className="kiosk-result-brand w-full flex justify-center items-center">
          <img
            src={nelbdLogo}
            alt="New Everyday Life, By Design"
            className="block w-auto max-w-[min(68%,270px)] h-full object-contain"
          />
        </div>

        {/* The prize comes first; artwork enlarges to fill its violet frame. */}
        <section className="kiosk-result-prize w-full min-h-0 flex flex-col items-center justify-center">
          {prizeImageUrl && (
            <div className="kiosk-prize-frame shrink-0 rounded-2xl overflow-hidden bg-nel-pink border-[3px] border-nel-violet">
              <img
                src={prizeImageUrl}
                alt={prizeName}
                className="kiosk-prize-art block w-full h-full object-cover"
              />
            </div>
          )}
          <h1 className="kiosk-result-title font-nel font-semibold text-nel-violet tracking-tight leading-[1.08] text-center text-balance">
            You've won {prizeName}!
          </h1>
        </section>

        {drawResult?.voucherClaimToken && (
          <div className="kiosk-result-fulfilment w-full max-w-md rounded-xl border-2 border-nel-violet">
            {isEmailRecorded ? (
              <div role="status" className="kiosk-result-success flex items-center justify-center gap-2 text-center">
                <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
                <p>{grabMessage}</p>
              </div>
            ) : (
              <form onSubmit={submitGrabEmail} className="kiosk-result-email-form flex flex-col items-center">
                <label htmlFor="grab-email" className="font-bold">Email for your Grab voucher</label>
                <input
                  id="grab-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  maxLength={254}
                  value={grabEmail}
                  onChange={event=>setGrabEmail(event.target.value)}
                  className="w-full rounded-lg bg-white text-nel-violet text-base"
                />
                <button
                  type="submit"
                  disabled={isSubmittingEmail}
                  className="kiosk-result-submit rounded-lg bg-nel-violet text-white font-bold disabled:opacity-60"
                >
                  {isSubmittingEmail ? 'Sending…' : 'Submit email'}
                </button>
                {grabMessage && <p role="alert" className="kiosk-result-email-error text-center">{grabMessage}</p>}
              </form>
            )}
          </div>
        )}

        <div className="kiosk-result-instructions w-full max-w-lg rounded-xl bg-nel-violet/10 border-2 border-nel-violet text-center">
          <p className="font-dm font-normal text-nel-violet leading-snug">
            Show this screen and your Design Trail booklet to our booth crew.
          </p>
          {ticketNumber && <p className="font-dm font-medium text-nel-violet/80">Ticket: {ticketNumber}</p>}
        </div>

        <p className="kiosk-result-disclaimer font-dm text-nel-violet">
          Prizes are subject to availability. Limited to one redemption per person.
        </p>
        <p className="kiosk-result-countdown text-nel-violet/75 font-medium font-dm" aria-live="off">
          Resetting in {countdown}s
        </p>
      </div>
    </div>
  );
};
