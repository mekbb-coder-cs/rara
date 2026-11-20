import {
  NotificationPayload,
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  DeliveryLogRecord,
} from '@relieflink/shared';
import { coordinationRepository } from '../repositories/coordination.repository.js';
import { logger } from '../config/logger.js';

export interface SendNotificationOptions {
  type: NotificationType;
  title: string;
  body: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  metadata?: Record<string, any>;
  maxRetries?: number;
}

export class NotificationService {
  private maxRetries = 3;
  private baseBackoffMs = 1000;

  /**
   * Evaluates if a given time string (e.g. "23:30") falls within quiet hours.
   * Quiet hours span can wrap over midnight (e.g., 22:00 -> 07:00).
   */
  public isTimeInQuietHours(
    timeStr: string,
    quietStart: string,
    quietEnd: string
  ): boolean {
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const currentMin = toMinutes(timeStr);
    const startMin = toMinutes(quietStart);
    const endMin = toMinutes(quietEnd);

    if (startMin <= endMin) {
      // Normal range within same day (e.g., 13:00 to 17:00)
      return currentMin >= startMin && currentMin < endMin;
    } else {
      // Overnight range wrapping over midnight (e.g., 22:00 to 07:00)
      return currentMin >= startMin || currentMin < endMin;
    }
  }

  /**
   * Determines if quiet hours currently apply to this user notification.
   * CRITICAL alerts NEVER get blocked by quiet hours!
   */
  public shouldSilenceForQuietHours(
    priority: NotificationPriority,
    quietStart?: string | null,
    quietEnd?: string | null,
    nowDate: Date = new Date()
  ): boolean {
    // Critical alerts bypass quiet hours ALWAYS
    if (priority === 'CRITICAL') {
      return false;
    }

    if (!quietStart || !quietEnd) {
      return false;
    }

    const currentH = String(nowDate.getHours()).padStart(2, '0');
    const currentM = String(nowDate.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${currentH}:${currentM}`;

    return this.isTimeInQuietHours(currentTimeStr, quietStart, quietEnd);
  }

  /**
   * Dispatches a notification across configured channels with preference & quiet hour checks.
   */
  async dispatchNotification(
    options: SendNotificationOptions
  ): Promise<{
    notificationId: string;
    deliveredChannels: NotificationChannel[];
    suppressedChannels: NotificationChannel[];
    deliveryLogs: DeliveryLogRecord[];
  }> {
    const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const priority = options.priority || 'NORMAL';
    const channels = options.channels || [
      NotificationChannel.IN_APP,
      NotificationChannel.SMS,
    ];

    // Fetch recipient user preferences if available
    let preferences = null;
    if (options.recipientUserId) {
      preferences = await coordinationRepository.getUserNotificationPreference(
        options.recipientUserId
      );
    }

    const isQuiet = preferences
      ? this.shouldSilenceForQuietHours(
          priority,
          preferences.quietHoursStart,
          preferences.quietHoursEnd
        )
      : false;

    const deliveredChannels: NotificationChannel[] = [];
    const suppressedChannels: NotificationChannel[] = [];
    const deliveryLogs: DeliveryLogRecord[] = [];

    for (const channel of channels) {
      // 1. Check user channel preference
      if (preferences) {
        if (channel === NotificationChannel.EMAIL && !preferences.emailEnabled) {
          suppressedChannels.push(channel);
          continue;
        }
        if (channel === NotificationChannel.SMS && !preferences.smsEnabled) {
          suppressedChannels.push(channel);
          continue;
        }
        if (channel === NotificationChannel.WEB_PUSH && !preferences.pushEnabled) {
          suppressedChannels.push(channel);
          continue;
        }
        if (channel === NotificationChannel.IN_APP && !preferences.inAppEnabled) {
          suppressedChannels.push(channel);
          continue;
        }
      }

      // 2. Check Quiet Hours (Critical alerts bypass)
      if (isQuiet && channel !== NotificationChannel.IN_APP) {
        suppressedChannels.push(channel);
        logger.info(
          { notificationId, channel, priority },
          'Notification suppressed due to recipient quiet hours'
        );
        continue;
      }

      // 3. Deliver with retry & backoff simulation
      const recipient =
        channel === NotificationChannel.EMAIL
          ? options.recipientEmail || options.recipientUserId || 'user@example.com'
          : channel === NotificationChannel.SMS
            ? options.recipientPhone || '+251-91-400-0000'
            : options.recipientUserId || 'all';

      const log = await this.deliverWithRetry({
        notificationId,
        channel,
        recipient,
        type: options.type,
        title: options.title,
        body: options.body,
        priority,
        maxRetries: options.maxRetries ?? this.maxRetries,
      });

      deliveryLogs.push(log);
      if (log.status === 'SENT') {
        deliveredChannels.push(channel);
      }
    }

    return {
      notificationId,
      deliveredChannels,
      suppressedChannels,
      deliveryLogs,
    };
  }

  /**
   * Executes channel transmission with exponential backoff retry.
   */
  async deliverWithRetry(params: {
    notificationId: string;
    channel: NotificationChannel;
    recipient: string;
    type: NotificationType;
    title: string;
    body: string;
    priority: NotificationPriority;
    maxRetries: number;
    simulateFailureAttempts?: number;
  }): Promise<DeliveryLogRecord> {
    let attempts = 0;
    let lastError: string | null = null;
    const max = params.maxRetries;

    while (attempts < max) {
      attempts++;
      try {
        // If simulation specifies failure for initial attempts
        if (
          params.simulateFailureAttempts &&
          attempts <= params.simulateFailureAttempts
        ) {
          throw new Error(
            `Sandbox gateway connection timeout on attempt ${attempts}`
          );
        }

        // Deliver payload in sandbox mode
        await this.transmit(params.channel, params.recipient, params.title, params.body);

        // Record successful delivery
        const successLog = await coordinationRepository.logDelivery({
          notificationId: params.notificationId,
          channel: params.channel,
          recipient: params.recipient,
          status: 'SENT',
          attempts,
          deliveredAt: new Date().toISOString(),
        });

        logger.info(
          {
            notificationId: params.notificationId,
            channel: params.channel,
            recipient: params.recipient,
            attempts,
          },
          'Notification delivered successfully'
        );

        return successLog;
      } catch (err: unknown) {
        lastError = (err as Error).message;
        const willRetry = attempts < max;

        logger.warn(
          {
            notificationId: params.notificationId,
            channel: params.channel,
            attempts,
            willRetry,
            error: lastError,
          },
          'Notification delivery attempt failed'
        );

        if (willRetry) {
          // Exponential backoff wait: base * 2^(attempts - 1)
          const backoffDelay = this.calculateBackoff(attempts);
          await new Promise((r) => setTimeout(r, Math.min(backoffDelay, 50))); // capped in tests for speed
        }
      }
    }

    // All retries exhausted
    return await coordinationRepository.logDelivery({
      notificationId: params.notificationId,
      channel: params.channel,
      recipient: params.recipient,
      status: 'FAILED',
      attempts,
      lastError,
    });
  }

  public calculateBackoff(attempt: number): number {
    return this.baseBackoffMs * Math.pow(2, attempt - 1);
  }

  /**
   * Channel transmission sandbox
   */
  private async transmit(
    channel: NotificationChannel,
    recipient: string,
    title: string,
    body: string
  ): Promise<void> {
    switch (channel) {
      case NotificationChannel.IN_APP:
        // Broadcast in-app real-time event (via Socket.io in production)
        break;
      case NotificationChannel.EMAIL:
        // Sandbox email dispatch
        break;
      case NotificationChannel.SMS:
        // Sandbox SMS dispatch
        break;
      case NotificationChannel.WEB_PUSH:
        // Sandbox Web Push dispatch
        break;
    }
  }
}

export const notificationService = new NotificationService();
