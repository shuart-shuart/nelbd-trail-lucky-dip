import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Setting, DEFAULT_SETTINGS, SiteLocation } from '../firebase/types';
import { subscribeToKioskSettings } from '../firebase/firestoreService';
import { DrawResponse } from '../api/luckyDipClient';

interface KioskSessionData {
  site: SiteLocation;
  nickname: string;
  mobileNumber: string;
  participantId: string | null;
  ticketNumber: string;
  kioskId: string;
  drawResult: DrawResponse | null;
}

interface KioskContextType {
  settings: Setting;
  session: KioskSessionData;
  setSite: (site: SiteLocation) => void;
  setParticipantDetails: (nickname: string, mobileNumber: string, participantId?: string) => void;
  setTicketNumber: (code: string) => void;
  setDrawResult: (result: DrawResponse | null) => void;
  resetSession: () => void;
  isSettingsLoading: boolean;
}

const defaultSession: KioskSessionData = {
  site: 'PDD',
  nickname: '',
  mobileNumber: '',
  participantId: null,
  ticketNumber: '',
  kioskId: 'KIOSK-PDD-01',
  drawResult: null,
};

const KioskContext = createContext<KioskContextType | undefined>(undefined);

const getStoredSite = (): SiteLocation | null => {
  try {
    const val = localStorage.getItem('nelbd_device_site');
    if (val === 'PDD' || val === 'PS') return val;
  } catch {}
  return null;
};

export function KioskProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Setting>(DEFAULT_SETTINGS);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  
  const initialSite = getStoredSite() || DEFAULT_SETTINGS.activeSite || 'PDD';
  const [session, setSession] = useState<KioskSessionData>(() => ({
    ...defaultSession,
    site: initialSite,
    kioskId: `KIOSK-${initialSite}-01`,
  }));

  const activeSiteRef = useRef<SiteLocation>(initialSite);

  useEffect(() => {
    const unsub = subscribeToKioskSettings(
      (newSettings) => {
        setSettings(newSettings);
        setIsSettingsLoading(false);

        // If this device has an explicitly selected site in localStorage, preserve it.
        // Otherwise, sync to the cloud default setting.
        const storedSite = getStoredSite();
        const nextSite = storedSite || newSettings?.activeSite || 'PDD';
        activeSiteRef.current = nextSite;

        // Only sync site if the session is currently idle/unstarted
        setSession((prev) => {
          if (prev.nickname || prev.mobileNumber || prev.ticketNumber || prev.drawResult) {
            return prev;
          }
          if (prev.site === nextSite && prev.kioskId === `KIOSK-${nextSite}-01`) {
            return prev;
          }
          return {
            ...prev,
            site: nextSite,
            kioskId: `KIOSK-${nextSite}-01`,
          };
        });
      },
      () => {
        setIsSettingsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const setSite = useCallback((site: SiteLocation) => {
    activeSiteRef.current = site;
    try {
      localStorage.setItem('nelbd_device_site', site);
    } catch {}
    setSession((prev) => {
      if (prev.site === site && prev.kioskId === `KIOSK-${site}-01`) {
        return prev;
      }
      return {
        ...prev,
        site,
        kioskId: `KIOSK-${site}-01`,
      };
    });
  }, []);

  const setParticipantDetails = useCallback(
    (nickname: string, mobileNumber: string, participantId?: string) => {
      setSession((prev) => ({
        ...prev,
        nickname,
        mobileNumber,
        participantId: participantId || prev.participantId,
      }));
    },
    []
  );

  const setTicketNumber = useCallback((code: string) => {
    setSession((prev) => {
      if (prev.ticketNumber === code) return prev;
      return { ...prev, ticketNumber: code };
    });
  }, []);

  const setDrawResult = useCallback((result: DrawResponse | null) => {
    setSession((prev) => ({ ...prev, drawResult: result }));
  }, []);

  const resetSession = useCallback(() => {
    const currentSite = activeSiteRef.current;
    setSession((prev) => {
      // If already reset to default state for the current active site, do not update state
      if (
        !prev.nickname &&
        !prev.mobileNumber &&
        !prev.ticketNumber &&
        !prev.drawResult &&
        !prev.participantId &&
        prev.site === currentSite &&
        prev.kioskId === `KIOSK-${currentSite}-01`
      ) {
        return prev;
      }
      return {
        ...defaultSession,
        site: currentSite,
        kioskId: `KIOSK-${currentSite}-01`,
      };
    });
  }, []);

  const value = useMemo(
    () => ({
      settings,
      session,
      setSite,
      setParticipantDetails,
      setTicketNumber,
      setDrawResult,
      resetSession,
      isSettingsLoading,
    }),
    [
      settings,
      session,
      setSite,
      setParticipantDetails,
      setTicketNumber,
      setDrawResult,
      resetSession,
      isSettingsLoading,
    ]
  );

  return <KioskContext.Provider value={value}>{children}</KioskContext.Provider>;
}

export function useKiosk() {
  const context = useContext(KioskContext);
  if (!context) {
    throw new Error('useKiosk must be used within a KioskProvider');
  }
  return context;
}
