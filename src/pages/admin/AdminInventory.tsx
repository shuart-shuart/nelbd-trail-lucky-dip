import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus,
  Gift,
  Trash2,
  Edit2,
  Check,
  X,
  History as HistoryIcon,
  MapPin,
  TrendingUp,
  Upload,
  Download,
  Copy,
  AlertTriangle,
  Search,
  CheckCircle2,
  SlidersHorizontal,
  Trophy,
  ArrowRight,
  ShieldAlert,
  PowerOff,
  Power,
  RotateCcw,
  Image as ImageIcon,
} from 'lucide-react';
import { processPngUpload } from '../../utils/imageUpload';
import { AdminLayout } from '../../components/admin/AdminLayout';
import {
  subscribeToPrizesWithInventory,
  subscribeToInventoryAdjustments,
  createPrizeWithInventories,
  updatePrize,
  deletePrize,
  updateSiteInventoryQuantity,
  updatePrizeStartingQuantities,
} from '../../firebase/firestoreService';
import {
  PrizeWithInventory,
  PrizeTier,
  SiteLocation,
  AdjustmentReason,
  InventoryAdjustment,
} from '../../firebase/types';
import { useAuth } from '../../context/AuthContext';

interface ParsedCsvItem {
  rowNumber: number;
  prize_name: string;
  tier: PrizeTier;
  pdd_quantity: number;
  ps_quantity: number;
  total_quantity: number;
  active: boolean;
  isValid: boolean;
  error?: string;
  matchedPrizeId?: string;
  matchedPrizeName?: string;
  matchedHasDrawHistory?: boolean;
}

export const AdminInventory: React.FC = () => {
  const { user } = useAuth();
  const [prizes, setPrizes] = useState<PrizeWithInventory[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'adjustments'>('inventory');

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | PrizeTier>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Notification Banner
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Add Prize Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addTier, setAddTier] = useState<PrizeTier>('STANDARD');
  const [addPddStarting, setAddPddStarting] = useState<number>(50);
  const [addPsStarting, setAddPsStarting] = useState<number>(50);
  const [addIsActive, setAddIsActive] = useState(true);
  const [addImageUrl, setAddImageUrl] = useState<string>('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Edit Prize Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPrize, setEditingPrize] = useState<PrizeWithInventory | null>(null);
  const [editName, setEditName] = useState('');
  const [editTier, setEditTier] = useState<PrizeTier>('STANDARD');
  const [editPddStarting, setEditPddStarting] = useState<number>(0);
  const [editPsStarting, setEditPsStarting] = useState<number>(0);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editImageUrl, setEditImageUrl] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingFromEdit, setIsDeletingFromEdit] = useState(false);

  // Direct PNG upload state for table/card quick actions
  const [isUploadingImageFor, setIsUploadingImageFor] = useState<string | null>(null);

  // Stock Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustingPrize, setAdjustingPrize] = useState<PrizeWithInventory | null>(null);
  const [adjustSite, setAdjustSite] = useState<SiteLocation>('PDD');
  const [adjustmentValue, setAdjustmentValue] = useState<string>('0');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState(false);

  // CSV Import State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [parsedCsvItems, setParsedCsvItems] = useState<ParsedCsvItem[]>([]);
  const [csvMatchAction, setCsvMatchAction] = useState<'update' | 'skip' | 'cancel'>('update');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audit Tab Filters
  const [auditSiteFilter, setAuditSiteFilter] = useState<'ALL' | SiteLocation>('ALL');
  const [auditReasonFilter, setAuditReasonFilter] = useState<'ALL' | AdjustmentReason>('ALL');
  const [auditSearch, setAuditSearch] = useState('');

  // Subscriptions
  useEffect(() => {
    const unsubPrizes = subscribeToPrizesWithInventory(setPrizes);
    const unsubAdj = subscribeToInventoryAdjustments(setAdjustments);

    return () => {
      unsubPrizes();
      unsubAdj();
    };
  }, []);

  // History counts per prize (determines whether a prize can be permanently deleted vs deactivated)
  // Stage 3 Optimization: Derived directly from real-time site inventory metadata (claimedQuantity)
  // and audit adjustments (reason: 'draw') without downloading the unbounded draws collection.
  const drawCountsByPrize = useMemo(() => {
    const counts: Record<string, number> = {};

    // 1. Primary source: claimedQuantity tracked in real-time site inventories
    prizes.forEach((p) => {
      const pddClaimed = Number(p.pddInventory?.claimedQuantity) || 0;
      const psClaimed = Number(p.psInventory?.claimedQuantity) || 0;
      const totalClaimed = Number(p.totalClaimed) || (pddClaimed + psClaimed);
      counts[p.id] = Math.max(totalClaimed, pddClaimed + psClaimed);
    });

    // 2. Corroborating source: audit adjustments with reason === 'draw'
    const drawAdjCount: Record<string, number> = {};
    adjustments.forEach((a) => {
      if (a.prizeId && a.reason === 'draw') {
        drawAdjCount[a.prizeId] = (drawAdjCount[a.prizeId] || 0) + 1;
      }
    });

    Object.entries(drawAdjCount).forEach(([prizeId, count]) => {
      counts[prizeId] = Math.max(counts[prizeId] || 0, count);
    });

    return counts;
  }, [prizes, adjustments]);

  const adjustmentCountsByPrize = useMemo(() => {
    const counts: Record<string, number> = {};
    adjustments.forEach((a) => {
      if (a.prizeId) {
        counts[a.prizeId] = (counts[a.prizeId] || 0) + 1;
      }
    });
    return counts;
  }, [adjustments]);

  // Active TOP prize check helper: Only one active TOP prize type can exist across the entire festival
  const countActiveTopPrizes = (list: PrizeWithInventory[], excludePrizeId?: string): number => {
    return list.filter((p) => p.tier === 'TOP' && p.isActive && p.id !== excludePrizeId).length;
  };

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMessage({ text, type });
    setTimeout(() => {
      setFeedbackMessage(null);
    }, 5000);
  };

  // -------------------------------------------------------------
  // INVENTORY SUMMARY CALCULATIONS
  // -------------------------------------------------------------
  // TOTAL INVENTORY
  const totalStartingQuantity = prizes.reduce(
    (sum, p) => sum + p.pddInventory.allocatedQuantity + p.psInventory.allocatedQuantity,
    0
  );
  const totalRemainingQuantity = prizes.reduce(
    (sum, p) => sum + p.pddInventory.remainingQuantity + p.psInventory.remainingQuantity,
    0
  );

  // PDD
  const pddStartingQuantity = prizes.reduce(
    (sum, p) => sum + p.pddInventory.allocatedQuantity,
    0
  );
  const pddRemainingQuantity = prizes.reduce(
    (sum, p) => sum + p.pddInventory.remainingQuantity,
    0
  );

  // PS
  const psStartingQuantity = prizes.reduce(
    (sum, p) => sum + p.psInventory.allocatedQuantity,
    0
  );
  const psRemainingQuantity = prizes.reduce(
    (sum, p) => sum + p.psInventory.remainingQuantity,
    0
  );

  // TOP PRIZE (Calculated for TOP tier prizes)
  const topPrizes = prizes.filter((p) => p.tier === 'TOP');
  const topStartingQuantity = topPrizes.reduce(
    (sum, p) => sum + p.pddInventory.allocatedQuantity + p.psInventory.allocatedQuantity,
    0
  );
  const topRemainingQuantity = topPrizes.reduce(
    (sum, p) => sum + p.pddInventory.remainingQuantity + p.psInventory.remainingQuantity,
    0
  );

  // Filtered Prizes Table
  const filteredPrizes = prizes.filter((prize) => {
    const q = (searchQuery || '').toLowerCase();
    const nameMatch = (prize?.name || '').toLowerCase().includes(q);
    const descMatch = (prize?.description || '').toLowerCase().includes(q);
    const matchQuery = nameMatch || descMatch;
    const matchTier = tierFilter === 'ALL' || prize.tier === tierFilter;
    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && prize.isActive) ||
      (statusFilter === 'INACTIVE' && !prize.isActive);
    return matchQuery && matchTier && matchStatus;
  });

  // Filtered Audit Adjustments Table
  const filteredAdjustments = adjustments.filter((adj) => {
    const q = (auditSearch || '').toLowerCase();
    const matchSearch =
      (adj?.prizeName || '').toLowerCase().includes(q) ||
      (adj?.adjustedByEmail || '').toLowerCase().includes(q);
    const matchSite = auditSiteFilter === 'ALL' || adj.site === auditSiteFilter;
    const matchReason = auditReasonFilter === 'ALL' || adj.reason === auditReasonFilter;
    return matchSearch && matchSite && matchReason;
  });

  // -------------------------------------------------------------
  // DIRECT IMAGE UPLOAD HANDLER
  // -------------------------------------------------------------
  const handleDirectImageUpload = async (prize: PrizeWithInventory, file: File) => {
    setIsUploadingImageFor(prize.id);
    try {
      const dataUrl = await processPngUpload(file);
      await updatePrize(prize.id, { imageUrl: dataUrl });
      showNotification(`PNG image saved for "${prize.name}".`);
    } catch (err: any) {
      showNotification(err?.message || 'Failed to process PNG image.', 'error');
    } finally {
      setIsUploadingImageFor(null);
    }
  };

  // -------------------------------------------------------------
  // ADD PRIZE HANDLER
  // -------------------------------------------------------------
  const handleOpenAdd = () => {
    setAddName('');
    setAddTier('STANDARD');
    setAddPddStarting(50);
    setAddPsStarting(50);
    setAddIsActive(true);
    setAddImageUrl('');
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const handleSaveAddPrize = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const name = addName.trim();
    if (!name) {
      setAddError('Prize Name is required.');
      return;
    }

    if (addPddStarting < 0 || addPsStarting < 0) {
      setAddError('Starting quantities cannot be negative.');
      return;
    }

    // Rule: "Do not permit a second active TOP prize type."
    if (addTier === 'TOP' && addIsActive) {
      if (countActiveTopPrizes(prizes) >= 1) {
        setAddError('Only one Top Prize type can be active.');
        return;
      }
    }

    setIsSubmittingAdd(true);
    try {
      await createPrizeWithInventories({
        name,
        description: `${name} (${addTier} tier)`,
        tier: addTier,
        isActive: addIsActive,
        imageUrl: addImageUrl,
        pddAllocated: Number(addPddStarting) || 0,
        psAllocated: Number(addPsStarting) || 0,
        adminEmail: user?.email || 'admin',
      });
      showNotification(`Created prize "${name}" successfully.`);
      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setAddError(err?.message || 'Failed to create prize.');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // -------------------------------------------------------------
  // EDIT PRIZE HANDLER
  // -------------------------------------------------------------
  const handleOpenEdit = (prize: PrizeWithInventory) => {
    setEditingPrize(prize);
    setEditName(prize.name);
    setEditTier(prize.tier);
    setEditPddStarting(prize.pddInventory.allocatedQuantity);
    setEditPsStarting(prize.psInventory.allocatedQuantity);
    setEditIsActive(prize.isActive);
    setEditImageUrl(prize.imageUrl || '');
    setEditError(null);
    setShowDeleteConfirm(false);
    setIsDeletingFromEdit(false);
    setIsEditModalOpen(true);
  };

  const handleSaveEditPrize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrize) return;
    setEditError(null);

    const name = editName.trim();
    if (!name) {
      setEditError('Prize Name is required.');
      return;
    }

    // Rule: "Tier can be edited, but if changing a STANDARD prize to TOP would result in more than one TOP prize type, block the change and show: 'Only one Top Prize type can be active.'"
    if (editTier === 'TOP' && editIsActive) {
      if (countActiveTopPrizes(prizes, editingPrize.id) >= 1) {
        setEditError('Only one Top Prize type can be active.');
        return;
      }
    }

    const hasDrawHistory = (drawCountsByPrize[editingPrize.id] || 0) > 0;

    setIsSubmittingEdit(true);
    try {
      // Update prize metadata
      await updatePrize(editingPrize.id, {
        name,
        tier: editTier,
        isActive: editIsActive,
        imageUrl: editImageUrl,
      });

      // Update starting quantities only if NO draws have been recorded
      if (!hasDrawHistory) {
        if (editPddStarting < 0 || editPsStarting < 0) {
          setEditError('Starting quantities cannot be negative.');
          setIsSubmittingEdit(false);
          return;
        }

        await updatePrizeStartingQuantities({
          prizeId: editingPrize.id,
          pddStarting: Number(editPddStarting) || 0,
          psStarting: Number(editPsStarting) || 0,
          updateRemaining: true,
        });
      }

      showNotification(`Updated "${name}" successfully.`);
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setEditError(err?.message || 'Failed to update prize.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleConfirmDeleteFromEdit = async () => {
    if (!editingPrize) return;
    setIsDeletingFromEdit(true);
    setEditError(null);

    try {
      await deletePrize(editingPrize.id);
      showNotification(
        `Inventory item "${editingPrize.name}" and all associated site inventories have been completely removed.`,
        'success'
      );
      setShowDeleteConfirm(false);
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setEditError(err?.message || 'Failed to delete inventory item.');
    } finally {
      setIsDeletingFromEdit(false);
    }
  };

  // -------------------------------------------------------------
  // ADJUST STOCK HANDLER
  // -------------------------------------------------------------
  const handleOpenAdjust = (prize: PrizeWithInventory, site: SiteLocation = 'PDD') => {
    setAdjustingPrize(prize);
    setAdjustSite(site);
    setAdjustmentValue('0');
    setAdjustReason('');
    setAdjustError(null);
    setIsAdjustModalOpen(true);
  };

  const currentRemainingForAdjust = useMemo(() => {
    if (!adjustingPrize) return 0;
    return adjustSite === 'PDD'
      ? adjustingPrize.pddInventory.remainingQuantity
      : adjustingPrize.psInventory.remainingQuantity;
  }, [adjustingPrize, adjustSite]);

  const parsedAdjustment = parseInt(adjustmentValue) || 0;
  const calculatedNewRemaining = currentRemainingForAdjust + parsedAdjustment;

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingPrize) return;
    setAdjustError(null);

    const reason = adjustReason.trim();
    if (!reason) {
      setAdjustError('Reason is required for auditing inventory adjustments.');
      return;
    }

    if (parsedAdjustment === 0) {
      setAdjustError('Please specify a non-zero adjustment quantity (e.g. +20 or -5).');
      return;
    }

    // Rule: "Do not allow an adjustment that would cause remaining inventory to fall below zero."
    if (calculatedNewRemaining < 0) {
      setAdjustError(
        `Adjustment would cause remaining inventory to fall below zero (New remaining: ${calculatedNewRemaining}). Maximum deduction allowed is -${currentRemainingForAdjust}.`
      );
      return;
    }

    setIsSubmittingAdjustment(true);
    try {
      await updateSiteInventoryQuantity({
        prizeId: adjustingPrize.id,
        prizeName: adjustingPrize.name,
        site: adjustSite,
        newRemaining: calculatedNewRemaining,
        reason: 'manual_adjustment',
        adminEmail: user?.email || 'admin',
        adminId: user?.uid || 'admin',
      });

      showNotification(
        `Stock adjusted for "${adjustingPrize.name}" at Station ${adjustSite} (${parsedAdjustment > 0 ? `+${parsedAdjustment}` : parsedAdjustment} units).`
      );
      setIsAdjustModalOpen(false);
    } catch (err: any) {
      console.error(err);
      setAdjustError(err?.message || 'Failed to record stock adjustment.');
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  // -------------------------------------------------------------
  // DELETE / DEACTIVATE HANDLER
  // -------------------------------------------------------------
  const handleToggleActive = async (prize: PrizeWithInventory) => {
    const nextActive = !prize.isActive;

    // Check TOP prize rule when activating
    if (nextActive && prize.tier === 'TOP') {
      if (countActiveTopPrizes(prizes, prize.id) >= 1) {
        showNotification('Only one Top Prize type can be active.', 'error');
        return;
      }
    }

    try {
      await updatePrize(prize.id, { isActive: nextActive });
      showNotification(
        `"${prize.name}" is now ${nextActive ? 'Active in lucky dip pool' : 'Deactivated'}.`
      );
    } catch (err: any) {
      showNotification('Failed to toggle active status.', 'error');
    }
  };

  const handleDeletePrize = async (prize: PrizeWithInventory) => {
    const drawCount = drawCountsByPrize[prize.id] || 0;
    const adjCount = adjustmentCountsByPrize[prize.id] || 0;

    // Rule: "Do not permanently delete prizes that have existing draws or inventory adjustment history. For those prizes, provide 'Deactivate' instead."
    if (drawCount > 0 || adjCount > 0) {
      showNotification(
        `Cannot delete "${prize.name}" because it has existing draw (${drawCount}) or adjustment (${adjCount}) history. Deactivate it instead.`,
        'error'
      );
      return;
    }

    // Rule: "A prize with no transaction history may be permanently deleted after a confirmation dialog."
    if (
      window.confirm(
        `Permanently delete "${prize.name}"? This prize has no draw or adjustment history and will be removed completely.`
      )
    ) {
      try {
        await deletePrize(prize.id);
        showNotification(`Permanently deleted "${prize.name}".`);
      } catch (err) {
        showNotification('Failed to delete prize.', 'error');
      }
    }
  };

  // -------------------------------------------------------------
  // CSV IMPORT HANDLER
  // -------------------------------------------------------------
  const parseCsvText = (text: string) => {
    setCsvRawText(text);
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      setParsedCsvItems([]);
      return;
    }

    // Required CSV format: prize_name,tier,pdd_quantity,ps_quantity,active
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(',').map((h) => h.trim().replace(/['"]/g, ''));

    const nameIdx = headers.findIndex((h) => h.includes('prize_name') || h.includes('name'));
    const tierIdx = headers.findIndex((h) => h.includes('tier'));
    const pddIdx = headers.findIndex((h) => h.includes('pdd_quantity') || h.includes('pdd'));
    const psIdx = headers.findIndex((h) => h.includes('ps_quantity') || h.includes('ps'));
    const activeIdx = headers.findIndex((h) => h.includes('active'));

    const items: ParsedCsvItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const rawCols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const cols = rawCols.map((c) => c.trim().replace(/^"|"$/g, ''));

      const prizeName = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : cols[0] || '';
      const rawTier = (tierIdx !== -1 && cols[tierIdx] ? cols[tierIdx] : cols[1] || '').toUpperCase();
      const tier: PrizeTier = rawTier.includes('TOP') ? 'TOP' : 'STANDARD';

      const pddQty = parseInt(pddIdx !== -1 ? cols[pddIdx] : cols[2] || '0');
      const psQty = parseInt(psIdx !== -1 ? cols[psIdx] : cols[3] || '0');

      const rawActive = (activeIdx !== -1 ? cols[activeIdx] : cols[4] || 'true').toLowerCase();
      const active = !rawActive.includes('false') && !rawActive.includes('0') && !rawActive.includes('no');

      // Validation
      let isValid = true;
      let error: string | undefined;

      if (!prizeName.trim()) {
        isValid = false;
        error = 'Missing prize_name';
      } else if (isNaN(pddQty) || pddQty < 0) {
        isValid = false;
        error = 'Invalid pdd_quantity (must be non-negative integer)';
      } else if (isNaN(psQty) || psQty < 0) {
        isValid = false;
        error = 'Invalid ps_quantity (must be non-negative integer)';
      }

      // Check match with existing prize
      const matched = prizes.find(
        (p) => p.name.trim().toLowerCase() === prizeName.trim().toLowerCase()
      );

      const matchedHasDrawHistory = matched
        ? (drawCountsByPrize[matched.id] || 0) > 0
        : false;

      items.push({
        rowNumber: i + 1,
        prize_name: prizeName.trim(),
        tier,
        pdd_quantity: isNaN(pddQty) || pddQty < 0 ? 0 : pddQty,
        ps_quantity: isNaN(psQty) || psQty < 0 ? 0 : psQty,
        total_quantity: (isNaN(pddQty) || pddQty < 0 ? 0 : pddQty) + (isNaN(psQty) || psQty < 0 ? 0 : psQty),
        active,
        isValid,
        error,
        matchedPrizeId: matched?.id,
        matchedPrizeName: matched?.name,
        matchedHasDrawHistory,
      });
    }

    // TOP Prize validation: only one active TOP prize type permitted
    const activeTopInCsv = items.filter((item) => item.isValid && item.tier === 'TOP' && item.active);
    if (activeTopInCsv.length > 1) {
      activeTopInCsv.forEach((item, index) => {
        if (index > 0) {
          item.isValid = false;
          item.error = 'Only one Top Prize type can be active.';
        }
      });
    }

    setParsedCsvItems(items);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        parseCsvText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadCsvTemplate = () => {
    const sample = `prize_name,tier,pdd_quantity,ps_quantity,active
Garmin Forerunner 55 Trail GPS Watch,TOP,12,11,true
NELBD Trail 2026 Commemorative Enamel Pin,STANDARD,400,400,true
Heavyweight Organic Cotton Trail Map Tote Bag,STANDARD,250,250,true
Waterproof Trail Flora & Wildlife Holographic Stickers,STANDARD,350,350,true
Checkpoint Artisan Cold Brew & Pastry Voucher,STANDARD,200,200,true
Trail Explorer Carabiner Compass & Safety Whistle,STANDARD,38,39,true`;

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'nelbd_inventory_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExecuteCsvImport = async () => {
    const validItems = parsedCsvItems.filter((i) => i.isValid);
    if (validItems.length === 0) return;

    if (csvMatchAction === 'cancel') {
      setIsCsvModalOpen(false);
      return;
    }

    setIsImporting(true);
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    try {
      for (const item of validItems) {
        if (item.matchedPrizeId) {
          if (csvMatchAction === 'skip') {
            skippedCount++;
            continue;
          }

          // Rule: "Any inventory change to a prize with existing draw history must use the stock-adjustment system rather than rewriting remaining inventory."
          if (item.matchedHasDrawHistory) {
            // Find existing site inventories
            const existing = prizes.find((p) => p.id === item.matchedPrizeId);
            if (existing) {
              const currentPddRem = existing.pddInventory.remainingQuantity;
              const currentPsRem = existing.psInventory.remainingQuantity;

              if (item.pdd_quantity !== existing.pddInventory.allocatedQuantity) {
                const pddDelta = item.pdd_quantity - existing.pddInventory.allocatedQuantity;
                const newPddRem = Math.max(0, currentPddRem + pddDelta);
                await updateSiteInventoryQuantity({
                  prizeId: existing.id,
                  prizeName: existing.name,
                  site: 'PDD',
                  newAllocated: item.pdd_quantity,
                  newRemaining: newPddRem,
                  reason: 'manual_adjustment',
                  adminEmail: user?.email || 'admin',
                  adminId: user?.uid || 'admin',
                });
              }

              if (item.ps_quantity !== existing.psInventory.allocatedQuantity) {
                const psDelta = item.ps_quantity - existing.psInventory.allocatedQuantity;
                const newPsRem = Math.max(0, currentPsRem + psDelta);
                await updateSiteInventoryQuantity({
                  prizeId: existing.id,
                  prizeName: existing.name,
                  site: 'PS',
                  newAllocated: item.ps_quantity,
                  newRemaining: newPsRem,
                  reason: 'manual_adjustment',
                  adminEmail: user?.email || 'admin',
                  adminId: user?.uid || 'admin',
                });
              }

              await updatePrize(existing.id, {
                tier: item.tier,
                isActive: item.active,
              });
              updatedCount++;
            }
          } else {
            // No draw history: safely update starting & remaining quantities
            await updatePrize(item.matchedPrizeId, {
              tier: item.tier,
              isActive: item.active,
            });
            await updatePrizeStartingQuantities({
              prizeId: item.matchedPrizeId,
              pddStarting: item.pdd_quantity,
              psStarting: item.ps_quantity,
              updateRemaining: true,
            });
            updatedCount++;
          }
        } else {
          // Brand new prize
          await createPrizeWithInventories({
            name: item.prize_name,
            description: `${item.prize_name} (${item.tier} tier)`,
            tier: item.tier,
            isActive: item.active,
            pddAllocated: item.pdd_quantity,
            psAllocated: item.ps_quantity,
            adminEmail: user?.email || 'admin',
          });
          createdCount++;
        }
      }

      showNotification(
        `Import completed: ${createdCount} created, ${updatedCount} updated${
          skippedCount > 0 ? `, ${skippedCount} skipped` : ''
        }.`
      );
      setIsCsvModalOpen(false);
      setParsedCsvItems([]);
      setCsvRawText('');
    } catch (err: any) {
      console.error(err);
      showNotification('CSV Import failed to complete.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  // CSV Preview metrics
  const csvTotalPdd = parsedCsvItems.reduce((acc, curr) => acc + (curr.isValid ? curr.pdd_quantity : 0), 0);
  const csvTotalPs = parsedCsvItems.reduce((acc, curr) => acc + (curr.isValid ? curr.ps_quantity : 0), 0);
  const csvCombinedTotal = csvTotalPdd + csvTotalPs;
  const csvTopUnits = parsedCsvItems
    .filter((i) => i.isValid && i.tier === 'TOP')
    .reduce((acc, curr) => acc + curr.total_quantity, 0);
  const csvValidationErrors = parsedCsvItems.filter((i) => !i.isValid);
  const csvMatchedPrizesCount = parsedCsvItems.filter((i) => Boolean(i.matchedPrizeId)).length;

  return (
    <AdminLayout
      title="Inventory Management"
      subtitle="Direct inventory control, starting and remaining tracking for PDD & PS stations."
      actions={
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* CSV Import */}
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 active:scale-98 text-[#33224B] text-xs font-bold flex items-center justify-center gap-1.5 border border-[#E8DEF1] transition shadow cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#8649AC]" />
            <span>CSV Import</span>
          </button>

          {/* + Add Prize */}
          <button
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-initial px-4 py-2 min-h-[44px] rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-nel font-semibold text-xs flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Prize</span>
          </button>
        </div>
      }
    >
      {/* Toast Notification Banner */}
      {feedbackMessage && (
        <div
          className={`mb-6 p-4 rounded-2xl border text-xs font-semibold flex items-center gap-2 shadow-sm transition ${
            feedbackMessage.type === 'error'
              ? 'bg-red-950/80 border-red-500 text-red-200'
              : 'bg-[#F0E8F9]/80 border-nel-pink text-emerald-200'
          }`}
        >
          {feedbackMessage.type === 'error' ? (
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-[#8649AC] shrink-0" />
          )}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* INVENTORY SUMMARY CARDS ABOVE TABLE */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* TOTAL INVENTORY */}
        <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase text-[#8A7C96] mb-1.5 sm:mb-2 truncate">
            <span className="flex items-center gap-1 sm:gap-1.5 truncate">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8649AC] shrink-0" />
              <span className="truncate">TOTAL INVENTORY</span>
            </span>
          </div>
          <div className="space-y-0.5 sm:space-y-1 mt-1 sm:mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Starting:</span>
              <span className="text-base sm:text-xl font-mono font-bold text-[#33224B]">
                {totalStartingQuantity}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Remaining:</span>
              <span className="text-xl sm:text-2xl font-mono font-black text-[#8649AC]">
                {totalRemainingQuantity}
              </span>
            </div>
          </div>
        </div>

        {/* PDD */}
        <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase text-[#8A7C96] mb-1.5 sm:mb-2">
            <span className="flex items-center gap-1 sm:gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#8649AC] shrink-0" />
              <span>PDD</span>
            </span>
            <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-[#F1EAF9] text-[#8649AC] font-mono">
              Site PDD
            </span>
          </div>
          <div className="space-y-0.5 sm:space-y-1 mt-1 sm:mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Starting:</span>
              <span className="text-base sm:text-xl font-mono font-bold text-[#33224B]">{pddStartingQuantity}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Remaining:</span>
              <span className="text-xl sm:text-2xl font-mono font-black text-[#8649AC]">
                {pddRemainingQuantity}
              </span>
            </div>
          </div>
        </div>

        {/* PS */}
        <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase text-[#8A7C96] mb-1.5 sm:mb-2">
            <span className="flex items-center gap-1 sm:gap-1.5 truncate">
              <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-400 shrink-0" />
              <span>PS</span>
            </span>
            <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-[#F1EAF9] text-sky-300 font-mono">
              Site PS
            </span>
          </div>
          <div className="space-y-0.5 sm:space-y-1 mt-1 sm:mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Starting:</span>
              <span className="text-base sm:text-xl font-mono font-bold text-[#33224B]">{psStartingQuantity}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Remaining:</span>
              <span className="text-xl sm:text-2xl font-mono font-black text-sky-300">
                {psRemainingQuantity}
              </span>
            </div>
          </div>
        </div>

        {/* TOP PRIZE */}
        <div className="bg-white border border-amber-900/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] sm:text-xs font-bold uppercase text-[#8A7C96] mb-1.5 sm:mb-2">
            <span className="flex items-center gap-1 sm:gap-1.5 truncate">
              <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
              <span>TOP PRIZE</span>
            </span>
            <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              {topPrizes.length} defined
            </span>
          </div>
          <div className="space-y-0.5 sm:space-y-1 mt-1 sm:mt-2">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Starting:</span>
              <span className="text-base sm:text-xl font-mono font-bold text-[#33224B]">{topStartingQuantity}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] sm:text-xs text-[#8A7C96]">Remaining:</span>
              <span className="text-xl sm:text-2xl font-mono font-black text-amber-400">
                {topRemainingQuantity}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs (Inventory Table vs Adjustments Audit Trail) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-nel-purple/40 pb-2">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-3.5 sm:px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'inventory'
              ? 'bg-emerald-500/20 text-[#8649AC] border border-nel-pink/40 shadow'
              : 'text-[#8A7C96] hover:text-[#33224B]'
          }`}
        >
          <Gift className="w-4 h-4 shrink-0" />
          <span>Inventory ({prizes.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('adjustments')}
          className={`px-3.5 sm:px-4 py-2 min-h-[44px] rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'adjustments'
              ? 'bg-emerald-500/20 text-[#8649AC] border border-nel-pink/40 shadow'
              : 'text-[#8A7C96] hover:text-[#33224B]'
          }`}
        >
          <HistoryIcon className="w-4 h-4 shrink-0" />
          <span>Adjustments Audit ({adjustments.length})</span>
        </button>
      </div>

      {activeTab === 'inventory' ? (
        <>
          {/* Search & Filter Toolbar */}
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 mb-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-sm">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#8A7C96] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search prize name or description..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-xs focus:border-nel-pink focus:outline-none placeholder-slate-500 font-medium min-h-[44px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center space-x-1 bg-nel-input p-1 rounded-xl border border-nel-purple/40 flex-1 sm:flex-initial justify-between sm:justify-start">
                <span className="text-[11px] font-bold text-[#8A7C96] px-2 uppercase">Tier:</span>
                {(['ALL', 'TOP', 'STANDARD'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setTierFilter(tier)}
                    className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial text-center ${
                      tierFilter === tier
                        ? tier === 'TOP'
                          ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                          : 'bg-emerald-500/20 text-[#8649AC] border border-nel-pink/50'
                        : 'text-[#8A7C96] hover:text-[#33224B]'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>

              <div className="flex items-center space-x-1 bg-nel-input p-1 rounded-xl border border-nel-purple/40 flex-1 sm:flex-initial justify-between sm:justify-start">
                <span className="text-[11px] font-bold text-[#8A7C96] px-2 uppercase">Status:</span>
                {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition cursor-pointer flex-1 sm:flex-initial text-center ${
                      statusFilter === status
                        ? 'bg-[#F1EAF9] text-[#33224B] border border-slate-600'
                        : 'text-[#8A7C96] hover:text-[#33224B]'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* INVENTORY PRESENTATION: DESKTOP TABLE & MOBILE CARD LIST */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-nel-purple/40 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#8649AC]" />
                <span className="text-xs font-bold text-[#33224B] uppercase tracking-wider">
                  Prize Inventory ({filteredPrizes.length} items)
                </span>
              </div>
              <span className="text-[11px] text-[#8A7C96]">
                Totals auto-calculated: PDD + PS
              </span>
            </div>

            {filteredPrizes.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <Gift className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-[#645574]">No prizes match criteria</h3>
                <p className="text-xs text-[#8A7C96] mt-1 mb-4">
                  Adjust filters or click "+ Add Prize" to create a new prize.
                </p>
                <button
                  onClick={handleOpenAdd}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-nel font-semibold text-xs shadow cursor-pointer"
                >
                  + Add Prize
                </button>
              </div>
            ) : (
              <>
                {/* 1. MOBILE RESPONSIVE CARD VIEW (Visible on mobile/tablet up to lg) */}
                <div className="block lg:hidden divide-y divide-nel-purple/20">
                  {filteredPrizes.map((prize) => {
                    const pddStart = prize.pddInventory.allocatedQuantity;
                    const pddRem = prize.pddInventory.remainingQuantity;
                    const psStart = prize.psInventory.allocatedQuantity;
                    const psRem = prize.psInventory.remainingQuantity;
                    const totalStart = pddStart + psStart;
                    const totalRem = pddRem + psRem;

                    const drawCount = drawCountsByPrize[prize.id] || 0;
                    const adjCount = adjustmentCountsByPrize[prize.id] || 0;
                    const hasHistory = drawCount > 0 || adjCount > 0;

                    return (
                      <div key={prize.id} className="p-4 space-y-3 hover:bg-nel-purple/10 transition">
                        {/* Header: Thumbnail + Title + Badges */}
                        <div className="flex items-start justify-between gap-3">
                          {/* Image Thumbnail with quick upload */}
                          <div className="relative shrink-0">
                            <input
                              type="file"
                              id={`mobile-prize-img-${prize.id}`}
                              accept=".png,image/png"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleDirectImageUpload(prize, f);
                              }}
                            />
                            <label
                              htmlFor={`mobile-prize-img-${prize.id}`}
                              className="w-14 h-14 rounded-2xl bg-nel-input border border-[#E8DEF1] hover:border-nel-pink/60 flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-inner p-1 transition"
                              title="Click to upload or replace PNG image"
                            >
                              {prize.imageUrl ? (
                                <img
                                  src={prize.imageUrl}
                                  alt={prize.name}
                                  className="w-full h-full object-contain"
                                />
                              ) : isUploadingImageFor === prize.id ? (
                                <span className="text-[10px] text-[#8649AC] animate-pulse">Saving...</span>
                              ) : (
                                <>
                                  <ImageIcon className="w-5 h-5 text-[#33224B]/40 mb-0.5" />
                                  <span className="text-[9px] font-bold text-[#8649AC]">+ PNG</span>
                                </>
                              )}
                            </label>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  prize.tier === 'TOP'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-emerald-500/20 text-[#8649AC] border-nel-pink/40'
                                }`}
                              >
                                {prize.tier === 'TOP' && <Trophy className="w-3 h-3 text-amber-400" />}
                                <span>{prize.tier}</span>
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                  prize.isActive
                                    ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                                    : 'bg-[#F0E8F9] border-nel-purple/60 text-[#33224B]/50'
                                }`}
                              >
                                {prize.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <h4 className="font-bold text-[#33224B] text-base leading-snug break-words font-sans">
                              {prize.name}
                            </h4>
                            {prize.description && (
                              <p className="text-xs text-[#8A7C96] line-clamp-2 mt-0.5 font-normal">
                                {prize.description}
                              </p>
                            )}
                          </div>

                          {/* Quick Active Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleActive(prize)}
                            className={`p-2 rounded-xl border transition min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer shrink-0 ${
                              prize.isActive
                                ? 'bg-emerald-950/40 border-emerald-600/60 text-emerald-300'
                                : 'bg-[#F1EAF9] border-[#E8DEF1] text-[#33224B]/40'
                            }`}
                            title={prize.isActive ? 'Active in pool (Tap to toggle)' : 'Inactive in pool (Tap to toggle)'}
                            aria-label={`Toggle active status for ${prize.name}`}
                          >
                            {prize.isActive ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </button>
                        </div>

                        {/* Total Remaining Banner */}
                        <div className="p-2.5 rounded-xl bg-nel-input/80 border border-[#E8DEF1] flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#756782]">Total Remaining:</span>
                          <div className="text-right">
                            <span className="text-xl font-mono font-black text-[#8649AC]">
                              {totalRem}
                            </span>
                            <span className="text-xs text-[#33224B]/50 font-mono ml-1.5">
                              / {totalStart} starting
                            </span>
                          </div>
                        </div>

                        {/* Site Breakdown micro-grid (PDD vs PS) */}
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          {/* PDD Station */}
                          <div className="p-2.5 rounded-xl bg-white border border-teal-500/30 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-bold text-[#8649AC] flex items-center gap-1 font-sans">
                                <MapPin className="w-3 h-3 text-[#8649AC]" />
                                <span>PDD Station</span>
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className="text-[11px] text-[#33224B]/50 font-sans">Rem / Start:</span>
                              <div>
                                <span className="font-black text-[#8649AC] text-base">{pddRem}</span>
                                <span className="text-[#33224B]/50 text-xs"> / {pddStart}</span>
                              </div>
                            </div>
                          </div>

                          {/* PS Station */}
                          <div className="p-2.5 rounded-xl bg-white border border-sky-500/30 flex flex-col justify-between">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-bold text-sky-300 flex items-center gap-1 font-sans">
                                <MapPin className="w-3 h-3 text-sky-400" />
                                <span>PS Station</span>
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between mt-1">
                              <span className="text-[11px] text-[#33224B]/50 font-sans">Rem / Start:</span>
                              <div>
                                <span className="font-black text-sky-300 text-base">{psRem}</span>
                                <span className="text-[#33224B]/50 text-xs"> / {psStart}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Mobile Actions Toolbar */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenAdjust(prize, 'PDD')}
                            className="flex-1 py-2.5 px-3 min-h-[44px] rounded-xl bg-nel-purple/50 hover:bg-slate-700 active:scale-98 text-[#8649AC] text-xs font-bold flex items-center justify-center gap-1.5 border border-[#E2CBF0] transition cursor-pointer"
                          >
                            <span>Adjust Stock</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEdit(prize)}
                            className="py-2.5 px-3.5 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 active:scale-98 text-[#33224B] text-xs font-semibold flex items-center justify-center gap-1.5 border border-[#E8DEF1] transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#8649AC]" />
                            <span>Edit</span>
                          </button>

                          {hasHistory ? (
                            <button
                              type="button"
                              onClick={() => handleToggleActive(prize)}
                              className={`p-2.5 min-h-[44px] min-w-[44px] rounded-xl border transition cursor-pointer flex items-center justify-center shrink-0 ${
                                prize.isActive
                                  ? 'bg-amber-950/40 border-amber-800/40 text-amber-300 hover:bg-amber-900/60'
                                  : 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300 hover:bg-emerald-900/60'
                              }`}
                              title={prize.isActive ? 'Deactivate prize' : 'Activate prize'}
                              aria-label={prize.isActive ? 'Deactivate' : 'Activate'}
                            >
                              {prize.isActive ? (
                                <PowerOff className="w-4 h-4" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDeletePrize(prize)}
                              className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-[#F1EAF9] hover:bg-red-950/60 hover:text-red-400 text-[#8A7C96] border border-[#E8DEF1] transition cursor-pointer flex items-center justify-center shrink-0"
                              title="Permanently Delete (No history)"
                              aria-label="Delete prize"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 2. DESKTOP FULL TABLE VIEW (Visible on lg screens and up) */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full text-left text-sm text-[#645574]">
                    <thead className="bg-nel-input/80 text-[11px] uppercase font-bold text-[#8A7C96] border-b border-nel-purple/40">
                      <tr>
                        <th className="px-5 py-3.5">Prize Name</th>
                        <th className="px-4 py-3.5">Tier</th>
                        <th className="px-4 py-3.5 text-center">PDD Starting</th>
                        <th className="px-4 py-3.5 text-center">PDD Remaining</th>
                        <th className="px-4 py-3.5 text-center">PS Starting</th>
                        <th className="px-4 py-3.5 text-center">PS Remaining</th>
                        <th className="px-4 py-3.5 text-center">Total Starting</th>
                        <th className="px-4 py-3.5 text-center">Total Remaining</th>
                        <th className="px-4 py-3.5 text-center">Active</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nel-purple/20/80 font-mono">
                      {filteredPrizes.map((prize) => {
                        const pddStart = prize.pddInventory.allocatedQuantity;
                        const pddRem = prize.pddInventory.remainingQuantity;
                        const psStart = prize.psInventory.allocatedQuantity;
                        const psRem = prize.psInventory.remainingQuantity;
                        const totalStart = pddStart + psStart;
                        const totalRem = pddRem + psRem;

                        const drawCount = drawCountsByPrize[prize.id] || 0;
                        const adjCount = adjustmentCountsByPrize[prize.id] || 0;
                        const hasHistory = drawCount > 0 || adjCount > 0;

                        return (
                          <tr key={prize.id} className="hover:bg-[#F1EAF9]/40 transition">
                            {/* Prize Image & Name */}
                            <td className="px-5 py-4 font-sans">
                              <div className="flex items-center gap-3">
                                {/* Direct PNG Upload Thumbnail */}
                                <div className="relative shrink-0">
                                  <input
                                    type="file"
                                    id={`desktop-prize-img-${prize.id}`}
                                    accept=".png,image/png"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleDirectImageUpload(prize, f);
                                    }}
                                  />
                                  <label
                                    htmlFor={`desktop-prize-img-${prize.id}`}
                                    className="w-12 h-12 rounded-xl bg-nel-input border border-[#E8DEF1] hover:border-nel-pink/60 flex flex-col items-center justify-center cursor-pointer overflow-hidden p-1 shadow-inner transition group"
                                    title="Click to upload or replace PNG image"
                                  >
                                    {prize.imageUrl ? (
                                      <img
                                        src={prize.imageUrl}
                                        alt={prize.name}
                                        className="w-full h-full object-contain group-hover:scale-105 transition"
                                      />
                                    ) : isUploadingImageFor === prize.id ? (
                                      <span className="text-[9px] text-[#8649AC] animate-pulse">Saving...</span>
                                    ) : (
                                      <>
                                        <ImageIcon className="w-4 h-4 text-[#33224B]/30 group-hover:text-[#8649AC] transition" />
                                        <span className="text-[8px] text-[#8649AC] font-bold mt-0.5">+ PNG</span>
                                      </>
                                    )}
                                  </label>
                                </div>

                                <div className="min-w-0">
                                  <div className="font-bold text-[#33224B] text-sm leading-snug">
                                    {prize.name}
                                  </div>
                                  {prize.description && (
                                    <div className="text-[11px] text-[#8A7C96] line-clamp-1 max-w-xs mt-0.5 font-normal">
                                      {prize.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Tier */}
                            <td className="px-4 py-4 font-sans">
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  prize.tier === 'TOP'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                    : 'bg-emerald-500/20 text-[#8649AC] border-nel-pink/40'
                                }`}
                              >
                                {prize.tier === 'TOP' && <Trophy className="w-3 h-3 text-amber-400" />}
                                <span>{prize.tier}</span>
                              </span>
                            </td>

                            {/* PDD Starting Quantity */}
                            <td className="px-4 py-4 text-center font-bold text-[#645574]">
                              {pddStart}
                            </td>

                            {/* PDD Remaining Quantity */}
                            <td className="px-4 py-4 text-center font-black text-[#8649AC]">
                              {pddRem}
                            </td>

                            {/* PS Starting Quantity */}
                            <td className="px-4 py-4 text-center font-bold text-[#645574]">
                              {psStart}
                            </td>

                            {/* PS Remaining Quantity */}
                            <td className="px-4 py-4 text-center font-black text-sky-300">
                              {psRem}
                            </td>

                            {/* Total Starting Quantity */}
                            <td className="px-4 py-4 text-center font-bold text-[#33224B] bg-nel-input/30">
                              {totalStart}
                            </td>

                            {/* Total Remaining Quantity */}
                            <td className="px-4 py-4 text-center font-black text-[#8649AC] bg-nel-input/30">
                              {totalRem}
                            </td>

                            {/* Active */}
                            <td className="px-4 py-4 text-center font-sans">
                              <button
                                onClick={() => handleToggleActive(prize)}
                                className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border inline-flex items-center gap-1 transition cursor-pointer ${
                                  prize.isActive
                                    ? 'bg-[#F0E8F9]/60 border-nel-pink/40/60 text-[#8649AC] hover:bg-emerald-900/60'
                                    : 'bg-[#F1EAF9] border-[#E8DEF1] text-[#8A7C96] hover:bg-slate-750'
                                }`}
                                title={prize.isActive ? 'Active in draw pool' : 'Inactive'}
                              >
                                {prize.isActive ? (
                                  <>
                                    <Check className="w-3 h-3 text-[#8649AC]" />
                                    <span>Active</span>
                                  </>
                                ) : (
                                  <>
                                    <X className="w-3 h-3 text-[#8A7C96]" />
                                    <span>Inactive</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-4 text-right font-sans">
                              <div className="flex items-center justify-end space-x-1.5">
                                {/* Edit Button */}
                                <button
                                  onClick={() => handleOpenEdit(prize)}
                                  className="px-2.5 py-1 rounded-lg bg-[#F1EAF9] hover:bg-slate-700 text-[#33224B] text-xs font-semibold flex items-center gap-1 border border-[#E8DEF1] transition cursor-pointer"
                                  title="Edit Prize"
                                >
                                  <Edit2 className="w-3 h-3 text-[#8649AC]" />
                                  <span>Edit</span>
                                </button>

                                {/* Adjust Stock Button */}
                                <button
                                  onClick={() => handleOpenAdjust(prize, 'PDD')}
                                  className="px-2.5 py-1 rounded-lg bg-[#F1EAF9] hover:bg-slate-700 text-[#8649AC] text-xs font-semibold flex items-center gap-1 border border-teal-500/20 transition cursor-pointer"
                                  title="Adjust Stock"
                                >
                                  <span>Adjust Stock</span>
                                </button>

                                {/* Delete / Deactivate Button */}
                                {hasHistory ? (
                                  <button
                                    onClick={() => handleToggleActive(prize)}
                                    className={`p-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                      prize.isActive
                                        ? 'bg-amber-950/40 border-amber-800/40 text-amber-300 hover:bg-amber-900/60'
                                        : 'bg-[#F0E8F9]/40 border-nel-pink/40/40 text-[#8649AC] hover:bg-emerald-900/60'
                                    }`}
                                    title={
                                      prize.isActive
                                        ? 'Deactivate (Prize has transaction history)'
                                        : 'Activate'
                                    }
                                  >
                                    {prize.isActive ? (
                                      <PowerOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Power className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeletePrize(prize)}
                                    className="p-1.5 rounded-lg bg-[#F1EAF9] hover:bg-red-950/60 hover:text-red-400 text-[#8A7C96] border border-[#E8DEF1] transition cursor-pointer"
                                    title="Permanently Delete (No history)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* Audit Trail Tab */
        <div className="space-y-4">
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between shadow-sm">
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#8A7C96] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search prize or admin email..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-xs focus:border-nel-pink focus:outline-none min-h-[44px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1 bg-nel-input p-1 rounded-xl border border-nel-purple/40 flex-1 sm:flex-initial">
                <span className="text-[11px] font-bold text-[#8A7C96] px-2 uppercase">Site:</span>
                {(['ALL', 'PDD', 'PS'] as const).map((site) => (
                  <button
                    key={site}
                    onClick={() => setAuditSiteFilter(site)}
                    className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-bold transition cursor-pointer flex-1 sm:flex-initial text-center ${
                      auditSiteFilter === site
                        ? 'bg-emerald-500/20 text-[#8649AC] border border-nel-pink/50'
                        : 'text-[#8A7C96] hover:text-[#33224B]'
                    }`}
                  >
                    {site}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center space-x-1 bg-nel-input p-1 rounded-xl border border-nel-purple/40 w-full sm:w-auto">
                <span className="text-[11px] font-bold text-[#8A7C96] px-2 uppercase">Reason:</span>
                {(['ALL', 'manual_adjustment', 'restock', 'draw', 'initial_stock'] as const).map(
                  (reason) => (
                    <button
                      key={reason}
                      onClick={() => setAuditReasonFilter(reason)}
                      className={`px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                        auditReasonFilter === reason
                          ? 'bg-[#F1EAF9] text-[#33224B] border border-slate-600'
                          : 'text-[#8A7C96] hover:text-[#33224B]'
                      }`}
                    >
                      {reason.replace('_', ' ')}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-nel-purple/40 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HistoryIcon className="w-4 h-4 text-[#8649AC]" />
                <span className="text-xs font-bold text-[#33224B] uppercase tracking-wider">
                  Audit Records ({filteredAdjustments.length})
                </span>
              </div>
              <span className="text-[11px] text-[#8A7C96]">
                Immutable adjustments
              </span>
            </div>

            {filteredAdjustments.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-[#8A7C96] text-xs">
                No audit adjustments found for the selected criteria.
              </div>
            ) : (
              <>
                {/* Mobile Audit Card View (block md:hidden) */}
                <div className="block md:hidden divide-y divide-nel-purple/20">
                  {filteredAdjustments.map((adj) => {
                    const deltaVal = adj.quantityChange ?? adj.delta ?? 0;
                    return (
                      <div key={adj.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-bold text-[#33224B] text-sm block">
                              {adj.prizeName}
                            </span>
                            <span className="text-[11px] text-[#33224B]/50 font-mono">
                              {adj.createdAt ? new Date(adj.createdAt).toLocaleString() : 'Recent'}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${
                              adj.site === 'PDD'
                                ? 'bg-teal-950 text-[#8649AC] border border-teal-800/40'
                                : 'bg-sky-950 text-sky-300 border border-sky-800/40'
                            }`}
                          >
                            Site {adj.site}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs font-mono bg-nel-input/60 p-2 rounded-xl">
                          <span className="text-[#8A7C96]">Stock Change:</span>
                          <div>
                            <span>{adj.previousQuantity}</span> →{' '}
                            <span className="text-[#33224B] font-bold">{adj.newQuantity}</span>{' '}
                            <span
                              className={`font-bold ${
                                deltaVal > 0
                                  ? 'text-[#8649AC]'
                                  : deltaVal < 0
                                  ? 'text-red-400'
                                  : 'text-[#8A7C96]'
                              }`}
                            >
                              ({deltaVal > 0 ? `+${deltaVal}` : deltaVal})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="px-2 py-0.5 rounded-full bg-[#F1EAF9] text-[#645574] border border-[#E8DEF1] capitalize">
                            {adj.reason.replace('_', ' ')}
                          </span>
                          <span className="text-[#33224B]/50 truncate max-w-[140px]">
                            {adj.adminId || adj.adjustedByAdminId || adj.adjustedByEmail || 'Admin'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Audit Table View (hidden md:block) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm text-[#645574]">
                    <thead className="bg-nel-input/80 text-[11px] uppercase font-bold text-[#8A7C96] border-b border-nel-purple/40">
                      <tr>
                        <th className="px-6 py-3.5">Timestamp</th>
                        <th className="px-6 py-3.5">Prize Name</th>
                        <th className="px-6 py-3.5">Site</th>
                        <th className="px-6 py-3.5">Stock Delta</th>
                        <th className="px-6 py-3.5">Reason</th>
                        <th className="px-6 py-3.5">Admin ID / User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nel-purple/20/80">
                      {filteredAdjustments.map((adj) => {
                        const deltaVal = adj.quantityChange ?? adj.delta ?? 0;
                        return (
                          <tr key={adj.id} className="hover:bg-[#F1EAF9]/40 transition">
                            <td className="px-6 py-3.5 text-xs text-[#8A7C96] font-mono">
                              {adj.createdAt ? new Date(adj.createdAt).toLocaleString() : 'Recent'}
                            </td>
                            <td className="px-6 py-3.5 font-bold text-[#33224B]">{adj.prizeName}</td>
                            <td className="px-6 py-3.5">
                              <span
                                className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                                  adj.site === 'PDD'
                                    ? 'bg-teal-950 text-[#8649AC]'
                                    : 'bg-sky-950 text-sky-300'
                                }`}
                              >
                                Site {adj.site}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 font-mono">
                              <span className="text-[#8A7C96]">{adj.previousQuantity}</span> →{' '}
                              <span className="text-[#33224B] font-bold">{adj.newQuantity}</span>{' '}
                              <span
                                className={`text-xs font-bold ${
                                  deltaVal > 0
                                    ? 'text-[#8649AC]'
                                    : deltaVal < 0
                                    ? 'text-red-400'
                                    : 'text-[#8A7C96]'
                                }`}
                              >
                                ({deltaVal > 0 ? `+${deltaVal}` : deltaVal})
                              </span>
                            </td>
                            <td className="px-6 py-3.5">
                              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#F1EAF9] text-[#645574] border border-[#E8DEF1] capitalize">
                                {adj.reason.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-3.5 text-xs text-[#8A7C96]">
                              {adj.adminId || adj.adjustedByAdminId || adj.adjustedByEmail || 'Admin'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: ADD PRIZE */}
      {/* ------------------------------------------------------------- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 text-[#8A7C96] hover:text-[#33224B] p-2 rounded-xl hover:bg-[#F1EAF9] transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close Add Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg sm:text-xl font-bold text-[#33224B] mb-1">+ Add New Prize</h3>
            <p className="text-xs text-[#8A7C96] mb-4 sm:mb-5">
              Create a prize item with initial PDD & PS starting allocations.
            </p>

            {addError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500 text-xs text-red-200 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAddPrize} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                  Prize Name *
                </label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Trail Hydration Flask"
                  className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm focus:border-nel-pink focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                    Tier *
                  </label>
                  <select
                    value={addTier}
                    onChange={(e) => setAddTier(e.target.value as PrizeTier)}
                    className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm focus:border-nel-pink focus:outline-none font-bold"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="TOP">TOP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                    Active Status
                  </label>
                  <label className="flex items-center space-x-2.5 min-h-[44px] px-3.5 rounded-xl bg-nel-input border border-[#E8DEF1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addIsActive}
                      onChange={(e) => setAddIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-nel-pink"
                    />
                    <span className="text-xs font-semibold text-[#33224B]">Active in Draw Pool</span>
                  </label>
                </div>
              </div>

              {/* Prize Image (PNG) Upload */}
              <div className="p-3.5 rounded-2xl bg-nel-input border border-nel-purple/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-[#645574] flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#8649AC]" />
                    <span>Prize Image (PNG)</span>
                  </label>
                  {addImageUrl && (
                    <button
                      type="button"
                      onClick={() => setAddImageUrl('')}
                      className="text-[11px] text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                    >
                      Remove Image
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Thumbnail Preview Box */}
                  <div className="w-16 h-16 rounded-xl bg-white border border-[#E8DEF1] flex items-center justify-center overflow-hidden shrink-0 relative shadow-inner">
                    {addImageUrl ? (
                      <img
                        src={addImageUrl}
                        alt="Preview"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-[#33224B]/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="file"
                      id="add-prize-image-input"
                      accept=".png,image/png"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const dataUrl = await processPngUpload(file);
                          setAddImageUrl(dataUrl);
                        } catch (err: any) {
                          setAddError(err?.message || 'Failed to process PNG');
                        }
                      }}
                    />
                    <label
                      htmlFor="add-prize-image-input"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F0E8F9] hover:bg-nel-purple/60 border border-nel-pink/40 text-xs font-semibold text-[#8649AC] cursor-pointer transition min-h-[40px]"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#8649AC]" />
                      <span>{addImageUrl ? 'Change PNG' : 'Upload PNG'}</span>
                    </label>
                    <p className="text-[11px] text-[#33224B]/50 mt-1 leading-tight">
                      Transparent PNG recommended. Appears above prize text on the lucky dip screen.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3.5 sm:p-4 rounded-2xl bg-nel-input border border-nel-purple/40 space-y-3">
                <div className="text-xs font-bold uppercase text-[#8649AC]">
                  Starting Quantities
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#645574] mb-1">
                      PDD Starting Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={addPddStarting}
                      onChange={(e) => setAddPddStarting(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-[#645574] mb-1">
                      PS Starting Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={addPsStarting}
                      onChange={(e) => setAddPsStarting(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="text-xs text-[#8A7C96] flex items-center justify-between pt-1 border-t border-nel-purple/40">
                  <span>Total Starting Quantity:</span>
                  <strong className="text-[#8649AC] font-mono text-sm">
                    {(Number(addPddStarting) || 0) + (Number(addPsStarting) || 0)} units
                  </strong>
                </div>
                <div className="text-xs text-[#8A7C96] flex items-center justify-between">
                  <span>Total Remaining Quantity:</span>
                  <strong className="text-[#8649AC] font-mono text-sm">
                    {(Number(addPddStarting) || 0) + (Number(addPsStarting) || 0)} units
                  </strong>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 text-[#645574] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdd}
                  className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-nel font-semibold text-xs shadow transition cursor-pointer flex items-center justify-center"
                >
                  {isSubmittingAdd ? 'Creating...' : 'Create Prize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: EDIT PRIZE */}
      {/* ------------------------------------------------------------- */}
      {isEditModalOpen && editingPrize && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 text-[#8A7C96] hover:text-[#33224B] p-2 rounded-xl hover:bg-[#F1EAF9] transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close Edit Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg sm:text-xl font-bold text-[#33224B] mb-1">Edit Prize</h3>
            <p className="text-xs text-[#8A7C96] mb-4 sm:mb-5">
              Update prize details and starting quantities.
            </p>

            {editError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500 text-xs text-red-200 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditPrize} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                  Prize Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm focus:border-nel-pink focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                    Tier *
                  </label>
                  <select
                    value={editTier}
                    onChange={(e) => setEditTier(e.target.value as PrizeTier)}
                    className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm focus:border-nel-pink focus:outline-none font-bold"
                  >
                    <option value="STANDARD">STANDARD</option>
                    <option value="TOP">TOP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                    Active / Inactive
                  </label>
                  <label className="flex items-center space-x-2.5 min-h-[44px] px-3.5 rounded-xl bg-nel-input border border-[#E8DEF1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editIsActive}
                      onChange={(e) => setEditIsActive(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-nel-pink"
                    />
                    <span className="text-xs font-semibold text-[#33224B]">Active in Draw Pool</span>
                  </label>
                </div>
              </div>

              {/* Prize Image (PNG) Upload */}
              <div className="p-3.5 rounded-2xl bg-nel-input border border-nel-purple/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase text-[#645574] flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-[#8649AC]" />
                    <span>Prize Image (PNG)</span>
                  </label>
                  {editImageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditImageUrl('')}
                      className="text-[11px] text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                    >
                      Remove Image
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Thumbnail Preview Box */}
                  <div className="w-16 h-16 rounded-xl bg-white border border-[#E8DEF1] flex items-center justify-center overflow-hidden shrink-0 relative shadow-inner">
                    {editImageUrl ? (
                      <img
                        src={editImageUrl}
                        alt="Preview"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-[#33224B]/30" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="file"
                      id="edit-prize-image-input"
                      accept=".png,image/png"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const dataUrl = await processPngUpload(file);
                          setEditImageUrl(dataUrl);
                        } catch (err: any) {
                          setEditError(err?.message || 'Failed to process PNG');
                        }
                      }}
                    />
                    <label
                      htmlFor="edit-prize-image-input"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F0E8F9] hover:bg-nel-purple/60 border border-nel-pink/40 text-xs font-semibold text-[#8649AC] cursor-pointer transition min-h-[40px]"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#8649AC]" />
                      <span>{editImageUrl ? 'Change PNG' : 'Upload PNG'}</span>
                    </label>
                    <p className="text-[11px] text-[#33224B]/50 mt-1 leading-tight">
                      Transparent PNG recommended. Appears above prize text on the lucky dip screen.
                    </p>
                  </div>
                </div>
              </div>

              {/* Starting Quantities Handling */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-nel-input border border-nel-purple/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-bold uppercase text-[#8649AC]">
                    Starting Quantities
                  </span>
                  {(drawCountsByPrize[editingPrize.id] || 0) > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                      Locked: Draw History Exists
                    </span>
                  )}
                </div>

                {(drawCountsByPrize[editingPrize.id] || 0) > 0 ? (
                  <div className="p-3 rounded-xl bg-white border border-nel-purple/40 text-xs text-[#645574] space-y-1">
                    <p className="font-semibold text-amber-300">
                      Draws have been recorded for this prize ({drawCountsByPrize[editingPrize.id]} draws).
                    </p>
                    <p className="text-[#8A7C96] text-[11px] leading-relaxed">
                      Starting quantities cannot be directly overwritten once draws have occurred. Use{' '}
                      <strong className="text-[#8649AC]">Adjust Stock</strong> to modify current physical inventory.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono">
                      <div>PDD Starting: {editPddStarting}</div>
                      <div>PS Starting: {editPsStarting}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[11px] text-[#8A7C96]">
                      Before any draws are recorded, starting quantities can be edited directly.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[#645574] mb-1">
                          PDD Starting Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editPddStarting}
                          onChange={(e) =>
                            setEditPddStarting(Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#645574] mb-1">
                          PS Starting Quantity
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editPsStarting}
                          onChange={(e) =>
                            setEditPsStarting(Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="w-full px-3 py-2 min-h-[44px] rounded-xl bg-white border border-[#E8DEF1] text-[#33224B] text-base sm:text-sm font-mono"
                        />
                      </div>
                    </div>
                    <div className="text-xs text-[#8A7C96] flex items-center justify-between pt-1">
                      <span>Total Starting Quantity:</span>
                      <strong className="text-[#8649AC] font-mono text-sm">
                        {(Number(editPddStarting) || 0) + (Number(editPsStarting) || 0)} units
                      </strong>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 text-[#645574] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="w-full sm:w-auto px-5 py-2.5 min-h-[44px] rounded-xl bg-nel-pink hover:brightness-105 active:scale-98 text-nel-violet font-nel font-semibold text-xs shadow transition cursor-pointer flex items-center justify-center"
                >
                  {isSubmittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>

            {/* Delete Function under Edit Window */}
            <div className="pt-4 sm:pt-5 mt-4 sm:mt-5 border-t border-nel-purple/40">
              {!showDeleteConfirm ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-red-950/20 border border-red-900/40">
                  <div className="text-left">
                    <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Inventory Item</span>
                    </div>
                    <div className="text-[11px] text-[#8A7C96] mt-0.5">
                      Permanently remove this prize and all associated site inventories.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full sm:w-auto px-3.5 py-2 min-h-[44px] rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 hover:text-[#33224B] text-xs font-bold border border-red-700/60 flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Item</span>
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-red-950/80 border-2 border-red-600 text-left space-y-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[#33224B] text-xs block">
                        Confirm Complete Removal
                      </span>
                      <p className="text-[11px] text-red-200 mt-1 leading-relaxed">
                        Are you sure you want to permanently delete <strong>"{editingPrize.name}"</strong>?
                        This removes the inventory item completely, including all PDD and PS station records. This action cannot be undone.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-red-800/60">
                    <button
                      type="button"
                      disabled={isDeletingFromEdit}
                      onClick={() => setShowDeleteConfirm(false)}
                      className="w-full sm:w-auto px-3.5 py-2 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 text-[#645574] text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isDeletingFromEdit}
                      onClick={handleConfirmDeleteFromEdit}
                      className="w-full sm:w-auto px-4 py-2 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 text-[#33224B] text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      {isDeletingFromEdit ? (
                        <span>Deleting Item...</span>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Yes, Delete Completely</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: ADJUST STOCK */}
      {/* ------------------------------------------------------------- */}
      {isAdjustModalOpen && adjustingPrize && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setIsAdjustModalOpen(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 text-[#8A7C96] hover:text-[#33224B] p-2 rounded-xl hover:bg-[#F1EAF9] transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close Adjust Stock Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg sm:text-xl font-bold text-[#33224B] mb-1">Adjust Stock</h3>
            <p className="text-xs text-[#8A7C96] mb-4">
              Modify physical remaining inventory for <strong className="text-[#8649AC]">{adjustingPrize.name}</strong>.
            </p>

            {adjustError && (
              <div className="mb-4 p-3 rounded-xl bg-red-950/80 border border-red-500 text-xs text-red-200 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{adjustError}</span>
              </div>
            )}

            <form onSubmit={handleSaveStockAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                  Site *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustSite('PDD')}
                    className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                      adjustSite === 'PDD'
                        ? 'bg-teal-500/20 text-[#8649AC] border-teal-500 shadow'
                        : 'bg-nel-input text-[#8A7C96] border-[#E8DEF1] hover:text-[#33224B]'
                    }`}
                  >
                    Station PDD
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustSite('PS')}
                    className={`py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-bold border transition cursor-pointer flex items-center justify-center ${
                      adjustSite === 'PS'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500 shadow'
                        : 'bg-nel-input text-[#8A7C96] border-[#E8DEF1] hover:text-[#33224B]'
                    }`}
                  >
                    Station PS
                  </button>
                </div>
              </div>

              {/* Adjustment Calculation Box */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-nel-input border border-nel-purple/40 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[#8A7C96]">Current Remaining:</span>
                  <span className="font-mono font-bold text-[#33224B] text-base">
                    {currentRemainingForAdjust} units
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#645574] mb-1">
                    Adjustment (+ / - integer) *
                  </label>
                  <input
                    type="number"
                    step="1"
                    required
                    value={adjustmentValue}
                    onChange={(e) => setAdjustmentValue(e.target.value)}
                    placeholder="e.g. 20 or -5"
                    className="w-full px-3.5 py-2.5 min-h-[48px] rounded-xl bg-white border border-[#E8DEF1] text-[#33224B] font-mono text-lg sm:text-base focus:border-teal-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-[#33224B]/40 mt-1 block">
                    Use positive number to add stock (+20), negative number to deduct (-5).
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pt-2 border-t border-nel-purple/40">
                  <span className="text-[#8A7C96] font-semibold">New Remaining:</span>
                  <span
                    className={`font-mono font-black text-lg ${
                      calculatedNewRemaining < 0
                        ? 'text-red-400'
                        : calculatedNewRemaining !== currentRemainingForAdjust
                        ? 'text-[#8649AC]'
                        : 'text-[#33224B]'
                    }`}
                  >
                    {calculatedNewRemaining} units
                  </span>
                </div>

                {calculatedNewRemaining < 0 && (
                  <p className="text-[11px] text-red-400 font-medium">
                    Remaining inventory cannot fall below zero.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-[#645574] mb-1.5">
                  Reason *
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Additional stock delivered from central store"
                  className="w-full px-4 py-2.5 min-h-[44px] rounded-xl bg-nel-input border border-[#E8DEF1] text-[#33224B] text-base sm:text-xs focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="text-[11px] text-[#8A7C96] bg-nel-input p-2.5 rounded-xl border border-nel-purple/40 leading-relaxed">
                This adjustment will be recorded in <code className="text-[#8649AC]">inventoryAdjustments</code> without modifying historical draw records.
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 text-[#645574] text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjustment || calculatedNewRemaining < 0}
                  className="w-full sm:w-auto px-5 py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-black text-xs shadow transition cursor-pointer flex items-center justify-center"
                >
                  {isSubmittingAdjustment ? 'Recording...' : 'Confirm Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: CSV IMPORT WITH PREVIEW */}
      {/* ------------------------------------------------------------- */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-nel-purple/40 rounded-2xl sm:rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col p-4 sm:p-6 shadow-2xl relative overflow-hidden">
            <button
              onClick={() => {
                setIsCsvModalOpen(false);
                setParsedCsvItems([]);
                setCsvRawText('');
              }}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 text-[#8A7C96] hover:text-[#33224B] p-2 rounded-xl hover:bg-[#F1EAF9] transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close CSV Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg sm:text-xl font-bold text-[#33224B] flex items-center gap-2 mb-1">
              <Upload className="w-5 h-5 text-[#8649AC] shrink-0" />
              <span>CSV Inventory Import</span>
            </h3>
            <p className="text-xs text-[#8A7C96] mb-3 sm:mb-4">
              Columns: <code className="text-[#8649AC] font-mono text-[11px] sm:text-xs">prize_name,tier,pdd_quantity,ps_quantity,active</code>
            </p>

            {/* Template Tools */}
            <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-2xl bg-nel-input border border-nel-purple/40 text-xs">
              <span className="text-[#8A7C96] font-semibold">CSV Helpers:</span>
              <button
                type="button"
                onClick={handleDownloadCsvTemplate}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 text-[#33224B] font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#8649AC]" />
                <span>Download Sample CSV</span>
              </button>
            </div>

            {/* File Upload / Paste Box */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase text-[#645574]">
                  Select CSV File or Paste Raw CSV
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[#8649AC] hover:text-[#8649AC] underline font-semibold cursor-pointer p-1 min-h-[36px] flex items-center"
                >
                  Browse File
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />

              <textarea
                rows={3}
                value={csvRawText}
                onChange={(e) => parseCsvText(e.target.value)}
                placeholder="prize_name,tier,pdd_quantity,ps_quantity,active
Garmin Forerunner 55 Trail GPS Watch,TOP,12,11,true
NELBD Trail 2026 Commemorative Enamel Pin,STANDARD,400,400,true"
                className="w-full px-3.5 py-2.5 rounded-xl bg-nel-input border border-[#E8DEF1] text-xs font-mono text-[#33224B] placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>

            {/* PREVIEW SECTION */}
            {parsedCsvItems.length > 0 && (
              <div className="flex-1 flex flex-col min-h-0 bg-nel-input rounded-2xl border border-nel-purple/40 p-3 sm:p-4 mb-3 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold uppercase text-[#8649AC] flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[#8649AC] shrink-0" />
                    <span>Import Preview</span>
                  </span>

                  {/* Metrics requested */}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono text-[#645574]">
                    <span>
                      Items: <strong className="text-[#33224B]">{parsedCsvItems.length}</strong>
                    </span>
                    <span>
                      PDD: <strong className="text-[#8649AC]">{csvTotalPdd}</strong>
                    </span>
                    <span>
                      PS: <strong className="text-sky-300">{csvTotalPs}</strong>
                    </span>
                    <span>
                      Total: <strong className="text-[#33224B] font-bold">{csvCombinedTotal}</strong>
                    </span>
                    <span>
                      TOP: <strong className="text-amber-400">{csvTopUnits}</strong>
                    </span>
                  </div>
                </div>

                {/* Validation Errors Notice */}
                {csvValidationErrors.length > 0 && (
                  <div className="mb-3 p-3 rounded-xl bg-red-950/80 border border-red-700 text-xs text-red-200">
                    <div className="font-bold mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{csvValidationErrors.length} Rejected Rows:</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5 max-h-24 overflow-y-auto">
                      {csvValidationErrors.map((err) => (
                        <li key={err.rowNumber}>
                          Row {err.rowNumber} ("{err.prize_name || 'Empty'}"): {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Matching Prizes Notice */}
                {csvMatchedPrizesCount > 0 && (
                  <div className="mb-3 p-3 rounded-xl bg-amber-950/40 border border-amber-700/60 text-xs text-amber-200">
                    <div className="font-bold mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{csvMatchedPrizesCount} prizes match existing catalog:</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <span className="font-semibold text-[#33224B]">Action:</span>
                      <label className="flex items-center space-x-1.5 cursor-pointer min-h-[36px]">
                        <input
                          type="radio"
                          name="csvMatchAction"
                          value="update"
                          checked={csvMatchAction === 'update'}
                          onChange={() => setCsvMatchAction('update')}
                          className="text-amber-500"
                        />
                        <span>Update existing</span>
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer min-h-[36px]">
                        <input
                          type="radio"
                          name="csvMatchAction"
                          value="skip"
                          checked={csvMatchAction === 'skip'}
                          onChange={() => setCsvMatchAction('skip')}
                          className="text-amber-500"
                        />
                        <span>Skip</span>
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer min-h-[36px]">
                        <input
                          type="radio"
                          name="csvMatchAction"
                          value="cancel"
                          checked={csvMatchAction === 'cancel'}
                          onChange={() => setCsvMatchAction('cancel')}
                          className="text-amber-500"
                        />
                        <span>Cancel</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Table of Parsed Rows - Contained scrolling */}
                <div className="flex-1 overflow-x-auto overflow-y-auto max-h-48 border border-nel-purple/40 rounded-xl">
                  <table className="w-full text-left text-xs text-[#645574]">
                    <thead className="bg-white sticky top-0 text-[10px] uppercase font-bold text-[#8A7C96] border-b border-nel-purple/40">
                      <tr>
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Prize Name</th>
                        <th className="px-3 py-2">Tier</th>
                        <th className="px-3 py-2">PDD</th>
                        <th className="px-3 py-2">PS</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Active</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-nel-purple/20/60 font-mono">
                      {parsedCsvItems.map((item) => (
                        <tr
                          key={item.rowNumber}
                          className={item.isValid ? 'hover:bg-white/60' : 'bg-red-950/20'}
                        >
                          <td className="px-3 py-2 text-[#33224B]/40">#{item.rowNumber}</td>
                          <td className="px-3 py-2 font-sans font-semibold text-[#33224B]">
                            {item.prize_name}
                            {item.matchedPrizeId && (
                              <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                                Match
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                item.tier === 'TOP'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-[#8649AC]'
                              }`}
                            >
                              {item.tier}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[#8649AC]">{item.pdd_quantity}</td>
                          <td className="px-3 py-2 text-sky-300">{item.ps_quantity}</td>
                          <td className="px-3 py-2 font-bold text-[#33224B]">{item.total_quantity}</td>
                          <td className="px-3 py-2 font-sans">
                            {item.active ? (
                              <span className="text-[#8649AC] text-[11px]">Yes</span>
                            ) : (
                              <span className="text-[#8A7C96] text-[11px]">No</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-sans">
                            {item.isValid ? (
                              <span className="text-[#8649AC] text-[11px] font-semibold">
                                Ready
                              </span>
                            ) : (
                              <span className="text-red-400 text-[11px] font-semibold">
                                {item.error}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2 pt-3 border-t border-nel-purple/40">
              <button
                type="button"
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setParsedCsvItems([]);
                  setCsvRawText('');
                }}
                className="w-full sm:w-auto px-4 py-2.5 min-h-[44px] rounded-xl bg-[#F1EAF9] hover:bg-slate-700 text-[#645574] text-xs font-semibold cursor-pointer text-center"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={
                  isImporting ||
                  parsedCsvItems.filter((i) => i.isValid).length === 0 ||
                  csvMatchAction === 'cancel'
                }
                onClick={handleExecuteCsvImport}
                className="w-full sm:w-auto px-5 py-3 min-h-[48px] rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
              >
                {isImporting ? (
                  <span>Importing Records...</span>
                ) : (
                  <>
                    <span>
                      Confirm & Import ({parsedCsvItems.filter((i) => i.isValid).length} Prizes)
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};
