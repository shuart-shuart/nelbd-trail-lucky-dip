import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, CheckCircle2, Sliders, MapPin, Radio, PauseCircle, PlayCircle } from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { saveKioskSettings, subscribeToKioskSettings } from '../../firebase/firestoreService';
import { getPostgresSettings, savePostgresSettings } from '../../api/postgresAdminClient';
import { Setting, DEFAULT_SETTINGS, SiteLocation } from '../../firebase/types';

export const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<Setting>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (import.meta.env.VITE_DATA_BACKEND === 'postgres') {
      getPostgresSettings().then(setSettings).catch((err) => console.error('PostgreSQL settings load failed', err));
      return;
    }
    const unsub = subscribeToKioskSettings((latest) => {
      setSettings(latest);
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      if (import.meta.env.VITE_DATA_BACKEND === 'postgres') await savePostgresSettings(settings);
      else await saveKioskSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout
      title="Kiosk & Site Settings"
      subtitle="Only authenticated administrators may configure festival parameters and default station routing."
    >
      <div className="max-w-3xl">
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Availability Toggle - Obvious LIVE / PAUSED indicator */}
          <div className="bg-white border border-[#E8DEF1] rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Sliders className="w-5 h-5 text-[#8649AC] shrink-0" />
                  <h3 className="text-base font-nel font-semibold text-[#33224B]">
                    Public Kiosk Availability
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                      settings.kioskActive
                        ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                        : 'bg-amber-950/60 border-amber-500/60 text-amber-300'
                    }`}
                  >
                    {settings.kioskActive ? (
                      <>
                        <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                        <span>LIVE / ACTIVE</span>
                      </>
                    ) : (
                      <>
                        <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                        <span>PAUSED</span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-[#756782] font-dm leading-relaxed">
                  When paused, both PDD and PS kiosks display a pause message and stop accepting new lucky dip attempts.
                </p>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E7DCEF]">
                <span className="text-xs font-bold text-[#645574] sm:hidden">
                  Status: {settings.kioskActive ? 'LIVE' : 'PAUSED'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={settings.kioskActive}
                    onChange={(e) => setSettings({ ...settings, kioskActive: e.target.checked })}
                    className="sr-only peer"
                    aria-label="Toggle Public Kiosk Active Status"
                  />
                  <div className="w-14 h-8 bg-nel-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-nel-pink border border-nel-purple/40 shadow-inner"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Site and General Information */}
          <div className="bg-white border border-[#E8DEF1] rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm space-y-4 sm:space-y-5">
            <h3 className="text-base font-nel font-semibold text-[#33224B]">Station Configuration</h3>

            {/* Station Selector: PDD vs PS */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-nel-input/60 border border-nel-purple/40 space-y-2">
              <label className="block text-xs font-bold uppercase text-[#645574] flex items-center gap-1.5 font-dm">
                <MapPin className="w-3.5 h-3.5 text-[#8649AC]" />
                <span>Default Device Site (PDD / PS)</span>
              </label>
              <p className="text-xs text-[#8A7C96] mb-2">
                Select which festival station this device routes to by default.
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, activeSite: 'PDD' })}
                  className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-dm font-bold border transition cursor-pointer min-h-[48px] flex flex-col items-center justify-center ${
                    settings.activeSite === 'PDD'
                      ? 'bg-nel-purple text-[#8649AC] border-nel-pink/60 shadow-sm'
                      : 'bg-nel-input border-nel-purple/40 text-[#756782] hover:text-[#33224B]'
                  }`}
                >
                  <span className="font-bold">Innovation Hub</span>
                  <span className="text-[10px] text-[#8A7C96] font-normal">Punggol Digital District</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, activeSite: 'PS' })}
                  className={`py-3 px-3 rounded-xl text-xs sm:text-sm font-dm font-bold border transition cursor-pointer min-h-[48px] flex flex-col items-center justify-center ${
                    settings.activeSite === 'PS'
                      ? 'bg-nel-purple text-[#8649AC] border-nel-pink/60 shadow-sm'
                      : 'bg-nel-input border-nel-purple/40 text-[#756782] hover:text-[#33224B]'
                  }`}
                >
                  <span className="font-bold">Impact Hub</span>
                  <span className="text-[10px] text-[#8A7C96] font-normal">Plaza Singapura</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5 font-dm">
                Festival & Event Name
              </label>
              <input
                type="text"
                required
                value={settings.festivalName}
                onChange={(e) => setSettings({ ...settings, festivalName: e.target.value })}
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-nel-purple/60 text-[#33224B] text-base sm:text-sm font-dm focus:border-nel-pink focus:outline-none placeholder-white/40"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5 font-dm">
                Max Draws Per Participant
              </label>
              <input
                type="number"
                min="1"
                max="1"
                value={settings.maxDrawsPerParticipant || 1}
                readOnly
                className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-nel-purple/60 text-[#33224B] text-base sm:text-sm font-dm font-mono focus:border-nel-pink focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5 font-dm">
                Kiosk Welcome Greeting
              </label>
              <textarea
                rows={3}
                value={settings.welcomeMessage}
                onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-nel-input border border-nel-purple/60 text-[#33224B] text-base sm:text-sm font-dm focus:border-nel-pink focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5 font-dm">
                Lucky Dip Terms & Guidelines Summary
              </label>
              <textarea
                rows={3}
                value={settings.termsSummary}
                onChange={(e) => setSettings({ ...settings, termsSummary: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl bg-nel-input border border-nel-purple/60 text-[#33224B] text-base sm:text-xs font-dm focus:border-nel-pink focus:outline-none leading-relaxed"
              />
            </div>

            {saveSuccess && (
              <div className="p-3.5 rounded-xl bg-[#F0E8F9] border border-nel-pink/60 text-[#8649AC] text-xs flex items-center gap-2 font-dm font-semibold">
                <CheckCircle2 className="w-4 h-4 text-[#8649AC] shrink-0" />
                <span>Settings successfully saved!</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto px-6 py-3.5 min-h-[48px] rounded-2xl bg-nel-pink hover:brightness-105 active:scale-[0.98] text-nel-violet font-nel font-semibold text-sm shadow-sm shadow-nel-purple/40 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4 text-nel-violet" />
                <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};
