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

  const [name, setName] = useState(session.nickname || '');
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
    <div className="kiosk-details w-full flex flex-col justify-center my-auto py-1">
      {/* 
        BOOKLET EDITORIAL PANEL (SHAPE SYSTEM: SQUARE WITH DOUBLE OUTLINE)
        Follows the official signage reference with outer bold border and inset double outline.
      */}
      <div className="kiosk-form-card kiosk-primary-panel w-full bg-nel-pink text-nel-violet rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-none">
        
        {/* Step Header */}
        <div className="flex items-center justify-between pb-1">
          <span className="font-dm font-bold text-xs sm:text-sm uppercase tracking-wider text-nel-violet">
            Step 1 of 2
          </span>
          <span className="font-dm font-bold text-xs sm:text-sm px-2.5 py-0.5 rounded-full bg-nel-pink text-nel-violet border-2 border-nel-violet uppercase tracking-wider">
            {session.site === 'PDD' ? 'Innovation Hub' : 'Impact Hub'}
          </span>
        </div>

        {/* Heading in NEL Rounded */}
        {/* <h1 className="font-nel font-semibold text-2xl sm:text-3xl md:text-4xl text-nel-violet leading-[1.1] tracking-tight mt-1">
          Ready for your Lucky Dip?
        </h1> */}
         <p id="mobile-help" className="mt-1 text-sm font-dm text-nel-violet/85">
               Limited to one redemption per person. 
            </p>
        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="w-full space-y-3 sm:space-y-4">
          
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
              className={`w-full min-h-[50px] px-4 py-3 rounded-xl bg-nel-pink border text-base sm:text-lg font-dm font-bold text-nel-violet placeholder-nel-violet/55 focus:outline-none focus:ring-0 ${
                nameError
                  ? 'border-nel-violet'
                  : 'border-nel-violet'
              }`}
            />
            {nameError && (
              <p
                id="name-error"
                role="alert"
                className="mt-1.5 text-xs sm:text-sm font-bold text-nel-violet flex items-center gap-1 font-dm"
              >
                <AlertCircle className="w-4 h-4 text-nel-violet shrink-0" aria-hidden="true" />
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
              className={`kiosk-phone-field flex items-center min-h-[50px] rounded-xl bg-nel-pink border overflow-hidden focus-within:ring-0 ${
                mobileError
                  ? 'border-nel-violet'
                  : 'border-nel-violet'
              }`}
            >
              <span
                className="pl-4 pr-3 py-3 text-base sm:text-lg font-bold text-nel-violet select-none font-dm"
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
                className="w-full py-3 px-3 bg-transparent text-base sm:text-lg font-bold text-nel-violet placeholder-nel-violet/55 focus:outline-none font-dm"
              />
            </div>
            <p id="mobile-help" className="mt-1 text-xs font-dm text-nel-violet">Please enter 8 digits, without spaces. Your mobile number is used to verify for repeated redemption, all information shared will not be held after the event.</p>
            {mobileError && (
              <p
                id="mobile-error"
                role="alert"
                className="mt-1.5 text-xs sm:text-sm font-bold text-nel-violet flex items-center gap-1 font-dm"
              >
                <AlertCircle className="w-4 h-4 text-nel-violet shrink-0" aria-hidden="true" />
                <span>{mobileError}</span>
              </p>
            )}
          </div>

          {/* Editorial Acknowledgement Notice */}
          {/* <div className="p-3 rounded-xl bg-nel-purple/10 border border-nel-violet">
          </div> */}

          {/* Signage-style Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isChecking}
              className="kiosk-primary-action w-full min-h-[52px] py-3 px-6 rounded-2xl bg-nel-violet text-nel-pink font-nel font-semibold text-xl sm:text-2xl tracking-wide border-0 shadow-none flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
