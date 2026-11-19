import { RequestAnonymousTokenInput, AnonymousTrackingPayload } from '@relieflink/shared';
import { generateAnonymousToken, verifyAnonymousToken } from '../utils/crypto.js';
import { BadRequestError } from '../utils/errors.js';

export class AnonymousService {
  /**
   * Generates a tamper-proof short-lived signed tracking token for an anonymous reporter.
   * This allows the reporter's client to check the status of their incident without an account.
   */
  issueTrackingToken(input: RequestAnonymousTokenInput): { token: string; expiresIn: string } {
    if (!input.reportId || !input.trackingCode) {
      throw new BadRequestError('Report ID and tracking code are required');
    }

    const token = generateAnonymousToken({
      reportId: input.reportId,
      trackingCode: input.trackingCode,
    });

    return {
      token,
      expiresIn: '24h',
    };
  }

  /**
   * Validates the signed tracking token provided by the anonymous reporter.
   */
  verifyTrackingToken(token: string): AnonymousTrackingPayload {
    return verifyAnonymousToken(token);
  }
}

export const anonymousService = new AnonymousService();
