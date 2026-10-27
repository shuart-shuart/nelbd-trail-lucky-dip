import crypto from 'crypto';
import { db } from './firebaseAdmin.ts';

const doc = (_db: typeof db, ...segments: string[]) => db.doc(segments.join('/'));
const collection = (_db: typeof db, path: string) => db.collection(path);
const getDocs = (ref: FirebaseFirestore.CollectionReference) => ref.get();
const runTransaction = <T>(_: typeof db, handler: (tx: FirebaseFirestore.Transaction) => Promise<T>) => db.runTransaction(handler);

export type SiteLocation = 'PDD' | 'PS';
export type PrizeTier = 'STANDARD' | 'TOP';

export interface DrawExecutionRequest {
  nickname: string;
  mobileNumber: string;
  site: SiteLocation;
  kioskId?: string;
  ticketNumber?: string;
}

export interface DrawResultScreenPayload {
  success: boolean;
  ticketNumber?: string;
  participantNickname?: string;
  site?: SiteLocation;
  prize?: {
    id?: string;
    name: string;
    tier: PrizeTier;
    description: string;
    imageUrl?: string;
  };
  status?: string;
  drawnAt?: string;
  recovered?: boolean;
  error?: string;
}

/**
 * Normalizes Singapore mobile numbers to E.164 format (+65XXXXXXXX)
 */
export function normalizeSingaporeMobile(phone: string): string {
  const cleaned = (phone || '').replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+65')) {
    return cleaned;
  }
  if (cleaned.startsWith('65') && cleaned.length === 10) {
    return `+${cleaned}`;
  }
  return `+65${cleaned}`;
}

/**
 * Validates Singapore mobile number (8 digits, starting with 8 or 9)
 */
export function isValidSingaporeMobile(phone: string): boolean {
  const normalized = normalizeSingaporeMobile(phone);
  return /^\+65[89]\d{7}$/.test(normalized);
}

/**
 * Determines current calendar date in Asia/Singapore timezone (YYYY-MM-DD)
 */
export function getSingaporeCalendarDate(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // e.g. "2026-09-26"
}

interface PrizeDocMeta {
  id: string;
  name: string;
  description: string;
  tier: PrizeTier;
  imageUrl?: string;
  isActive: boolean;
}

/**
 * Concurrency-safe lucky dip draw engine using Firestore transactions.
 * Enforces all 15 rules specified.
 */
export async function executeLuckyDipDraw(
  request: DrawExecutionRequest
): Promise<DrawResultScreenPayload> {
  const rawNick = (request.nickname || '').trim();
  const rawMobile = (request.mobileNumber || '').trim();
  const site: SiteLocation = request.site === 'PS' ? 'PS' : 'PDD';
  const kioskId = request.kioskId || `KIOSK-${site}-01`;

  // Validation 1: Nickname
  if (!rawNick) {
    return {
      success: false,
      error: 'Please enter your nickname to participate in the lucky dip.',
    };
  }

  // Validation 2: Singapore Mobile Number
  if (!isValidSingaporeMobile(rawMobile)) {
    return {
      success: false,
      error:
        'Please enter a valid Singapore mobile number (8 digits starting with 8 or 9, e.g. 9123 4567).',
    };
  }

  const cleanMobile = normalizeSingaporeMobile(rawMobile);
  const cleanNickname = rawNick.slice(0, 64);
  const phoneDocId = `phone_${cleanMobile.replace('+', '')}`;

  // Unique identifiers for this draw session
  const now = new Date();
  const nowIso = now.toISOString();
  const singaporeDate = getSingaporeCalendarDate(now);
  const drawId = `draw_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const participantId = `part_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const adjId = `adj_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const ticketNumber = (
    request.ticketNumber ||
    `NELBD-${site}-${Math.floor(100000 + Math.random() * 900000)}`
  ).toUpperCase();

  // Load active prizes list
  const prizesSnap = await getDocs(collection(db, 'prizes'));
  const activePrizes: PrizeDocMeta[] = [];
  const allPrizesMap = new Map<string, PrizeDocMeta>();

  prizesSnap.forEach((docSnap) => {
    const d = docSnap.data();
    const prizeMeta: PrizeDocMeta = {
      id: docSnap.id,
      name: d.name || 'Festival Prize',
      description: d.description || '',
      tier: d.tier === 'TOP' ? 'TOP' : 'STANDARD',
      imageUrl: d.imageUrl || '',
      isActive: d.isActive !== false,
    };
    allPrizesMap.set(docSnap.id, prizeMeta);
    if (prizeMeta.isActive) {
      activePrizes.push(prizeMeta);
    }
  });

  if (activePrizes.length === 0) {
    return {
      success: false,
      error: 'No active prizes are configured in the lucky dip catalog.',
    };
  }

  try {
    // Execute atomic Firestore transaction
    const transactionOutcome = await runTransaction(db, async (transaction) => {
      // -------------------------------------------------------------
      // 1. TRANSACTION READS (All reads must precede all writes)
      // -------------------------------------------------------------

      // 1a. Duplicate check (Rule 2): One prize per normalized Singapore mobile number
      const phoneLockRef = doc(db, 'participantPhones', phoneDocId);
      const phoneLockSnap = await transaction.get(phoneLockRef);

      if (phoneLockSnap.exists) {
        const phoneLockData = phoneLockSnap.data();
        const existingDrawId = phoneLockData?.drawId;
        const requestedTicket = (request.ticketNumber || '').trim().toUpperCase();

        // If phone lock has no valid drawId reference, abort with controlled error
        if (!existingDrawId || typeof existingDrawId !== 'string') {
          const error = new Error('DRAW_LOOKUP_FAILED');
          (error as any).userMessage =
            'An existing draw record could not be verified for this participant. Please ask our booth crew for assistance.';
          throw error;
        }

        // Transactional read of the existing draw record
        const existingDrawRef = doc(db, 'draws', existingDrawId);
        const existingDrawSnap = await transaction.get(existingDrawRef);

        if (!existingDrawSnap.exists) {
          const error = new Error('DRAW_NOT_FOUND');
          (error as any).userMessage =
            'Your previous draw record could not be found. Please ask our booth crew for assistance.';
          throw error;
        }

        const existingDrawData = existingDrawSnap.data();
        const existingTicket = (existingDrawData?.ticketNumber || '').trim().toUpperCase();

        // Security check: Only recover if the request ticketNumber explicitly matches the original draw ticket
        if (!requestedTicket || requestedTicket !== existingTicket) {
          const error = new Error('DUPLICATE_MOBILE');
          (error as any).userMessage =
            'This Singapore mobile number has already drawn a prize for this festival. Each participant may only draw once across the entire festival.';
          throw error;
        }

        // Verification of session / participant association
        if (
          existingDrawData.participantId &&
          phoneLockData.participantId &&
          existingDrawData.participantId !== phoneLockData.participantId
        ) {
          const error = new Error('DRAW_INTEGRITY_MISMATCH');
          (error as any).userMessage =
            'Draw session verification failed. Please ask our booth crew for assistance.';
          throw error;
        }

        // Verification of site location consistency
        if (existingDrawData.site && existingDrawData.site !== site) {
          const error = new Error('DRAW_SITE_MISMATCH');
          (error as any).userMessage =
            'This draw was completed at a different station. Please visit the original redemption station.';
          throw error;
        }

        // Return recovered draw result - ZERO writes, ZERO inventory deductions, ZERO duplicate draws
        const matchedCatalogPrize =
          allPrizesMap.get(existingDrawData.prizeId) ||
          activePrizes.find((p) => p.id === existingDrawData.prizeId);
        const resolvedRecoveredImage =
          existingDrawData.prizeImageUrl || matchedCatalogPrize?.imageUrl || '';

        return {
          isRecovered: true as const,
          drawResult: {
            success: true,
            ticketNumber: existingDrawData.ticketNumber || requestedTicket,
            participantNickname: existingDrawData.participantNickname || cleanNickname,
            site: existingDrawData.site || site,
            prize: {
              id: existingDrawData.prizeId || '',
              name: existingDrawData.prizeName || 'Festival Prize',
              tier: (existingDrawData.prizeTier === 'TOP' ? 'TOP' : 'STANDARD') as PrizeTier,
              description:
                matchedCatalogPrize?.description ||
                existingDrawData.prizeDescription ||
                existingDrawData.prizeName ||
                '',
              imageUrl: resolvedRecoveredImage,
            },
            status: existingDrawData.status || 'claimed',
            drawnAt: existingDrawData.drawnAt || phoneLockData.createdAt || nowIso,
            recovered: true,
          },
        };
      }

      // 1b. Daily TOP prize lock check (Rules 6, 7, 10): Max one TOP prize per calendar day across BOTH sites
      const dailyTopRef = doc(db, 'dailyTopPrizes', singaporeDate);
      const dailyTopSnap = await transaction.get(dailyTopRef);
      const isTopPrizeAlreadyAwardedToday =
        dailyTopSnap.exists && dailyTopSnap.data()?.awarded === true;

      // 1c. Read site inventories for all candidate prizes
      const eligiblePool: {
        prize: PrizeDocMeta;
        invRef: ReturnType<typeof doc>;
        remaining: number;
        claimed: number;
        allocated: number;
      }[] = [];

      for (const prize of activePrizes) {
        const invRef = doc(db, 'inventory', `${prize.id}_${site}`);
        const invSnap = await transaction.get(invRef);

        if (!invSnap.exists) continue;

        const invData = invSnap.data();
        const remaining = Number(invData.remainingQuantity) || 0;
        const claimed = Number(invData.claimedQuantity) || 0;
        const allocated = Number(invData.allocatedQuantity) || 0;

        // Skip depleted items (Rule 15: remaining inventory cannot fall below zero)
        if (remaining <= 0) continue;

        // Rule 10: If a TOP prize has already been awarded today, exclude all TOP inventory from both sites
        if (prize.tier === 'TOP' && isTopPrizeAlreadyAwardedToday) {
          continue;
        }

        eligiblePool.push({
          prize,
          invRef,
          remaining,
          claimed,
          allocated,
        });
      }

      // If no inventory is available at this site
      if (eligiblePool.length === 0) {
        const error = new Error('OUT_OF_INVENTORY');
        (error as any).userMessage = `No prize inventory is currently available at Station ${site}.`;
        throw error;
      }

      // -------------------------------------------------------------
      // 2. PRIZE SELECTION (Rules 3, 4, 8, 9, 13)
      // Every physical unit in the remaining inventory has equal probability.
      // -------------------------------------------------------------
      const totalRemainingUnits = eligiblePool.reduce(
        (sum, item) => sum + item.remaining,
        0
      );

      if (totalRemainingUnits <= 0) {
        const error = new Error('OUT_OF_INVENTORY');
        (error as any).userMessage = `No prize inventory is currently available at Station ${site}.`;
        throw error;
      }

      // Cryptographically secure random integer uniformly distributed in [0, totalRemainingUnits - 1]
      const randomTicket = crypto.randomInt(0, totalRemainingUnits);

      let accumulated = 0;
      let selectedCandidate = eligiblePool[0];

      for (const candidate of eligiblePool) {
        accumulated += candidate.remaining;
        if (randomTicket < accumulated) {
          selectedCandidate = candidate;
          break;
        }
      }

      const wonPrize = selectedCandidate.prize;

      // -------------------------------------------------------------
      // 3. TRANSACTION WRITES
      // -------------------------------------------------------------

      // 3a. Deduct site inventory (Rules 14, 15)
      const newRemaining = selectedCandidate.remaining - 1;
      const newClaimed = selectedCandidate.claimed + 1;

      if (newRemaining < 0) {
        throw new Error('INSUFFICIENT_INVENTORY');
      }

      transaction.update(selectedCandidate.invRef, {
        remainingQuantity: newRemaining,
        claimedQuantity: newClaimed,
        updatedAt: nowIso,
      });

      // 3b. Record phone uniqueness lock (Rule 2)
      transaction.set(phoneLockRef, {
        mobileNumber: cleanMobile,
        participantId,
        drawId,
        site,
        createdAt: nowIso,
      });

      // 3c. If a TOP prize was won, atomically lock the daily calendar date (Rules 6, 10)
      if (wonPrize.tier === 'TOP') {
        transaction.set(dailyTopRef, {
          date: singaporeDate,
          awarded: true,
          prizeId: wonPrize.id,
          prizeName: wonPrize.name,
          site,
          drawId,
          awardedAt: nowIso,
        });
      }

      // 3d. Create participant record (PII protected by firestore.rules)
      const participantRef = doc(db, 'participants', participantId);
      transaction.set(participantRef, {
        nickname: cleanNickname,
        mobileNumber: cleanMobile,
        site,
        createdAt: nowIso,
      });

      // 3e. Create draw record (Rule 14: automatically considered redeemed)
      // Stage 2 Optimization: Do not duplicate large base64 data URLs into draw documents.
      // If the image is a lightweight HTTPS URL or asset path (< 512 bytes), store as a reference.
      // Otherwise store '' and let consumers resolve it on demand using prizeId and the prize catalog.
      const rawPrizeImage = wonPrize.imageUrl || '';
      const isBase64DataUrl = rawPrizeImage.startsWith('data:');
      const persistedDrawImageUrl =
        !isBase64DataUrl && rawPrizeImage.length < 512 ? rawPrizeImage : '';

      const drawRef = doc(db, 'draws', drawId);
      transaction.set(drawRef, {
        id: drawId,
        ticketNumber,
        participantId,
        participantNickname: cleanNickname,
        prizeId: wonPrize.id,
        prizeName: wonPrize.name,
        prizeTier: wonPrize.tier,
        prizeImageUrl: persistedDrawImageUrl,
        site,
        status: 'claimed', // Automatically redeemed upon draw
        kioskId,
        drawnAt: nowIso,
        claimedAt: nowIso,
      });

      // 3f. Record inventory adjustment audit trail
      const adjRef = doc(db, 'inventoryAdjustments', adjId);
      transaction.set(adjRef, {
        id: adjId,
        prizeId: wonPrize.id,
        prizeName: wonPrize.name,
        site,
        previousQuantity: selectedCandidate.remaining,
        newQuantity: newRemaining,
        delta: -1,
        reason: 'draw',
        adjustedByAdminId: 'lucky_dip_draw_engine',
        adjustedByEmail: `kiosk_${site.toLowerCase()}`,
        createdAt: nowIso,
      });

      return {
        isRecovered: false as const,
        wonPrize,
      };
    });

    // If an existing draw was recovered after network interruption, return its verified result immediately
    if (transactionOutcome.isRecovered && transactionOutcome.drawResult) {
      return transactionOutcome.drawResult;
    }

    const wonPrize = transactionOutcome.wonPrize!;

    // Return ONLY the information required by the result screen (Rule requirement)
    return {
      success: true,
      ticketNumber,
      participantNickname: cleanNickname,
      site,
      prize: {
        id: wonPrize.id,
        name: wonPrize.name,
        tier: wonPrize.tier,
        description: wonPrize.description,
        imageUrl: wonPrize.imageUrl,
      },
      status: 'claimed',
      drawnAt: nowIso,
    };
  } catch (err: any) {
    if (err?.userMessage) {
      return {
        success: false,
        error: err.userMessage,
      };
    }
    console.error('Lucky dip draw transaction failed:', err);
    return {
      success: false,
      error: 'The lucky dip draw could not be completed. Please try again or notify festival staff.',
    };
  }
}
