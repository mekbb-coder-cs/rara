import { describe, it, expect } from 'vitest';
import {
  validateReportTransition,
  assertValidReportTransition,
} from '../../src/services/stateMachine.js';
import { ReportStatus } from '@relieflink/shared';
import { BadRequestError } from '../../src/utils/errors.js';

describe('Report Lifecycle State Machine Unit Tests', () => {
  it('should allow valid transitions through complete lifecycle', () => {
    // SUBMITTED -> UNDER_REVIEW -> VERIFIED -> PRIORITIZED -> MATCHED -> IN_PROGRESS -> RESOLVED -> CLOSED
    expect(validateReportTransition(ReportStatus.SUBMITTED, ReportStatus.UNDER_REVIEW)).toBe(true);
    expect(validateReportTransition(ReportStatus.UNDER_REVIEW, ReportStatus.VERIFIED)).toBe(true);
    expect(validateReportTransition(ReportStatus.VERIFIED, ReportStatus.PRIORITIZED)).toBe(true);
    expect(validateReportTransition(ReportStatus.PRIORITIZED, ReportStatus.MATCHED)).toBe(true);
    expect(validateReportTransition(ReportStatus.MATCHED, ReportStatus.IN_PROGRESS)).toBe(true);
    expect(validateReportTransition(ReportStatus.IN_PROGRESS, ReportStatus.RESOLVED)).toBe(true);
    expect(validateReportTransition(ReportStatus.RESOLVED, ReportStatus.CLOSED)).toBe(true);
  });

  it('should allow rejection from SUBMITTED or UNDER_REVIEW', () => {
    expect(validateReportTransition(ReportStatus.SUBMITTED, ReportStatus.REJECTED)).toBe(true);
    expect(validateReportTransition(ReportStatus.UNDER_REVIEW, ReportStatus.REJECTED)).toBe(true);
  });

  it('should allow appeal and reopening from REJECTED to UNDER_REVIEW', () => {
    expect(validateReportTransition(ReportStatus.REJECTED, ReportStatus.UNDER_REVIEW)).toBe(true);
  });

  it('should reject invalid transitions and throw BadRequestError', () => {
    // Skipping required human verification: SUBMITTED -> RESOLVED is forbidden
    expect(validateReportTransition(ReportStatus.SUBMITTED, ReportStatus.RESOLVED)).toBe(false);
    expect(() =>
      assertValidReportTransition(ReportStatus.SUBMITTED, ReportStatus.RESOLVED)
    ).toThrow(BadRequestError);

    // SUBMITTED -> MATCHED is forbidden without verification
    expect(validateReportTransition(ReportStatus.SUBMITTED, ReportStatus.MATCHED)).toBe(false);
    expect(() =>
      assertValidReportTransition(ReportStatus.SUBMITTED, ReportStatus.MATCHED)
    ).toThrow(BadRequestError);

    // CLOSED -> RESOLVED is forbidden
    expect(validateReportTransition(ReportStatus.CLOSED, ReportStatus.RESOLVED)).toBe(false);
  });

  it('should treat self-transitions as valid no-ops', () => {
    expect(validateReportTransition(ReportStatus.VERIFIED, ReportStatus.VERIFIED)).toBe(true);
    expect(validateReportTransition(ReportStatus.UNDER_REVIEW, ReportStatus.UNDER_REVIEW)).toBe(true);
  });
});
