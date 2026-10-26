import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  CheckCircle2,
  Clock,
  Filter,
  Users,
  Award,
  Phone,
  ShieldCheck,
  MapPin,
  Download,
  Trophy,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
  subscribeToLatestDraws,
  fetchOlderDraws,
  getDrawsCount,
  searchDrawByTicket,
  fetchAllDraws,
  updateDrawStatus,
  getParticipants,
  getPrizes,
} from '../../firebase/firestoreService';
import { Draw, DrawStatus, Participant, SiteLocation } from '../../firebase/types';

export const AdminHistory: React.FC = () => {
  const [draws, setDraws] = useState<Draw[]>([]);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [isSearchingFull, setIsSearchingFull] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [totalDrawsCount, setTotalDrawsCount] = useState<number>(0);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [prizesMap, setPrizesMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'draws' | 'participants'>('draws');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DrawStatus>('all');
  const [siteFilter, setSiteFilter] = useState<'all' | SiteLocation>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch total historical count via fast server aggregation
    getDrawsCount()
      .then((c) => setTotalDrawsCount(c))
      .catch(() => {});

    // 2. Real-time bounded subscription for latest 50 records
    const unsubDraws = subscribeToLatestDraws(50, (newest50, lastDoc, more) => {
      setDraws((prev) => {
        const map = new Map<string, Draw>();
        // Add existing older draws first so they are retained
        prev.forEach((d) => map.set(d.id, d));
        // Add/update newest 50
        newest50.forEach((d) => map.set(d.id, d));
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.drawnAt).getTime() - new Date(a.drawnAt).getTime()
        );
      });
      setLastVisibleDoc((prevLast: any) => prevLast || lastDoc);
      setHasMore((prevMore) => (prevMore !== undefined ? prevMore : more));
    });

    getParticipants()
      .then((data) => setParticipants(data))
      .catch((err) => console.error('Failed to load participants:', err));

    getPrizes()
      .then((prizesList) => {
        const map: Record<string, string> = {};
        prizesList.forEach((p) => {
          if (p.id && p.imageUrl) {
            map[p.id] = p.imageUrl;
          }
        });
        setPrizesMap(map);
      })
      .catch((err) => console.error('Failed to load prizes catalog for history:', err));

    return () => unsubDraws();
  }, []);

  // Dedicated ticket code search directly against Firestore if not currently in loaded cache
  useEffect(() => {
    const trimmed = searchQuery.trim().toUpperCase();
    if (trimmed.startsWith('NELBD-') && trimmed.length >= 10) {
      const alreadyLoaded = draws.some((d) => d.ticketNumber?.toUpperCase() === trimmed);
      if (!alreadyLoaded) {
        searchDrawByTicket(trimmed)
          .then((foundDraw) => {
            if (foundDraw) {
              setDraws((prev) => {
                if (prev.some((d) => d.id === foundDraw.id)) return prev;
                return [foundDraw, ...prev];
              });
            }
          })
          .catch(() => {});
      }
    }
  }, [searchQuery, draws]);

  const handleLoadMore = async () => {
    if (!lastVisibleDoc || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchOlderDraws(50, lastVisibleDoc);
      setDraws((prev) => {
        const map = new Map<string, Draw>();
        prev.forEach((d) => map.set(d.id, d));
        res.draws.forEach((d) => map.set(d.id, d));
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.drawnAt).getTime() - new Date(a.drawnAt).getTime()
        );
      });
      setLastVisibleDoc(res.lastDoc);
      setHasMore(res.hasMore);
    } catch (err) {
      console.error('Failed to load older draws:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleLoadAll = async () => {
    if (isLoadingAll) return;
    setIsLoadingAll(true);
    try {
      const all = await fetchAllDraws();
      setDraws(all);
      setHasMore(false);
      setLastVisibleDoc(null);
    } catch (err) {
      console.error('Failed to load all draws:', err);
    } finally {
      setIsLoadingAll(false);
    }
  };

  const handleSearchFullHistory = async () => {
    if (isSearchingFull) return;
    setIsSearchingFull(true);
    try {
      const all = await fetchAllDraws();
      setDraws(all);
      setHasMore(false);
      setLastVisibleDoc(null);
    } catch (err) {
      console.error('Failed to search full history:', err);
    } finally {
      setIsSearchingFull(false);
    }
  };

  const getPrizeThumbnailUrl = (draw: Draw): string => {
    // 1. Prefer matching active/catalog prize image using draw.prizeId
    if (draw.prizeId && prizesMap[draw.prizeId]) {
      return prizesMap[draw.prizeId];
    }
    // 2. Fallback to historical embedded draw image if present
    if (draw.prizeImageUrl) {
      return draw.prizeImageUrl;
    }
    return '';
  };

  const filteredDraws = draws.filter((draw) => {
    const q = (searchQuery || '').toLowerCase();
    const matchQuery =
      (draw?.ticketNumber || '').toLowerCase().includes(q) ||
      (draw?.participantNickname || '').toLowerCase().includes(q) ||
      (draw?.prizeName || '').toLowerCase().includes(q);

    const matchStatus = statusFilter === 'all' || draw.status === statusFilter;
    const matchSite = siteFilter === 'all' || draw.site === siteFilter;

    return matchQuery && matchStatus && matchSite;
  });

  const filteredParticipants = participants.filter((p) => {
    const q = (searchQuery || '').toLowerCase();
    const matchQuery =
      (p?.nickname || '').toLowerCase().includes(q) ||
      (p?.mobileNumber || '').toLowerCase().includes(q);
    const matchSite = siteFilter === 'all' || p.site === siteFilter;
    return matchQuery && matchSite;
  });

  const handleStatusChange = async (draw: Draw, newStatus: DrawStatus) => {
    setProcessingId(draw.id);
    try {
      await updateDrawStatus(draw.id, newStatus, draw.prizeId, draw.site);
    } catch (err) {
      console.error('Failed to update draw status:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // CSV Export for draws / participants (100% complete dataset export)
  const handleExportCsv = async () => {
    if (activeTab === 'draws') {
      setIsExporting(true);
      try {
        let exportData: Draw[] = draws;
        if (draws.length < totalDrawsCount) {
          exportData = await fetchAllDraws();
        }
        const filteredExport = exportData.filter((draw) => {
          const q = (searchQuery || '').toLowerCase();
          const matchQuery =
            (draw?.ticketNumber || '').toLowerCase().includes(q) ||
            (draw?.participantNickname || '').toLowerCase().includes(q) ||
            (draw?.prizeName || '').toLowerCase().includes(q);

          const matchStatus = statusFilter === 'all' || draw.status === statusFilter;
          const matchSite = siteFilter === 'all' || draw.site === siteFilter;

          return matchQuery && matchStatus && matchSite;
        });

        const headers = ['Ticket Number', 'Participant Nickname', 'Site', 'Prize Name', 'Tier', 'Drawn At', 'Status'];
        const rows = filteredExport.map((d) => [
          `"${d.ticketNumber || ''}"`,
          `"${(d.participantNickname || 'Trail Walker').replace(/"/g, '""')}"`,
          `"${d.site || ''}"`,
          `"${(d.prizeName || '').replace(/"/g, '""')}"`,
          `"${d.prizeTier || ''}"`,
          `"${d.drawnAt || ''}"`,
          `"${d.status || ''}"`,
        ]);
        const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `nelbd_draws_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Failed to export CSV:', err);
      } finally {
        setIsExporting(false);
      }
    } else {
      const headers = ['Nickname', 'Mobile Number', 'Registered Site', 'Registration Timestamp'];
      const rows = filteredParticipants.map((p) => [
        `"${(p.nickname || '').replace(/"/g, '""')}"`,
        `"${p.mobileNumber || ''}"`,
        `"${p.site || ''}"`,
        `"${p.createdAt || ''}"`,
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `nelbd_participants_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AdminLayout
      title="Draw History & Participant Records"
      subtitle="Only authenticated administrators may access draw history, ticket verification, and participant records."
      actions={
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isExporting}
          className="w-full sm:w-auto px-4 py-2 min-h-[44px] rounded-xl bg-nel-purple/30 hover:bg-slate-700 active:scale-98 text-white text-xs font-bold flex items-center justify-center gap-1.5 border border-nel-purple/50 transition shadow cursor-pointer disabled:opacity-50"
        >
          {isExporting ? (
            <RefreshCw className="w-3.5 h-3.5 text-nel-pink animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5 text-nel-pink" />
          )}
          <span>{isExporting ? 'Exporting CSV...' : `Export ${activeTab === 'draws' ? 'Draws' : 'Participants'} CSV`}</span>
        </button>
      }
    >
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-nel-purple/30 pb-2">
        <button
          onClick={() => setActiveTab('draws')}
          className={`px-3.5 sm:px-4 py-2 min-h-[44px] rounded-xl text-xs font-dm font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'draws'
              ? 'bg-nel-purple text-nel-pink border border-nel-pink/50 shadow'
              : 'text-white/70 hover:text-white'
          }`}
        >
          <History className="w-4 h-4 text-nel-pink shrink-0" />
          <span>Draw History ({totalDrawsCount > 0 ? totalDrawsCount : draws.length})</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('participants');
            getParticipants().then(setParticipants).catch(() => {});
          }}
          className={`px-3.5 sm:px-4 py-2 min-h-[44px] rounded-xl text-xs font-dm font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'participants'
              ? 'bg-nel-purple text-nel-pink border border-nel-pink/50 shadow'
              : 'text-white/70 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 text-nel-pink shrink-0" />
          <span>Registered Participants ({participants.length})</span>
        </button>
      </div>

      {/* Search and Filter Toolbar */}
      <div className="bg-nel-surface border border-nel-purple/50 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 mb-6 flex flex-col gap-3 sm:gap-4 shadow-xl">
        {/* Search Input - Full width on mobile */}
        <div className="relative w-full">
          <Search className="w-4 h-4 text-white/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'draws' ? 'Search ticket, nickname or prize...' : 'Search nickname or mobile...'}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-nel-input border border-nel-purple/60 text-white text-base sm:text-sm font-dm focus:border-nel-pink focus:outline-none placeholder-white/40 min-h-[44px]"
          />
        </div>

        {/* Secondary Filters row */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Site Filter */}
          <div className="flex items-center space-x-1 bg-nel-input p-1 rounded-xl border border-nel-purple/40 flex-1 sm:flex-initial">
            <MapPin className="w-3.5 h-3.5 text-nel-pink mx-1 shrink-0" />
            {(['all', 'PDD', 'PS'] as const).map((site) => (
              <button
                key={site}
                onClick={() => setSiteFilter(site)}
                className={`px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-dm font-bold transition cursor-pointer flex-1 sm:flex-initial text-center ${
                  siteFilter === site
                    ? 'bg-nel-purple text-nel-pink border border-nel-pink/50 shadow'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {site === 'all' ? 'All Sites' : `Site ${site}`}
              </button>
            ))}
          </div>

          {/* Status Filter (for draws tab) */}
          {activeTab === 'draws' && (
            <div className="flex items-center space-x-1 bg-nel-input p-1 rounded-xl border border-nel-purple/40 flex-1 sm:flex-initial">
              <Filter className="w-3.5 h-3.5 text-nel-pink mx-1 shrink-0" />
              {(['all', 'pending', 'claimed'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 sm:px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-dm font-bold capitalize transition cursor-pointer flex-1 sm:flex-initial text-center ${
                    statusFilter === status
                      ? 'bg-nel-purple text-nel-pink border border-nel-pink/50 shadow'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full-History Search Notice if active search is entered and backlog exists */}
      {activeTab === 'draws' && searchQuery.trim().length > 0 && draws.length < totalDrawsCount && (
        <div className="mb-4 p-3.5 rounded-2xl bg-nel-purple/40 border border-nel-pink/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-dm shadow-lg">
          <div className="text-white/80">
            <span className="font-bold text-nel-pink">Filtered Search:</span> Showing results from{' '}
            <strong className="text-white font-mono">{draws.length}</strong> loaded draws.{' '}
            <span className="text-white/60">
              ({totalDrawsCount - draws.length} older records in full archive)
            </span>
          </div>
          <button
            type="button"
            onClick={handleSearchFullHistory}
            disabled={isSearchingFull}
            className="px-3.5 py-1.5 min-h-[34px] rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-bold text-xs shrink-0 flex items-center gap-1.5 transition cursor-pointer shadow"
          >
            {isSearchingFull ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Searching Archive...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>Search Full Archive</span>
              </>
            )}
          </button>
        </div>
      )}

      {activeTab === 'draws' ? (
        /* Draws Container */
        <div className="bg-nel-surface border border-nel-purple/50 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-nel-purple/40 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 sm:w-5 sm:h-5 text-nel-pink" />
              <span className="text-xs sm:text-sm font-nel font-semibold text-white uppercase tracking-wider">
                Lucky Dip Records ({filteredDraws.length})
              </span>
            </div>
            <span className="text-xs text-white/60 font-dm">
              Total logged: {totalDrawsCount > 0 ? totalDrawsCount : draws.length}
              {draws.length < totalDrawsCount && ` (${draws.length} loaded)`}
            </span>
          </div>

          {filteredDraws.length === 0 ? (
            <div className="p-8 sm:p-12 text-center">
              <Award className="w-12 h-12 text-white/40 mx-auto mb-3" />
              <h3 className="text-base font-nel font-semibold text-white/80">No records found</h3>
              <p className="text-xs text-white/60 mt-1 max-w-sm mx-auto font-dm">
                As participants draw prizes at PDD and PS kiosks, their records will display here.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card Presentation (Visible on mobile/tablet up to lg) */}
              <div className="block lg:hidden divide-y divide-nel-purple/20">
                {filteredDraws.map((draw) => (
                  <div key={draw.id} className="p-4 space-y-3 font-dm hover:bg-nel-purple/10 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-nel-pink text-sm bg-nel-input px-2.5 py-1 rounded-lg border border-nel-purple/40 inline-block mb-1">
                          {draw.ticketNumber}
                        </span>
                        <div className="font-semibold text-white text-base">
                          {draw.participantNickname || 'Trail Walker'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="px-2 py-0.5 rounded bg-nel-input text-xs font-mono font-bold text-nel-pink border border-nel-purple/40">
                          Site {draw.site}
                        </span>
                        <span className="text-[11px] text-white/50 font-mono">
                          {draw.drawnAt ? new Date(draw.drawnAt).toLocaleTimeString() : 'Recent'}
                        </span>
                      </div>
                    </div>

                    {/* Prize & Tier info */}
                    <div className="p-3 rounded-xl bg-nel-input/60 border border-nel-purple/40 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {getPrizeThumbnailUrl(draw) && (
                          <div className="w-10 h-10 rounded-xl bg-nel-purple/30 border border-nel-pink/30 p-1 shrink-0 flex items-center justify-center overflow-hidden shadow-inner">
                            <img
                              src={getPrizeThumbnailUrl(draw)}
                              alt={draw.prizeName}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-[10px] text-white/50 uppercase block font-semibold">Prize Won</span>
                          <span className="font-semibold text-white text-sm truncate block font-nel">
                            {draw.prizeName}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border shrink-0 ${
                          draw.prizeTier === 'TOP'
                            ? 'bg-nel-pink text-nel-violet border-white/30 font-nel font-semibold'
                            : 'bg-nel-purple/50 text-nel-pink border-nel-pink/40'
                        }`}
                      >
                        {draw.prizeTier}
                      </span>
                    </div>

                    {/* Status & Action */}
                    <div className="flex items-center justify-between pt-1 gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                          draw.status === 'claimed'
                            ? 'bg-nel-purple/60 border-nel-pink/50 text-nel-pink'
                            : 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                        }`}
                      >
                        {draw.status === 'claimed' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-nel-pink" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span className="capitalize">{draw.status}</span>
                      </span>

                      {draw.status === 'pending' ? (
                        <button
                          onClick={() => handleStatusChange(draw, 'claimed')}
                          disabled={processingId === draw.id}
                          className="px-4 py-2 min-h-[44px] rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-bold text-xs shadow transition cursor-pointer flex items-center justify-center"
                        >
                          <span>{processingId === draw.id ? 'Updating...' : 'Mark Claimed'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-white/50 font-medium">Claim Confirmed</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (Visible on lg screens and up) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-sm text-white/90">
                  <thead className="bg-[#140122] text-[11px] uppercase font-bold text-white/70 border-b border-nel-purple/40 font-dm">
                    <tr>
                      <th className="px-6 py-3.5">Ticket Code</th>
                      <th className="px-6 py-3.5">Participant</th>
                      <th className="px-6 py-3.5">Site</th>
                      <th className="px-6 py-3.5">Prize Won</th>
                      <th className="px-6 py-3.5">Tier</th>
                      <th className="px-6 py-3.5">Drawn At</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right">Checkpoint Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nel-purple/20">
                    {filteredDraws.map((draw) => (
                      <tr key={draw.id} className="hover:bg-nel-purple/15 transition font-dm">
                        <td className="px-6 py-4">
                          <span className="font-mono font-bold text-nel-pink text-sm bg-nel-input px-2.5 py-1 rounded-lg border border-nel-purple/40">
                            {draw.ticketNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-white">
                          {draw.participantNickname || 'Trail Walker'}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded bg-nel-input text-xs font-mono font-bold text-nel-pink border border-nel-purple/40">
                            {draw.site}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-semibold text-white font-nel">
                          <div className="flex items-center gap-2.5">
                            {getPrizeThumbnailUrl(draw) && (
                              <div className="w-8 h-8 rounded-lg bg-nel-purple/30 border border-nel-pink/30 p-0.5 shrink-0 flex items-center justify-center overflow-hidden shadow-inner">
                                <img
                                  src={getPrizeThumbnailUrl(draw)}
                                  alt={draw.prizeName}
                                  className="w-full h-full object-contain"
                                  onError={(e) => {
                                    (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <span className="truncate">{draw.prizeName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                              draw.prizeTier === 'TOP'
                                ? 'bg-nel-pink text-nel-violet border-white/30 font-nel font-semibold'
                                : 'bg-nel-purple/50 text-nel-pink border-nel-pink/40'
                            }`}
                          >
                            {draw.prizeTier}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-white/60 font-mono">
                          {draw.drawnAt ? new Date(draw.drawnAt).toLocaleTimeString() : 'Recent'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                              draw.status === 'claimed'
                                ? 'bg-nel-purple/60 border-nel-pink/50 text-nel-pink'
                                : 'bg-amber-950/70 border-amber-500/60 text-amber-300'
                            }`}
                          >
                            {draw.status === 'claimed' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-nel-pink" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            <span className="capitalize">{draw.status}</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {draw.status === 'pending' ? (
                            <button
                              onClick={() => handleStatusChange(draw, 'claimed')}
                              disabled={processingId === draw.id}
                              className="px-3 py-1.5 rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-bold text-xs shadow transition cursor-pointer"
                            >
                              Mark Claimed
                            </button>
                          ) : (
                            <span className="text-xs text-white/40 font-medium">Claimed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination & Cursor Navigation Toolbar */}
          <div className="p-4 sm:p-5 bg-nel-input/50 border-t border-nel-purple/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-dm">
            <div className="text-white/70">
              Showing <span className="font-mono text-nel-pink font-bold">{filteredDraws.length}</span> matching{' '}
              <span className="text-white/50">({draws.length} loaded from {totalDrawsCount > 0 ? totalDrawsCount : draws.length} total)</span>
            </div>

            <div className="flex items-center gap-2">
              {hasMore && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-4 py-2 min-h-[38px] rounded-xl bg-nel-purple hover:bg-[#340557] active:scale-98 text-nel-pink font-bold border border-nel-pink/40 shadow transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>Load Next 50 Draws</span>
                    </>
                  )}
                </button>
              )}

              {hasMore && draws.length < totalDrawsCount && (
                <button
                  type="button"
                  onClick={handleLoadAll}
                  disabled={isLoadingAll}
                  className="px-3.5 py-2 min-h-[38px] rounded-xl bg-nel-purple/30 hover:bg-slate-700 text-white/80 hover:text-white font-medium border border-nel-purple/50 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isLoadingAll ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading All...</span>
                    </>
                  ) : (
                    <span>Load All History</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Participants Container (Protected Administrator View) */
        <div className="bg-nel-surface border border-nel-purple/50 rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl">
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-nel-purple/40 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-nel-pink" />
              <span className="text-xs sm:text-sm font-nel font-semibold text-white uppercase tracking-wider">
                Protected Participant Directory ({filteredParticipants.length})
              </span>
            </div>
            <span className="text-xs text-nel-pink font-medium font-dm">
              PII Restricted • Admin Decrypted
            </span>
          </div>

          {filteredParticipants.length === 0 ? (
            <div className="p-8 sm:p-12 text-center text-white/60 text-xs font-dm">
              No participant registrations recorded yet.
            </div>
          ) : (
            <>
              {/* Mobile Participant Card View (block md:hidden) */}
              <div className="block md:hidden divide-y divide-nel-purple/20">
                {filteredParticipants.map((p) => (
                  <div key={p.id} className="p-4 space-y-2 font-dm hover:bg-nel-purple/10 transition">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white text-base">{p.nickname}</span>
                      <span className="px-2 py-0.5 rounded-lg bg-nel-input text-xs font-mono font-bold text-white border border-nel-purple/40">
                        Site {p.site}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <a
                        href={`tel:${p.mobileNumber}`}
                        className="font-mono text-nel-pink flex items-center gap-1.5 hover:underline min-h-[36px]"
                      >
                        <Phone className="w-3.5 h-3.5 text-white/50" />
                        <span>{p.mobileNumber}</span>
                      </a>
                      <span className="text-white/50 font-mono text-[11px]">
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Recent'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Participant Table (hidden md:block) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm text-white/90">
                  <thead className="bg-[#140122] text-[11px] uppercase font-bold text-white/70 border-b border-nel-purple/40 font-dm">
                    <tr>
                      <th className="px-6 py-3.5">Registered Nickname</th>
                      <th className="px-6 py-3.5">Singapore Mobile Number</th>
                      <th className="px-6 py-3.5">Registered Site</th>
                      <th className="px-6 py-3.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nel-purple/20">
                    {filteredParticipants.map((p) => (
                      <tr key={p.id} className="hover:bg-nel-purple/15 transition font-dm">
                        <td className="px-6 py-4 font-bold text-white text-base">{p.nickname}</td>
                        <td className="px-6 py-4 font-mono text-nel-pink flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-white/40" />
                          <span>{p.mobileNumber}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 rounded-lg bg-nel-input text-xs font-mono font-bold text-white border border-nel-purple/40">
                            Site {p.site}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-white/60 font-mono">
                          {p.createdAt ? new Date(p.createdAt).toLocaleString() : 'Recent'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </AdminLayout>
  );
};
