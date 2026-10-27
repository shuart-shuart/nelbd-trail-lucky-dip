import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Gift,
  History,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Server,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Users,
} from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
  subscribeToPrizesWithInventory,
  subscribeToTodayDraws,
  getDrawsCount,
  subscribeToKioskSettings,
  seedInitialPrizesAndInventory,
  getParticipants,
} from '../../firebase/firestoreService';
import { PrizeWithInventory, Draw, Setting, DEFAULT_SETTINGS, Participant } from '../../firebase/types';
import { checkServerStatus } from '../../api/luckyDipClient';

export const AdminDashboard: React.FC = () => {
  const [prizes, setPrizes] = useState<PrizeWithInventory[]>([]);
  const [todayDraws, setTodayDraws] = useState<Draw[]>([]);
  const [totalDrawsCount, setTotalDrawsCount] = useState<number>(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [settings, setSettings] = useState<Setting>(DEFAULT_SETTINGS);
  const [serverState, setServerState] = useState<{
    status: string;
    service?: string;
    algorithmReady?: boolean;
    algorithmStatus?: string;
    singaporeDate?: string;
  } | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubPrizes = subscribeToPrizesWithInventory(setPrizes);
    const unsubTodayDraws = subscribeToTodayDraws(setTodayDraws);
    const unsubSettings = subscribeToKioskSettings(setSettings);
    
    getDrawsCount()
      .then((count) => setTotalDrawsCount(count))
      .catch(() => {});

    getParticipants()
      .then((data) => setParticipants(data))
      .catch(() => {});

    checkServerStatus()
      .then((res) =>
        setServerState({
          status: res.status,
          service: res.service,
          algorithmReady: res.algorithmReady,
          singaporeDate: res.singaporeDate,
          algorithmStatus: res.algorithmReady
            ? 'Server-side draw engine active (concurrency-safe)'
            : 'Operational',
        })
      )
      .catch(() =>
        setServerState({ status: 'operational', algorithmStatus: 'Server functions active' })
      );

    return () => {
      unsubPrizes();
      unsubTodayDraws();
      unsubSettings();
    };
  }, []);

  const totalPddStock = prizes.reduce((acc, curr) => acc + curr.pddInventory.remainingQuantity, 0);
  const totalPsStock = prizes.reduce((acc, curr) => acc + curr.psInventory.remainingQuantity, 0);
  const grandTotalRemaining = totalPddStock + totalPsStock;
  const grandTotalAllocated = prizes.reduce((acc, curr) => acc + curr.totalAllocated, 0);

  const topPrizes = prizes.filter((p) => p.tier === 'TOP');
  const topPrizesRemaining = topPrizes.reduce(
    (acc, curr) => acc + curr.pddInventory.remainingQuantity + curr.psInventory.remainingQuantity,
    0
  );
  const standardPrizesCount = prizes.filter((p) => p.tier === 'STANDARD').length;

  // Real-time all-time draw counts derived from site inventory claimed quantities and server count
  const allTimePddDraws = prizes.reduce(
    (acc, curr) => acc + (curr.pddInventory?.claimedQuantity || 0),
    0
  );
  const allTimePsDraws = prizes.reduce(
    (acc, curr) => acc + (curr.psInventory?.claimedQuantity || 0),
    0
  );
  const inventoryTotalDraws = allTimePddDraws + allTimePsDraws;
  const allTimeTotalDraws = Math.max(totalDrawsCount, inventoryTotalDraws);

  // Today's metrics (Singapore time SGT UTC+8) derived in real time from today's draws subscription
  const todayDrawsCount = todayDraws.length;
  const todayPddDraws = todayDraws.filter((d) => d.site === 'PDD').length;
  const todayPsDraws = todayDraws.filter((d) => d.site === 'PS').length;
  const todayTopPrizeCount = todayDraws.filter((d) => d.prizeTier === 'TOP').length;

  const uniqueParticipantsCount = participants.length > 0
    ? participants.length
    : allTimeTotalDraws;

  // Low stock and sold out warnings
  const soldOutPrizes = prizes.filter(
    (p) => p.pddInventory.remainingQuantity === 0 && p.psInventory.remainingQuantity === 0
  );
  const lowStockPrizes = prizes.filter((p) => {
    const totalRem = p.pddInventory.remainingQuantity + p.psInventory.remainingQuantity;
    return totalRem > 0 && totalRem <= 10;
  });

  const handleSeed = async () => {
    setIsSeeding(true);
    setSeedMessage(null);
    try {
      await seedInitialPrizesAndInventory();
      setSeedMessage('Default festival prize catalog and site inventories initialized successfully!');
    } catch (err) {
      console.error(err);
      setSeedMessage('Failed to initialize seed catalog.');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <AdminLayout
      title="Operations Overview"
      subtitle="Live event insights, prize availability and station operations."
      actions={
        <div className="flex items-center space-x-2">
          <Link
            to="/"
            className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F5B2D6] hover:brightness-105 active:scale-98 text-[#3D2454] font-dm font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
          >
            <span>Launch Kiosk</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#3D2454]" />
          </Link>
        </div>
      }
    >
      {/* Top Status Metrics Cards: 2-col on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6 sm:mb-8">
        {/* Today's Draws & Totals */}
        <div className="admin-card rounded-2xl p-3.5 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase text-[#796C88] font-dm truncate">
                Today's Draws
              </span>
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8B4AB2] shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-dm font-semibold text-[#33224B] font-mono">
              {todayDrawsCount}{' '}
              <span className="text-[11px] sm:text-xs font-normal text-[#8A7D99] font-dm">
                ({allTimeTotalDraws} all-time)
              </span>
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-[#81748F] mt-2 font-dm truncate">
            PDD: <span className="font-mono text-[#8B4AB2] font-semibold">{todayPddDraws}</span> | PS:{' '}
            <span className="font-mono text-[#5279AE] font-semibold">{todayPsDraws}</span>
          </p>
        </div>

        {/* Total Calculated Stock */}
        <div className="admin-card rounded-2xl p-3.5 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase text-[#796C88] font-dm truncate">
                Total Stock
              </span>
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8B4AB2] shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-dm font-semibold text-[#8B4AB2] font-mono">
              {grandTotalRemaining}{' '}
              <span className="text-[11px] sm:text-xs font-normal text-[#8A7D99] font-dm">
                / {grandTotalAllocated}
              </span>
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-[#81748F] mt-2 font-dm truncate">
            PDD: <strong className="text-[#8B4AB2] font-mono">{totalPddStock}</strong> | PS:{' '}
            <strong className="text-[#5279AE] font-mono">{totalPsStock}</strong>
          </p>
        </div>

        {/* Top Prize Today & Remaining */}
        <div className="admin-card rounded-2xl p-3.5 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase text-[#796C88] font-dm truncate">
                Top Prizes
              </span>
              <Server className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#B47B23] shrink-0" />
            </div>
            <div className="text-xl sm:text-2xl font-dm font-semibold text-[#B47B23] font-mono">
              {topPrizesRemaining}{' '}
              <span className="text-[11px] sm:text-xs font-normal text-[#8A7D99] font-dm">
                left
              </span>
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-[#81748F] mt-2 font-dm truncate">
            Won today: <strong className="text-[#33224B] font-mono">{todayTopPrizeCount}</strong> • {topPrizes.length} tiers
          </p>
        </div>

        {/* Unique Participants & Kiosk Availability */}
        <div className="admin-card rounded-2xl p-3.5 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase text-[#796C88] font-dm truncate">
                Participants
              </span>
              <span
                className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${
                  settings.kioskActive ? 'bg-[#F5B2D6] animate-pulse' : 'bg-amber-400'
                }`}
                title={settings.kioskActive ? 'Kiosk Live' : 'Kiosk Paused'}
              />
            </div>
            <div className="text-xl sm:text-2xl font-dm font-semibold text-[#33224B] font-mono">
              {uniqueParticipantsCount}
            </div>
          </div>
          <p className="text-[10px] sm:text-xs text-[#81748F] mt-2 font-dm truncate">
            Kiosk: <strong className={settings.kioskActive ? 'text-[#8B4AB2]' : 'text-[#B47B23]'}>
              {settings.kioskActive ? 'LIVE' : 'PAUSED'}
            </strong> ({settings.activeSite || 'PDD'})
          </p>
        </div>
      </div>

      {/* Warnings & Operational Alerts (Low stock / Sold out) */}
      {(soldOutPrizes.length > 0 || lowStockPrizes.length > 0) && (
        <div className="mb-6 space-y-2">
          {soldOutPrizes.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Sold Out Alert: </span>
                <span>
                  {soldOutPrizes.map((p) => p.name).join(', ')} ({soldOutPrizes.length} item
                  {soldOutPrizes.length > 1 ? 's' : ''} at 0 inventory).
                </span>
              </div>
            </div>
          )}
          {lowStockPrizes.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-[#B47B23] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Low Stock Warning (≤ 10 remaining): </span>
                <span>
                  {lowStockPrizes
                    .map(
                      (p) =>
                        `${p.name} (${p.pddInventory.remainingQuantity + p.psInventory.remainingQuantity} left)`
                    )
                    .join('; ')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Seed helper banner if prizes is 0 */}
      {prizes.length === 0 && (
        <div className="mb-6 p-4 sm:p-6 rounded-3xl bg-[#F1EAF9] border border-[#DEC9ED] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h3 className="text-sm sm:text-base font-dm font-semibold text-[#33224B] flex items-center gap-2">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#8B4AB2]" />
              <span>Initialize Festival Prize Catalog & Site Inventories</span>
            </h3>
            <p className="text-xs text-[#756884] mt-1 font-dm">
              Your prize collection is empty. Seed default STANDARD and TOP tier prizes with separate PDD and PS allocations.
            </p>
          </div>
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            className="w-full md:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-[#F5B2D6] hover:brightness-105 text-[#3D2454] font-dm font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 text-[#3D2454] ${isSeeding ? 'animate-spin' : ''}`} />
            <span>{isSeeding ? 'Seeding...' : 'Seed Sample Catalog'}</span>
          </button>
        </div>
      )}

      {seedMessage && (
        <div className="mb-6 p-3.5 rounded-xl bg-[#F0E8F9] border border-[#DEC9ED] text-xs text-[#8B4AB2] font-dm font-semibold">
          {seedMessage}
        </div>
      )}

      {/* Quick Navigation Panels: 1 column on mobile, 3 columns on tablet/desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Inventory Card */}
        <Link
          to="/admin/inventory"
          className="admin-card group rounded-3xl p-5 sm:p-6 transition flex flex-col justify-between shadow-sm"
        >
          <div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#F0E8F9] border border-[#E4CEEF] flex items-center justify-center text-[#8B4AB2] mb-3 sm:mb-4 group-hover:scale-110 transition">
              <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-dm font-semibold text-[#33224B] group-hover:text-[#8B4AB2] transition">
              Site Inventory Matrix
            </h3>
            <p className="text-xs text-[#796C88] mt-1 leading-relaxed font-dm">
              Manage separate PDD & PS stock quantities, record audit adjustments, and add STANDARD/TOP tier rewards.
            </p>
          </div>
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-[#E8DDF2] flex items-center justify-between text-xs font-dm font-bold text-[#8B4AB2] min-h-[36px]">
            <span>Open Inventory</span>
            <ExternalLink className="w-4 h-4" />
          </div>
        </Link>

        {/* History Card */}
        <Link
          to="/admin/history"
          className="admin-card group rounded-3xl p-5 sm:p-6 transition flex flex-col justify-between shadow-sm"
        >
          <div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#F0E8F9] border border-[#E4CEEF] flex items-center justify-center text-[#8B4AB2] mb-3 sm:mb-4 group-hover:scale-110 transition">
              <History className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-dm font-semibold text-[#33224B] group-hover:text-[#8B4AB2] transition">
              Draw History & Participants
            </h3>
            <p className="text-xs text-[#796C88] mt-1 leading-relaxed font-dm">
              Verify participant passport codes, manage claim handoffs, and view protected participant records.
            </p>
          </div>
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-[#E8DDF2] flex items-center justify-between text-xs font-dm font-bold text-[#8B4AB2] min-h-[36px]">
            <span>View Logs ({allTimeTotalDraws})</span>
            <ExternalLink className="w-4 h-4" />
          </div>
        </Link>

        {/* Settings Card */}
        <Link
          to="/admin/settings"
          className="admin-card group rounded-3xl p-5 sm:p-6 transition flex flex-col justify-between shadow-sm"
        >
          <div>
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#F0E8F9] border border-[#E4CEEF] flex items-center justify-center text-[#8B4AB2] mb-3 sm:mb-4 group-hover:scale-110 transition">
              <MapPin className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-base sm:text-lg font-dm font-semibold text-[#33224B] group-hover:text-[#8B4AB2] transition">
              Kiosk & Site Settings
            </h3>
            <p className="text-xs text-[#796C88] mt-1 leading-relaxed font-dm">
              Configure active festival station (PDD or PS), toggle live kiosk availability, and customize terms.
            </p>
          </div>
          <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-[#E8DDF2] flex items-center justify-between text-xs font-dm font-bold text-[#8B4AB2] min-h-[36px]">
            <span>Configure Settings</span>
            <ExternalLink className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </AdminLayout>
  );
};
