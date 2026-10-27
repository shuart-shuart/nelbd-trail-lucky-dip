import { SiteLocation, PrizeTier } from '../firebase/types';
import { auth } from '../firebase/config';

export interface DrawRequest {
  ticketNumber?: string;
  participantId?: string;
  nickname?: string;
  mobileNumber?: string;
  site?: SiteLocation;
  kioskId?: string;
}

export interface DrawResponse {
  success: boolean;
  ticketNumber?: string;
  participantNickname?: string;
  site?: SiteLocation;
  status?: string;
  drawnAt?: string;
  recovered?: boolean;
  prize?: {
    id?: string;
    name: string;
    tier: PrizeTier;
    description: string;
    imageUrl?: string;
  };
  error?: string;
}

const DEFAULT_CONNECTION_ERROR = "We're having trouble connecting. Please ask our booth crew for assistance.";

/**
 * Executes server-side lucky dip draw.
 * Validates Content-Type, prevents JSON parse errors, and sanitizes technical errors.
 */
export async function executeServerLuckyDipDraw(payload: DrawRequest): Promise<DrawResponse> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { success: false, error: 'Ask booth crew to sign in before drawing.' };
    const res = await fetch('/api/lucky-dip/draw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text().catch(() => '');
      console.error('Non-JSON response received from /api/lucky-dip/draw:', {
        status: res.status,
        statusText: res.statusText,
        contentType,
        bodySnippet: text.slice(0, 150),
      });
      return {
        success: false,
        error: DEFAULT_CONNECTION_ERROR,
      };
    }

    const data: DrawResponse = await res.json();

    if (!res.ok && !data.error) {
      return {
        success: false,
        error: DEFAULT_CONNECTION_ERROR,
      };
    }

    // Guard against raw technical errors leaking into participant UI
    if (data.error) {
      const lower = data.error.toLowerCase();
      if (
        data.error.includes('<') ||
        data.error.includes('<!') ||
        lower.includes('doctype') ||
        lower.includes('token') ||
        lower.includes('syntaxerror') ||
        lower.includes('not valid json')
      ) {
        data.error = DEFAULT_CONNECTION_ERROR;
      }
    }

    return data;
  } catch (err: any) {
    console.error('executeServerLuckyDipDraw request failure:', err);
    return {
      success: false,
      error: DEFAULT_CONNECTION_ERROR,
    };
  }
}

export async function checkServerStatus(): Promise<{
  status: string;
  service: string;
  supportedSites: SiteLocation[];
  tiers: PrizeTier[];
  algorithmReady: boolean;
  singaporeDate?: string;
}> {
  try {
    const res = await fetch('/api/lucky-dip/status');
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      throw new Error('Server status unavailable');
    }
    return await res.json();
  } catch {
    throw new Error('Server status unavailable');
  }
}

export async function validateParticipantOnServer(params: {
  nickname: string;
  mobileNumber: string;
  site: SiteLocation;
}): Promise<{
  valid: boolean;
  nickname?: string;
  normalizedMobile?: string;
  site?: SiteLocation;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch('/api/lucky-dip/validate-participant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        valid: false,
        error: DEFAULT_CONNECTION_ERROR,
      };
    }

    const data = await res.json();
    return data;
  } catch {
    return {
      valid: false,
      error: DEFAULT_CONNECTION_ERROR,
    };
  }
}
