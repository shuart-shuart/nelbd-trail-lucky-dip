import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  limit,
  startAfter,
  where,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from './config';
import { handleFirestoreError, OperationType } from './errorHandler';
import {
  Prize,
  SiteInventory,
  PrizeWithInventory,
  Participant,
  Draw,
  InventoryAdjustment,
  Admin,
  Setting,
  SiteLocation,
  PrizeTier,
  AdjustmentReason,
  DEFAULT_SETTINGS,
} from './types';

// Export for backward compatibility
export { DEFAULT_SETTINGS };

/**
 * Validation helper for Singapore mobile numbers:
 * Must be 8 digits starting with 8 or 9, with optional +65 prefix.
 */
export function isValidSingaporeMobile(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-]/g, '');
  return /^(\+65)?[89]\d{7}$/.test(cleaned);
}

/**
 * Normalizes Singapore mobile number to E.164 format (+65XXXXXXXX)
 */
export function normalizeSingaporeMobile(phone: string): string {
  const cleaned = phone.replace(/[\s\-]/g, '');
  if (cleaned.startsWith('+65')) {
    return cleaned;
  }
  return `+65${cleaned}`;
}

// Initial prize catalog seed with separate PDD and PS allocations (totalling 2,500 units and 23 Top Prizes)
export const FESTIVAL_2500_INVENTORY_SEED: {
  name: string;
  description: string;
  tier: PrizeTier;
  icon: string;
  pddAllocated: number;
  psAllocated: number;
  isActive: boolean;
}[] = [
  // 4 TOP Tier Prizes -> Exactly 23 units in total!
  {
    name: 'Garmin Forerunner 55 Trail GPS Watch',
    description: 'GPS running & trail watch with wrist-based heart rate and trail pacing metrics.',
    tier: 'TOP',
    icon: 'award',
    pddAllocated: 4,
    psAllocated: 4, // 8 units
    isActive: true,
  },
  {
    name: 'Osprey Talon 22L Technical Trail Backpack',
    description: 'Lightweight technical daypack designed for dynamic trail movement and hydration bladder integration.',
    tier: 'TOP',
    icon: 'shopping-bag',
    pddAllocated: 3,
    psAllocated: 3, // 6 units
    isActive: true,
  },
  {
    name: 'Hydro Flask Limited Trail Edition 32oz Flask',
    description: 'Pro-grade stainless steel vacuum bottle with insulated flex cap and trail laser etching.',
    tier: 'TOP',
    icon: 'sparkles',
    pddAllocated: 3,
    psAllocated: 3, // 6 units
    isActive: true,
  },
  {
    name: 'Artisan Wild Honeycomb & Heritage Reserve Hamper',
    description: 'Exclusive small-batch raw honeycomb gift hamper curated by local East London beekeepers.',
    tier: 'TOP',
    icon: 'gift',
    pddAllocated: 2,
    psAllocated: 1, // 3 units
    isActive: true,
  },
  // 5 STANDARD Tier Prizes -> 2,477 units (Grand Total = 2,500 units!)
  {
    name: 'NELBD Trail 2026 Commemorative Enamel Pin',
    description: 'Collectible gold-finish metal badge featuring the official 2026 Trail emblem.',
    tier: 'STANDARD',
    icon: 'award',
    pddAllocated: 400,
    psAllocated: 400, // 800 units
    isActive: true,
  },
  {
    name: 'Heavyweight Organic Cotton Trail Map Tote Bag',
    description: 'Eco-conscious heavy canvas tote screen-printed with the PDD-PS nature trail route.',
    tier: 'STANDARD',
    icon: 'shopping-bag',
    pddAllocated: 250,
    psAllocated: 250, // 500 units
    isActive: true,
  },
  {
    name: 'Waterproof Trail Flora & Wildlife Holographic Stickers',
    description: 'Pack of 5 custom holographic vinyl stickers designed by local nature artists.',
    tier: 'STANDARD',
    icon: 'star',
    pddAllocated: 350,
    psAllocated: 350, // 700 units
    isActive: true,
  },
  {
    name: 'Checkpoint Artisan Cold Brew & Pastry Voucher',
    description: 'Redeemable for specialty beverage and fresh baked goods at either PDD or PS pavilions.',
    tier: 'STANDARD',
    icon: 'coffee',
    pddAllocated: 200,
    psAllocated: 200, // 400 units
    isActive: true,
  },
  {
    name: 'Trail Explorer Carabiner Compass & Safety Whistle',
    description: 'Compact all-weather outdoor navigator tool with secure gate latch and audible whistle.',
    tier: 'STANDARD',
    icon: 'compass',
    pddAllocated: 38,
    psAllocated: 39, // 77 units
    isActive: true,
  },
];

export const INITIAL_PRIZES_SEED = FESTIVAL_2500_INVENTORY_SEED;


// ==========================================
// 1. SETTINGS
// ==========================================
export async function getKioskSettings(): Promise<Setting> {
  const path = 'settings';
  try {
    const docRef = doc(db, path, 'config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as Setting;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${path}/config`);
  }
}

export async function saveKioskSettings(settings: Setting): Promise<void> {
  const path = 'settings';
  try {
    const docRef = doc(db, path, 'config');
    await setDoc(
      docRef,
      {
        ...settings,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/config`);
  }
}

export function subscribeToKioskSettings(
  onUpdate: (settings: Setting) => void,
  onError?: (err: Error) => void
) {
  const path = 'settings/config';
  return onSnapshot(
    doc(db, 'settings', 'config'),
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as Setting);
      } else {
        onUpdate(DEFAULT_SETTINGS);
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

// ==========================================
// 2. PRIZES & INVENTORY (PDD & PS)
// ==========================================
export async function getPrizes(): Promise<Prize[]> {
  const path = 'prizes';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Prize));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeToPrizes(
  onUpdate: (prizes: Prize[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'prizes';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const prizes = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Prize));
      onUpdate(prizes);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export async function getSiteInventories(): Promise<SiteInventory[]> {
  const path = 'inventory';
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SiteInventory));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeToSiteInventories(
  onUpdate: (inventories: SiteInventory[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'inventory';
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const inventories = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SiteInventory));
      onUpdate(inventories);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

/**
 * Combines prizes with their separate PDD and PS inventories, calculating total stock
 */
export function buildPrizeWithInventory(
  prizes: Prize[],
  inventories: SiteInventory[]
): PrizeWithInventory[] {
  return prizes.map((prize) => {
    const pddInv = inventories.find((inv) => inv.prizeId === prize.id && inv.site === 'PDD') || {
      id: `${prize.id}_PDD`,
      prizeId: prize.id,
      site: 'PDD' as SiteLocation,
      allocatedQuantity: 0,
      remainingQuantity: 0,
      claimedQuantity: 0,
      updatedAt: prize.updatedAt || new Date().toISOString(),
    };

    const psInv = inventories.find((inv) => inv.prizeId === prize.id && inv.site === 'PS') || {
      id: `${prize.id}_PS`,
      prizeId: prize.id,
      site: 'PS' as SiteLocation,
      allocatedQuantity: 0,
      remainingQuantity: 0,
      claimedQuantity: 0,
      updatedAt: prize.updatedAt || new Date().toISOString(),
    };

    const totalAllocated = pddInv.allocatedQuantity + psInv.allocatedQuantity;
    const totalRemaining = pddInv.remainingQuantity + psInv.remainingQuantity;
    const totalClaimed = pddInv.claimedQuantity + psInv.claimedQuantity;

    return {
      ...prize,
      pddInventory: pddInv,
      psInventory: psInv,
      totalAllocated,
      totalRemaining,
      totalClaimed,
    };
  });
}

/**
 * Live composite subscription for Prizes joined with separate PDD and PS inventories
 */
export function subscribeToPrizesWithInventory(
  onUpdate: (combined: PrizeWithInventory[]) => void,
  onError?: (err: Error) => void
) {
  let cachedPrizes: Prize[] = [];
  let cachedInventories: SiteInventory[] = [];
  let prizesLoaded = false;
  let inventoriesLoaded = false;

  const updateCombined = () => {
    if (prizesLoaded && inventoriesLoaded) {
      onUpdate(buildPrizeWithInventory(cachedPrizes, cachedInventories));
    }
  };

  const unsubPrizes = subscribeToPrizes((prizes) => {
    cachedPrizes = prizes;
    prizesLoaded = true;
    updateCombined();
  }, onError);

  const unsubInv = subscribeToSiteInventories((inventories) => {
    cachedInventories = inventories;
    inventoriesLoaded = true;
    updateCombined();
  }, onError);

  return () => {
    unsubPrizes();
    unsubInv();
  };
}

/**
 * Creates a new prize along with initialized separate PDD and PS site inventories
 */
export async function createPrizeWithInventories(params: {
  name: string;
  description: string;
  tier: PrizeTier;
  isActive: boolean;
  icon?: string;
  imageUrl?: string;
  pddAllocated: number;
  psAllocated: number;
  adminEmail?: string;
}): Promise<string> {
  const prizeId = `prize_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  // 1. Create Prize document
  try {
    await setDoc(doc(db, 'prizes', prizeId), {
      name: params.name,
      description: params.description,
      tier: params.tier,
      isActive: params.isActive,
      icon: params.icon || (params.tier === 'TOP' ? 'sparkles' : 'star'),
      imageUrl: params.imageUrl || '',
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `prizes/${prizeId}`);
  }

  // 2. Create PDD Site Inventory
  const pddInvId = `${prizeId}_PDD`;
  try {
    await setDoc(doc(db, 'inventory', pddInvId), {
      prizeId,
      site: 'PDD',
      allocatedQuantity: params.pddAllocated,
      remainingQuantity: params.pddAllocated,
      claimedQuantity: 0,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inventory/${pddInvId}`);
  }

  // 3. Create PS Site Inventory
  const psInvId = `${prizeId}_PS`;
  try {
    await setDoc(doc(db, 'inventory', psInvId), {
      prizeId,
      site: 'PS',
      allocatedQuantity: params.psAllocated,
      remainingQuantity: params.psAllocated,
      claimedQuantity: 0,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inventory/${psInvId}`);
  }

  // 4. Log initial inventory adjustments for audit
  if (params.pddAllocated > 0) {
    await recordInventoryAdjustment({
      prizeId,
      prizeName: params.name,
      site: 'PDD',
      previousQuantity: 0,
      newQuantity: params.pddAllocated,
      delta: params.pddAllocated,
      reason: 'initial_stock',
      adjustedByEmail: params.adminEmail || 'admin',
    });
  }

  if (params.psAllocated > 0) {
    await recordInventoryAdjustment({
      prizeId,
      prizeName: params.name,
      site: 'PS',
      previousQuantity: 0,
      newQuantity: params.psAllocated,
      delta: params.psAllocated,
      reason: 'initial_stock',
      adjustedByEmail: params.adminEmail || 'admin',
    });
  }

  return prizeId;
}

/**
 * Updates prize metadata
 */
export async function updatePrize(prizeId: string, updates: Partial<Prize>): Promise<void> {
  const path = 'prizes';
  try {
    await updateDoc(doc(db, path, prizeId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${prizeId}`);
  }
}

/**
 * Deletes a prize and associated site inventories
 */
export async function deletePrize(prizeId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'prizes', prizeId));
    await deleteDoc(doc(db, 'inventory', `${prizeId}_PDD`)).catch(() => {});
    await deleteDoc(doc(db, 'inventory', `${prizeId}_PS`)).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `prizes/${prizeId}`);
  }
}

/**
 * Updates specific site inventory (PDD or PS) with audit adjustment record
 */
export async function updateSiteInventoryQuantity(params: {
  prizeId: string;
  prizeName: string;
  site: SiteLocation;
  newAllocated?: number;
  newRemaining: number;
  reason: AdjustmentReason;
  adminEmail?: string;
  adminId?: string;
}): Promise<void> {
  const invId = `${params.prizeId}_${params.site}`;
  const now = new Date().toISOString();

  // Retrieve existing inventory to calculate delta
  let previousRemaining = 0;
  let currentAllocated = params.newAllocated ?? 0;
  let currentClaimed = 0;

  try {
    const snap = await getDoc(doc(db, 'inventory', invId));
    if (snap.exists()) {
      const data = snap.data() as SiteInventory;
      previousRemaining = data.remainingQuantity;
      if (params.newAllocated === undefined) {
        currentAllocated = data.allocatedQuantity;
      }
      currentClaimed = data.claimedQuantity;
    }
  } catch {
    // If not found, defaults apply
  }

  const delta = params.newRemaining - previousRemaining;

  try {
    await setDoc(
      doc(db, 'inventory', invId),
      {
        prizeId: params.prizeId,
        site: params.site,
        allocatedQuantity: currentAllocated,
        remainingQuantity: params.newRemaining,
        claimedQuantity: currentClaimed,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory/${invId}`);
  }

  // Record audit adjustment
  await recordInventoryAdjustment({
    prizeId: params.prizeId,
    prizeName: params.prizeName,
    site: params.site,
    previousQuantity: previousRemaining,
    newQuantity: params.newRemaining,
    delta,
    reason: params.reason,
    adjustedByAdminId: params.adminId,
    adjustedByEmail: params.adminEmail,
  });
}

// ==========================================
// 3. INVENTORY ADJUSTMENTS (Audit Trail)
// ==========================================
export async function recordInventoryAdjustment(adjustment: {
  prizeId: string;
  prizeName: string;
  site: SiteLocation;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  reason: AdjustmentReason;
  adjustedByAdminId?: string;
  adjustedByEmail?: string;
}): Promise<string> {
  const path = 'inventoryAdjustments';
  const id = `adj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  try {
    await setDoc(doc(db, path, id), {
      ...adjustment,
      id,
      quantityChange: adjustment.delta,
      adminId: adjustment.adjustedByAdminId || '',
      createdAt: new Date().toISOString(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
  }
}

/**
 * Updates starting quantities for a prize before any draws have been recorded.
 */
export async function updatePrizeStartingQuantities(params: {
  prizeId: string;
  pddStarting: number;
  psStarting: number;
  updateRemaining?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const pddRef = doc(db, 'inventory', `${params.prizeId}_PDD`);
  const psRef = doc(db, 'inventory', `${params.prizeId}_PS`);

  try {
    const pddSnap = await getDoc(pddRef);
    const pddData = pddSnap.exists() ? (pddSnap.data() as SiteInventory) : null;
    const newPddRem =
      params.updateRemaining !== false
        ? params.pddStarting
        : pddData?.remainingQuantity ?? params.pddStarting;

    await setDoc(
      pddRef,
      {
        prizeId: params.prizeId,
        site: 'PDD',
        allocatedQuantity: params.pddStarting,
        remainingQuantity: newPddRem,
        claimedQuantity: pddData?.claimedQuantity ?? 0,
        updatedAt: now,
      },
      { merge: true }
    );

    const psSnap = await getDoc(psRef);
    const psData = psSnap.exists() ? (psSnap.data() as SiteInventory) : null;
    const newPsRem =
      params.updateRemaining !== false
        ? params.psStarting
        : psData?.remainingQuantity ?? params.psStarting;

    await setDoc(
      psRef,
      {
        prizeId: params.prizeId,
        site: 'PS',
        allocatedQuantity: params.psStarting,
        remainingQuantity: newPsRem,
        claimedQuantity: psData?.claimedQuantity ?? 0,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory/${params.prizeId}`);
  }
}


export async function getInventoryAdjustments(): Promise<InventoryAdjustment[]> {
  const path = 'inventoryAdjustments';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryAdjustment));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export function subscribeToInventoryAdjustments(
  onUpdate: (adjustments: InventoryAdjustment[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'inventoryAdjustments';
  const q = query(collection(db, path), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryAdjustment));
      onUpdate(records);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

// ==========================================
// 4. PARTICIPANTS (PII Protected)
// ==========================================
export async function registerParticipant(params: {
  nickname: string;
  mobileNumber: string;
  site: SiteLocation;
}): Promise<string> {
  const cleanNickname = params.nickname.trim();
  const cleanPhone = normalizeSingaporeMobile(params.mobileNumber);

  if (!isValidSingaporeMobile(cleanPhone)) {
    throw new Error('Please enter a valid Singapore mobile number (e.g. 8123 4567 or 9123 4567).');
  }

  const path = 'participants';
  const id = `part_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    await setDoc(doc(db, path, id), {
      nickname: cleanNickname || 'Trail Walker',
      mobileNumber: cleanPhone,
      site: params.site,
      createdAt: new Date().toISOString(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
  }
}

/**
 * Checks if a normalized Singapore mobile number has already drawn a prize.
 */
export async function checkMobileHasDrawn(mobileNumber: string): Promise<boolean> {
  const cleanMobile = normalizeSingaporeMobile(mobileNumber);
  const phoneDocId = `phone_${cleanMobile.replace('+', '')}`;
  try {
    const snap = await getDoc(doc(db, 'participantPhones', phoneDocId));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function getParticipants(): Promise<Participant[]> {
  const path = 'participants';
  try {
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Participant));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ==========================================
// 5. DRAWS
// ==========================================
export async function recordDraw(draw: Omit<Draw, 'id'>): Promise<string> {
  const path = 'draws';
  const id = `draw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  try {
    await setDoc(doc(db, path, id), {
      ...draw,
      id,
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${id}`);
  }
}

export async function getDrawsCount(): Promise<number> {
  const path = 'draws';
  try {
    const snap = await getCountFromServer(collection(db, path));
    return snap.data().count;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return 0;
  }
}

export function subscribeToTodayDraws(
  onUpdate: (draws: Draw[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'draws';
  const singaporeDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
  }).format(new Date());
  const startOfTodayIso = new Date(`${singaporeDate}T00:00:00+08:00`).toISOString();

  const q = query(
    collection(db, path),
    where('drawnAt', '>=', startOfTodayIso),
    orderBy('drawnAt', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Draw));
      onUpdate(records);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export function subscribeToLatestDraws(
  pageSize: number = 50,
  onUpdate: (draws: Draw[], lastDoc: any, hasMore: boolean) => void,
  onError?: (err: Error) => void
) {
  const path = 'draws';
  const q = query(collection(db, path), orderBy('drawnAt', 'desc'), limit(pageSize));
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Draw));
      const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      const hasMore = snap.docs.length >= pageSize;
      onUpdate(records, lastDoc, hasMore);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export async function fetchOlderDraws(
  pageSize: number = 50,
  lastVisibleDoc: any
): Promise<{ draws: Draw[]; lastDoc: any; hasMore: boolean }> {
  const path = 'draws';
  try {
    const q = query(
      collection(db, path),
      orderBy('drawnAt', 'desc'),
      startAfter(lastVisibleDoc),
      limit(pageSize)
    );
    const snap = await getDocs(q);
    const draws = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Draw));
    const nextLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    const hasMore = snap.docs.length >= pageSize;
    return { draws, lastDoc: nextLastDoc, hasMore };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return { draws: [], lastDoc: null, hasMore: false };
  }
}

export async function searchDrawByTicket(ticketNumber: string): Promise<Draw | null> {
  const path = 'draws';
  const cleanTicket = (ticketNumber || '').trim().toUpperCase();
  if (!cleanTicket) return null;
  try {
    const q = query(collection(db, path), where('ticketNumber', '==', cleanTicket), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as Draw;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return null;
  }
}

export async function fetchAllDraws(): Promise<Draw[]> {
  const path = 'draws';
  try {
    const q = query(collection(db, path), orderBy('drawnAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Draw));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function getDrawHistory(): Promise<Draw[]> {
  return fetchAllDraws();
}

export function subscribeToDrawHistory(
  onUpdate: (draws: Draw[]) => void,
  onError?: (err: Error) => void
) {
  const path = 'draws';
  const q = query(collection(db, path), orderBy('drawnAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Draw));
      onUpdate(records);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (e) {
        if (onError) onError(e as Error);
      }
    }
  );
}

export async function updateDrawStatus(
  drawId: string,
  status: Draw['status'],
  prizeId?: string,
  site?: SiteLocation
): Promise<void> {
  const path = 'draws';
  try {
    await updateDoc(doc(db, path, drawId), {
      status,
      claimedAt: status === 'claimed' ? new Date().toISOString() : null,
    });

    // If marked claimed, increment claimedQuantity on site inventory if applicable
    if (status === 'claimed' && prizeId && site) {
      const invId = `${prizeId}_${site}`;
      const snap = await getDoc(doc(db, 'inventory', invId));
      if (snap.exists()) {
        const inv = snap.data() as SiteInventory;
        await updateDoc(doc(db, 'inventory', invId), {
          claimedQuantity: (inv.claimedQuantity || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${drawId}`);
  }
}

// ==========================================
// 6. ADMINS
// ==========================================
export async function checkAdminStatus(uid: string, email?: string | null): Promise<boolean> {
  if (typeof email === 'string' && email.toLowerCase() === 'work@anotherunit.xyz') {
    return true;
  }
  const path = 'admins';
  try {
    const snap = await getDoc(doc(db, path, uid));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function registerAdminUser(admin: Admin): Promise<void> {
  const path = 'admins';
  try {
    await setDoc(doc(db, path, admin.id), {
      email: admin.email,
      role: admin.role,
      name: admin.name || '',
      siteAccess: admin.siteAccess || 'ALL',
      createdAt: admin.createdAt || new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${path}/${admin.id}`);
  }
}

// ==========================================
// 7. SEED & BULK IMPORT PRIZES & INVENTORIES
// ==========================================
export async function bulkImportPrizes(
  prizesData: {
    name: string;
    description: string;
    tier: PrizeTier;
    pddAllocated: number;
    psAllocated: number;
    isActive: boolean;
    icon?: string;
  }[],
  adminEmail: string = 'work@anotherunit.xyz',
  replaceExisting: boolean = false
): Promise<number> {
  if (replaceExisting) {
    const existing = await getPrizes();
    for (const p of existing) {
      await deletePrize(p.id).catch(() => {});
    }
  }

  let count = 0;
  for (const item of prizesData) {
    await createPrizeWithInventories({
      name: item.name,
      description: item.description,
      tier: item.tier,
      isActive: item.isActive,
      icon: item.icon,
      pddAllocated: item.pddAllocated,
      psAllocated: item.psAllocated,
      adminEmail,
    });
    count++;
  }
  return count;
}

/**
 * Populates festival dummy inventory totalling 2,500 units and 23 Top Prizes
 */
export async function populateFestivalInventory2500(
  adminEmail: string = 'work@anotherunit.xyz',
  replaceExisting: boolean = true
): Promise<number> {
  const count = await bulkImportPrizes(FESTIVAL_2500_INVENTORY_SEED, adminEmail, replaceExisting);
  await saveKioskSettings(DEFAULT_SETTINGS);
  return count;
}

export async function seedInitialPrizesAndInventory(): Promise<void> {
  const existing = await getPrizes();
  if (existing.length === 0) {
    await populateFestivalInventory2500('work@anotherunit.xyz', false);
  }
}

// Backward-compatible alias
export const seedInitialInventory = seedInitialPrizesAndInventory;
export const getInventory = async (): Promise<PrizeWithInventory[]> => {
  const prizes = await getPrizes();
  const inventories = await getSiteInventories();
  return buildPrizeWithInventory(prizes, inventories);
};
export const subscribeToInventory = subscribeToPrizesWithInventory;

