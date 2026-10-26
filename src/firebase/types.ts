/**
 * Site locations for NELBD Trail Lucky Dip
 */
export type SiteLocation = 'PDD' | 'PS';

/**
 * Prize tier values
 */
export type PrizeTier = 'STANDARD' | 'TOP';

/**
 * Admin role tiers
 */
export type AdminRole = 'super_admin' | 'staff';

/**
 * Admin user entity
 */
export interface Admin {
  id: string;
  email: string;
  role: AdminRole;
  name?: string;
  siteAccess?: 'ALL' | SiteLocation;
  createdAt?: string;
}

/**
 * Prize entity
 */
export interface Prize {
  id: string;
  name: string;
  description: string;
  tier: PrizeTier;
  isActive: boolean;
  icon?: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Site-specific inventory item for a prize (separate for PDD and PS)
 */
export interface SiteInventory {
  id: string;
  prizeId: string;
  site: SiteLocation;
  allocatedQuantity: number;
  remainingQuantity: number;
  claimedQuantity: number;
  updatedAt: string;
}

/**
 * Prize with calculated total inventory combined from PDD and PS site inventories
 */
export interface PrizeWithInventory extends Prize {
  pddInventory: SiteInventory;
  psInventory: SiteInventory;
  totalAllocated: number; // PDD + PS
  totalRemaining: number; // PDD + PS
  totalClaimed: number;   // PDD + PS
}

/**
 * Participant entity entering the lucky dip
 */
export interface Participant {
  id: string;
  nickname: string;
  mobileNumber: string; // Singapore mobile number (PII protected)
  site: SiteLocation;
  createdAt: string;
}

/**
 * Draw redemption status
 */
export type DrawStatus = 'pending' | 'claimed' | 'forfeited';

/**
 * Official lucky dip draw record
 */
export interface Draw {
  id: string;
  ticketNumber: string;
  participantId?: string;
  participantNickname: string;
  prizeId: string;
  prizeName: string;
  prizeTier: PrizeTier;
  prizeImageUrl?: string;
  site: SiteLocation;
  status: DrawStatus;
  kioskId: string;
  drawnAt: string;
  claimedAt?: string | null;
}

/**
 * Inventory adjustment audit log reason
 */
export type AdjustmentReason =
  | 'initial_stock'
  | 'restock'
  | 'draw'
  | 'manual_adjustment'
  | 'transfer';

/**
 * Inventory adjustment audit record
 */
export interface InventoryAdjustment {
  id: string;
  prizeId: string;
  prizeName: string;
  site: SiteLocation;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  quantityChange?: number;
  reason: AdjustmentReason;
  adjustedByAdminId?: string;
  adminId?: string;
  adjustedByEmail?: string;
  createdAt: string;
}

/**
 * System and festival settings
 */
export interface Setting {
  festivalName: string;
  kioskActive: boolean;
  activeSite: SiteLocation;
  welcomeMessage: string;
  termsSummary: string;
  maxDrawsPerParticipant: number;
  updatedAt?: string;
}

/**
 * Backward compatibility aliases for existing components
 */
export type KioskSettings = Setting;
export type InventoryItem = PrizeWithInventory;
export type DrawRecord = Draw;
export type AdminUser = Admin;

export const DEFAULT_SETTINGS: Setting = {
  festivalName: 'NELBD Trail Lucky Dip',
  kioskActive: true,
  activeSite: 'PDD',
  welcomeMessage: 'Welcome to the NELBD Trail Lucky Dip! Walk the trail, complete your checkpoint passport, and draw for exclusive festival prizes.',
  termsSummary: 'One draw per verified participant with valid Singapore mobile number. Non-transferable. Physical prizes must be claimed today at the trail station.',
  maxDrawsPerParticipant: 1,
};
