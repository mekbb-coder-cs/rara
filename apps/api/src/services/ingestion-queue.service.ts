import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';
import { ReportFormData } from '@relieflink/shared';

export interface QueuedSubmissionItem {
  id: string;
  trackingCode: string;
  payload: ReportFormData;
  submittedAt: Date;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export class IngestionQueueService extends EventEmitter {
  private queue: QueuedSubmissionItem[] = [];
  private isProcessing = false;
  private maxQueueSize = 5000;
  private concurrencyLimit = 10;
  private activeWorkers = 0;
  private isDegradedMode = false;

  constructor() {
    super();
    // Monitor event loop and memory for automatic backpressure
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.checkSystemPressure(), 5000);
    }
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isOverloaded(): boolean {
    return this.queue.length > 500 || this.isDegradedMode;
  }

  public setDegradedMode(enabled: boolean): void {
    this.isDegradedMode = enabled;
    logger.warn({ degraded: enabled }, 'System degradation mode changed');
  }

  public getDegradedMode(): boolean {
    return this.isDegradedMode;
  }

  /**
   * Enqueues an emergency report under high load backpressure.
   * Returns immediately with trackingCode so citizen client is not blocked.
   */
  public enqueue(payload: ReportFormData): { trackingCode: string; queued: boolean } {
    const trackingCode = `RL-TIG-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
    const id = `queued-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    if (this.queue.length >= this.maxQueueSize) {
      logger.error('Ingestion queue saturated! Dropping least critical or applying backpressure.');
      throw new Error('Server under extreme disaster load. Please retry in 10 seconds or save in offline queue.');
    }

    const item: QueuedSubmissionItem = {
      id,
      trackingCode,
      payload,
      submittedAt: new Date(),
      status: 'PENDING',
    };

    this.queue.push(item);
    this.emit('enqueued', item);

    // Trigger asynchronous queue drain
    setImmediate(() => this.processNext());

    return { trackingCode, queued: true };
  }

  public async processNext(): Promise<void> {
    if (this.isProcessing || this.activeWorkers >= this.concurrencyLimit || this.queue.length === 0) {
      return;
    }

    const item = this.queue.find((q) => q.status === 'PENDING');
    if (!item) return;

    item.status = 'PROCESSING';
    this.activeWorkers++;

    try {
      this.emit('process', item);
      item.status = 'COMPLETED';
    } catch (err: any) {
      item.status = 'FAILED';
      item.error = err.message;
      logger.error({ err, id: item.id }, 'Failed to process queued emergency report');
    } finally {
      this.activeWorkers--;
      // Clean completed items older than 60s
      this.queue = this.queue.filter((q) => q.status === 'PENDING' || Date.now() - q.submittedAt.getTime() < 60000);
      if (this.queue.some((q) => q.status === 'PENDING')) {
        setImmediate(() => this.processNext());
      }
    }
  }

  private checkSystemPressure(): void {
    const memory = process.memoryUsage();
    const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
    // If heap exceeds 800MB, enter degraded mode automatically to conserve memory
    if (heapUsedMb > 800 && !this.isDegradedMode) {
      this.isDegradedMode = true;
      logger.warn({ heapUsedMb }, 'High memory pressure detected. Activating graceful degradation mode.');
    } else if (heapUsedMb < 600 && this.isDegradedMode) {
      this.isDegradedMode = false;
      logger.info({ heapUsedMb }, 'Memory pressure normalized. Deactivating degradation mode.');
    }
  }
}

export const ingestionQueue = new IngestionQueueService();
