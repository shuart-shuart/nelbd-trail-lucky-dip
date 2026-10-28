import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { useKiosk } from '../../context/KioskContext';
import {
  isValidSingaporeMobile,
  normalizeSingaporeMobile,
  checkMobileHasDrawn,
} from '../../firebase/firestoreService';
import { DuplicateParticipantView } from '../../components/kiosk/DuplicateParticipantView';

export const DetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, setParticipantDetails, setTicketNumber, resetSession } = useKiosk();

  const [name, setName] = useState(session.name || '');
  const [mobileNumber, setMobileNumber] = useState(
    session.mobileNumber ? session.mobileNumber.replace('+65', '') : ''
  );

  const [nameError, setNameError] = useState<string | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const handleFinishDuplicate = () => {
    resetSession();
    navigate('/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setMobileError(null);

    const cleanNick = name.trim();
    if (!cleanNick) {
      setNameError('Please enter your name.');
      return;
    }

    const cleanDigits = mobileNumber.replace(/\D/g, '');
    const formattedMobile = `+65${cleanDigits}`;

    if (!isValidSingaporeMobile(formattedMobile)) {
      setMobileError('Please enter an 8-digit Singapore number starting with 8 or 9.');
      return;
    }

    setIsChecking(true);

    try {
      // Check if this mobile has already drawn a prize
      const normalized = normalizeSingaporeMobile(formattedMobile);
      const alreadyDrawn = import.meta.env.VITE_DATA_BACKEND === 'postgres'
        ? await (async () => {
            const response = await fetch('/api/lucky-dip/check-mobile', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mobileNumber: normalized }),
            });
            if (!response.ok) throw new Error('Duplicate verification unavailable');
            const data: { alreadyDrawn: boolean } = await response.json();
            return data.alreadyDrawn;
          })()
        : await checkMobileHasDrawn(normalized);

      if (alreadyDrawn) {
        setIsDuplicate(true);
        setIsChecking(false);
        return;
      }

      // Generate ticket number and store participant details
      const generatedTicket = `NELBD-${session.site}-${Math.floor(100000 + Math.random() * 900000)}`;
      setParticipantDetails(cleanNick, normalized);
      setTicketNumber(generatedTicket);

      navigate('/draw');
    } catch (err) {
      console.error('Mobile check error:', err);
      if (import.meta.env.VITE_DATA_BACKEND === 'postgres') {
        setMobileError('Unable to verify this number. Please try again or ask booth crew for assistance.');
        return;
      }
      // Firebase legacy fallback: the draw engine still verifies duplicates.
      const normalized = normalizeSingaporeMobile(formattedMobile);
      const generatedTicket = `NELBD-${session.site}-${Math.floor(100000 + Math.random() * 900000)}`;
      setParticipantDetails(cleanNick, normalized);
      setTicketNumber(generatedTicket);
      navigate('/draw');
    } finally {
      setIsChecking(false);
    }
  };

  // If duplicate participant was detected, render friendly standalone state
  if (isDuplicate) {
    return <DuplicateParticipantView onFinish={handleFinishDuplicate} />;
  }

  return (
    <div className="kiosk-details w-full flex flex-col justify-center my-auto py-2">
      {/* 
        BOOKLET EDITORIAL PANEL (SHAPE SYSTEM: SQUARE WITH DOUBLE OUTLINE)
        Follows the official signage reference with outer bold border and inset double outline.
      */}
      <div className="kiosk-form-card kiosk-primary-panel w-full bg-nel-pink text-nel-violet rounded-3xl sm:rounded-[32px] p-6 sm:p-8 border-4 border-nel-purple outline outline-2 outline-offset-[-6px] sm:outline-offset-[-8px] outline-nel-purple/40 shadow-2xl">
        
        {/* Step Header */}
        <div className="flex items-center justify-between pb-1">
          <span className="font-dm font-bold text-[11px] sm:text-xs uppercase tracking-wider text-nel-purple">
            Step 1 of 2
          </span>
          <span className="font-dm font-bold text-[10px] sm:text-[11px] px-2.5 py-0.5 rounded-full bg-nel-purple text-white uppercase tracking-wider">
            {session.site === 'PDD' ? 'Innovation Hub' : 'Impact Hub'}
          </span>
        </div>

        {/* Heading in NEL Rounded */}
        {/* <h1 className="font-nel font-semibold text-2xl sm:text-3xl md:text-4xl text-nel-violet leading-[1.1] tracking-tight mt-1">
          Ready for your Lucky Dip?
        </h1> */}
         <p id="mobile-help" className="mt-1 text-[11px] font-dm text-nel-purple/80">
               Limited to one redemption per person. 
            </p>
        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="w-full space-y-4 sm:space-y-5">
          
          {/* Name Field */}
          <div>
            <label
              htmlFor="name-input"
              className="block text-sm sm:text-base font-bold text-nel-violet mb-1.5 font-dm"
            >
              Name *
            </label>
            <input
              id="name-input"
              type="text"
              required
              maxLength={40}
              autoComplete="off"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Alex"
              className={`w-full min-h-[50px] px-4 py-3 rounded-xl bg-nel-pink border-2 text-base sm:text-lg font-dm font-bold text-nel-violet placeholder-nel-purple/40 focus:outline-none focus:ring-4 transition-all ${
                nameError
                  ? 'border-red-600 focus:ring-red-300'
                  : 'border-nel-purple/80 focus:border-nel-violet focus:ring-nel-purple/20'
              }`}
            />
            {nameError && (
              <p
                id="name-error"
                role="alert"
                className="mt-1.5 text-xs sm:text-sm font-bold text-nel-purple flex items-center gap-1 font-dm"
              >
                <AlertCircle className="w-4 h-4 text-nel-purple shrink-0" aria-hidden="true" />
                <span>{nameError}</span>
              </p>
            )}
          </div>

          {/* Mobile Number Field */}
          <div>
            <label
              htmlFor="mobile-input"
              className="block text-sm sm:text-base font-bold text-nel-violet mb-1.5 font-dm"
            >
              Singapore Mobile Number *
            </label>
            <div
              className={`flex items-center min-h-[50px] rounded-xl bg-nel-pink border-2 overflow-hidden focus-within:ring-4 transition-all ${
                mobileError
                  ? 'border-red-600 focus-within:ring-red-300'
                  : 'border-nel-purple/80 focus-within:border-nel-violet focus-within:ring-nel-purple/20'
              }`}
            >
              <span
                className="pl-4 pr-3 py-3 text-base sm:text-lg font-bold text-nel-purple border-r-2 border-nel-purple/25 select-none font-dm"
                aria-hidden="true"
              >
                +65
              </span>
              <input
                id="mobile-input"
                type="tel"
                inputMode="numeric"
                aria-invalid={!!mobileError}
                aria-describedby={mobileError ? "mobile-error" : "mobile-help"}
                pattern="[0-9]*"
                autoComplete="tel-national"
                required
                maxLength={8}
                value={mobileNumber}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setMobileNumber(digits);
                  if (mobileError) setMobileError(null);
                }}
                placeholder="81234567"
                className="w-full py-3 px-3 bg-transparent text-base sm:text-lg font-bold text-nel-violet placeholder-nel-purple/40 focus:outline-none font-dm"
              />
            </div>
            <p id="mobile-help" className="mt-1 text-[11px] font-dm text-nel-purple/80">Please enter 8 digits, without spaces. Your mobile number is used to verify for repeated redemption, all information shared will not be held after the event.</p>
            {mobileError && (
              <p
                id="mobile-error"
                role="alert"
                className="mt-1.5 text-xs sm:text-sm font-bold text-nel-purple flex items-center gap-1 font-dm"
              >
                <AlertCircle className="w-4 h-4 text-nel-purple shrink-0" aria-hidden="true" />
                <span>{mobileError}</span>
              </p>
            )}
          </div>

          {/* Editorial Acknowledgement Notice */}
          <div /* className="p-3 rounded-xl bg-nel-purple/10 border border-nel-purple/25">
          </div>*/

          {/* Signage-style Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isChecking}
              className="kiosk-primary-action w-full min-h-[58px] py-4 px-6 rounded-2xl bg-nel-violet hover:bg-[#340557] active:scale-[0.98] text-nel-pink font-nel font-semibold text-xl sm:text-2xl tracking-wide border-2 border-nel-purple/50 shadow-xl flex items-center justify-center gap-3 transition-all cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-nel-purple"
            >
              <span>{isChecking ? 'VERIFYING...' : 'CONTINUE'}</span>
              {!isChecking && <ArrowRight className="w-6 h-6 text-nel-pink stroke-[2.5]" aria-hidden="true" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
