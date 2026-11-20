import { describe, it, expect, beforeEach } from 'vitest';
import { notificationService } from '../../src/services/notification.service.js';
import { coordinationRepository } from '../../src/repositories/coordination.repository.js';
import {
  NotificationType,
  NotificationChannel,
} from '@relieflink/shared';

describe('Notification Retry & Quiet Hours Unit Tests', () => {
  beforeEach(() => {
    // Fresh state
  });

  describe('Quiet Hours Logic', () => {
    it('should correctly identify if time is within daytime quiet hours', () => {
      // Range: 13:00 to 17:00
      expect(notificationService.isTimeInQuietHours('14:30', '13:00', '17:00')).toBe(true);
      expect(notificationService.isTimeInQuietHours('12:59', '13:00', '17:00')).toBe(false);
      expect(notificationService.isTimeInQuietHours('17:01', '13:00', '17:00')).toBe(false);
    });

    it('should correctly identify overnight quiet hours spanning midnight (22:00 -> 07:00)', () => {
      expect(notificationService.isTimeInQuietHours('23:15', '22:00', '07:00')).toBe(true);
      expect(notificationService.isTimeInQuietHours('03:45', '22:00', '07:00')).toBe(true);
      expect(notificationService.isTimeInQuietHours('06:59', '22:00', '07:00')).toBe(true);
      expect(notificationService.isTimeInQuietHours('07:01', '22:00', '07:00')).toBe(false);
      expect(notificationService.isTimeInQuietHours('15:00', '22:00', '07:00')).toBe(false);
    });

    it('NEVER silences or blocks CRITICAL alerts during quiet hours', () => {
      const midnight = new Date('2026-11-20T23:30:00');
      // Normal alert should be silenced
      const isNormalSilenced = notificationService.shouldSilenceForQuietHours(
        'NORMAL',
        '22:00',
        '07:00',
        midnight
      );
      expect(isNormalSilenced).toBe(true);

      // High alert should be silenced
      const isHighSilenced = notificationService.shouldSilenceForQuietHours(
        'HIGH',
        '22:00',
        '07:00',
        midnight
      );
      expect(isHighSilenced).toBe(true);

      // CRITICAL alert must NEVER be silenced
      const isCriticalSilenced = notificationService.shouldSilenceForQuietHours(
        'CRITICAL',
        '22:00',
        '07:00',
        midnight
      );
      expect(isCriticalSilenced).toBe(false);
    });
  });

  describe('Exponential Backoff Calculation', () => {
    it('computes exponential backoff delay correctly based on attempt count', () => {
      expect(notificationService.calculateBackoff(1)).toBe(1000); // 1000 * 2^0
      expect(notificationService.calculateBackoff(2)).toBe(2000); // 1000 * 2^1
      expect(notificationService.calculateBackoff(3)).toBe(4000); // 1000 * 2^2
      expect(notificationService.calculateBackoff(4)).toBe(8000); // 1000 * 2^3
    });
  });

  describe('Retry & Delivery Log Recording', () => {
    it('records successful delivery on first try when transmission succeeds', async () => {
      const result = await notificationService.deliverWithRetry({
        notificationId: 'notif-test-1',
        channel: NotificationChannel.SMS,
        recipient: '+251-91-411-2233',
        type: NotificationType.HELP_ASSIGNED,
        title: 'Responder Dispatched',
        body: 'Aid team is on the way.',
        priority: 'HIGH',
        maxRetries: 3,
      });

      expect(result.status).toBe('SENT');
      expect(result.attempts).toBe(1);
      expect(result.deliveredAt).toBeDefined();

      const logs = await coordinationRepository.listDeliveryLogs('notif-test-1');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].status).toBe('SENT');
    });

    it('retries on failure and marks FAILED after exhausting maxRetries', async () => {
      const result = await notificationService.deliverWithRetry({
        notificationId: 'notif-test-fail-1',
        channel: NotificationChannel.SMS,
        recipient: '+251-91-499-9999',
        type: NotificationType.REPORT_RECEIVED,
        title: 'Report Received',
        body: 'Report received.',
        priority: 'NORMAL',
        maxRetries: 3,
        simulateFailureAttempts: 3, // all 3 attempts fail
      });

      expect(result.status).toBe('FAILED');
      expect(result.attempts).toBe(3);
      expect(result.lastError).toContain('Sandbox gateway connection timeout');
    });

    it('succeeds after transient failure when within retry budget', async () => {
      const result = await notificationService.deliverWithRetry({
        notificationId: 'notif-test-retry-ok',
        channel: NotificationChannel.EMAIL,
        recipient: 'responder@tigray-aid.org',
        type: NotificationType.TASK_ASSIGNED,
        title: 'Task Assigned',
        body: 'You have a new mission.',
        priority: 'HIGH',
        maxRetries: 3,
        simulateFailureAttempts: 1, // attempt 1 fails, attempt 2 succeeds
      });

      expect(result.status).toBe('SENT');
      expect(result.attempts).toBe(2);
      expect(result.deliveredAt).toBeDefined();
    });
  });
});
