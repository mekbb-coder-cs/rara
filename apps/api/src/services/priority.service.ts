import {
  HazardType,
  UrgencyLevel,
  ReportStatus,
} from '@relieflink/shared';
import { ReportRecord } from '../repositories/report.repository.js';
import { logger } from '../config/logger.js';

export interface PriorityBreakdown {
  finalScore: number;
  isOverride: boolean;
  formula: string;
  components: {
    severity: {
      raw: number;
      level: UrgencyLevel;
      weight: number;
      weighted: number;
    };
    peopleAffected: {
      count: number;
      score: number;
      weight: number;
      weighted: number;
    };
    vulnerabilities: {
      flags: string[];
      score: number;
      weight: number;
      weighted: number;
    };
    waitingTime: {
      hoursElapsed: number;
      score: number;
      weight: number;
      weighted: number;
    };
  };
  multipliers: {
    hazardType: {
      type: HazardType;
      factor: number;
    };
    verification: {
      status: string;
      factor: number;
    };
  };
  calculatedAt: string;
  overrideDetails?: {
    overrideScore: number;
    overrideReason: string;
  };
}

export interface PriorityCalculationResult {
  compositeScore: number;
  severityScore: number;
  peopleAffectedScore: number;
  vulnerabilityScore: number;
  waitingTimeScore: number;
  hazardWeight: number;
  verificationMultiplier: number;
  breakdown: PriorityBreakdown;
}

export const DEFAULT_PRIORITY_WEIGHTS = {
  weight_severity: 3.5,
  weight_people: 2.5,
  weight_vulnerability: 2.5,
  weight_waiting_time: 1.5,
  hazard_multipliers: {
    [HazardType.FIRE]: 1.4,
    [HazardType.STRUCTURE_COLLAPSE]: 1.4,
    [HazardType.FLOOD]: 1.3,
    [HazardType.MEDICAL]: 1.3,
    [HazardType.HAZMAT]: 1.2,
    [HazardType.ROAD_BLOCKED]: 1.1,
    [HazardType.MISSING_PERSON]: 1.1,
    [HazardType.FOOD_WATER]: 1.0,
    [HazardType.SHELTER]: 1.0,
    [HazardType.UTILITY_FAILURE]: 0.9,
    [HazardType.OTHER]: 0.8,
  },
  verification_multipliers: {
    UNVERIFIED: 0.4,
    CLUSTER_CORROBORATED: 0.7,
    PHONE_VERIFIED: 0.9,
    ON_SITE_VERIFIED: 1.0,
    DISPUTED: 0.2,
    REJECTED: 0.0,
  },
};

export class PriorityService {
  /**
   * Computes the deterministic, explainable priority score for a report
   */
  calculate(
    report: Pick<
      ReportRecord,
      | 'initialUrgency'
      | 'peopleAffectedCount'
      | 'vulnerableGroups'
      | 'hazardType'
      | 'status'
      | 'createdAt'
      | 'offlineCreatedAt'
      | 'manualOverrideScore'
      | 'manualOverrideReason'
    >,
    corroborationCount = 1,
    verificationMethod?: string,
    isDisputed = false,
    now: Date = new Date()
  ): PriorityCalculationResult {
    // 1. Raw Severity Score S in [1, 10]
    let S = 4;
    switch (report.initialUrgency) {
      case UrgencyLevel.LIFE_THREATENING:
        S = 10;
        break;
      case UrgencyLevel.CRITICAL:
        S = 8;
        break;
      case UrgencyLevel.HIGH:
        S = 6;
        break;
      case UrgencyLevel.MEDIUM:
        S = 4;
        break;
      case UrgencyLevel.LOW:
        S = 2;
        break;
      default:
        S = 4;
    }

    // 2. People Affected Transformation f(N) in [1, 10]
    // f(N) = min(10, 1 + 3 * log10(max(1, N)))
    const N = Math.max(1, report.peopleAffectedCount || 1);
    const f_N = Math.min(10, parseFloat((1 + 3 * Math.log10(N)).toFixed(2)));

    // 3. Vulnerability Score V in [0, 10]
    // Children +2.5, Elderly +2.5, Disabled +3.5, Pregnant +4.0
    let V_raw = 0;
    const groups = report.vulnerableGroups || [];
    for (const g of groups) {
      const lower = g.toLowerCase();
      if (lower.includes('child')) V_raw += 2.5;
      else if (lower.includes('elder')) V_raw += 2.5;
      else if (lower.includes('disable') || lower.includes('trap')) V_raw += 3.5;
      else if (lower.includes('pregnant') || lower.includes('medic')) V_raw += 4.0;
      else V_raw += 1.5;
    }
    const V = Math.min(10, V_raw);

    // 4. Waiting Time Factor g(T) in [0, 10]
    // g(T) = min(10, T_elapsed_hours / 4)
    const reportDate = report.offlineCreatedAt || report.createdAt || now;
    const diffMs = Math.max(0, now.getTime() - new Date(reportDate).getTime());
    const hoursElapsed = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));
    const g_T = Math.min(10, parseFloat((hoursElapsed / 4).toFixed(2)));

    // 5. Hazard Multiplier H in [0.8, 1.4]
    const H =
      DEFAULT_PRIORITY_WEIGHTS.hazard_multipliers[report.hazardType] ||
      DEFAULT_PRIORITY_WEIGHTS.hazard_multipliers[HazardType.OTHER];

    // 6. Verification Confidence Multiplier C in [0.0, 1.0]
    let C = DEFAULT_PRIORITY_WEIGHTS.verification_multipliers.UNVERIFIED;
    let verificationLabel = 'UNVERIFIED';

    if (report.status === ReportStatus.REJECTED) {
      C = DEFAULT_PRIORITY_WEIGHTS.verification_multipliers.REJECTED;
      verificationLabel = 'REJECTED';
    } else if (isDisputed) {
      C = DEFAULT_PRIORITY_WEIGHTS.verification_multipliers.DISPUTED;
      verificationLabel = 'DISPUTED';
    } else if (report.status === ReportStatus.VERIFIED || report.status === ReportStatus.PRIORITIZED || report.status === ReportStatus.IN_PROGRESS || report.status === ReportStatus.RESOLVED) {
      if (verificationMethod === 'ON_SITE_VISIT' || verificationMethod === 'OFFICIAL_AGENCY') {
        C = DEFAULT_PRIORITY_WEIGHTS.verification_multipliers.ON_SITE_VERIFIED;
        verificationLabel = 'ON_SITE_VERIFIED';
      } else {
        C = DEFAULT_PRIORITY_WEIGHTS.verification_multipliers.PHONE_VERIFIED;
        verificationLabel = 'PHONE_VERIFIED';
      }
    } else if (corroborationCount >= 2) {
      C = DEFAULT_PRIORITY_WEIGHTS.verification_multipliers.CLUSTER_CORROBORATED;
      verificationLabel = `CLUSTER_CORROBORATED (${corroborationCount} reports)`;
    }

    // Weighted base sum
    const w_s = DEFAULT_PRIORITY_WEIGHTS.weight_severity;
    const w_p = DEFAULT_PRIORITY_WEIGHTS.weight_people;
    const w_v = DEFAULT_PRIORITY_WEIGHTS.weight_vulnerability;
    const w_t = DEFAULT_PRIORITY_WEIGHTS.weight_waiting_time;

    const weightedSeverity = parseFloat((w_s * S).toFixed(2));
    const weightedPeople = parseFloat((w_p * f_N).toFixed(2));
    const weightedVulnerability = parseFloat((w_v * V).toFixed(2));
    const weightedWaiting = parseFloat((w_t * g_T).toFixed(2));

    const baseSum = weightedSeverity + weightedPeople + weightedVulnerability + weightedWaiting;

    // Composite Calculation: min(100, BaseSum * H * C)
    const computedScore = parseFloat(Math.min(100, Math.max(0, baseSum * H * C)).toFixed(1));

    // Handle Manual Override
    const isOverride =
      report.manualOverrideScore !== undefined && report.manualOverrideScore !== null;
    const finalScore = isOverride ? report.manualOverrideScore! : computedScore;

    const formulaString = `min(100, (${w_s}*${S} + ${w_p}*${f_N} + ${w_v}*${V} + ${w_t}*${g_T}) * ${H} * ${C})`;

    const breakdown: PriorityBreakdown = {
      finalScore,
      isOverride,
      formula: formulaString,
      components: {
        severity: {
          raw: S,
          level: report.initialUrgency,
          weight: w_s,
          weighted: weightedSeverity,
        },
        peopleAffected: {
          count: N,
          score: f_N,
          weight: w_p,
          weighted: weightedPeople,
        },
        vulnerabilities: {
          flags: groups,
          score: V,
          weight: w_v,
          weighted: weightedVulnerability,
        },
        waitingTime: {
          hoursElapsed,
          score: g_T,
          weight: w_t,
          weighted: weightedWaiting,
        },
      },
      multipliers: {
        hazardType: {
          type: report.hazardType,
          factor: H,
        },
        verification: {
          status: verificationLabel,
          factor: C,
        },
      },
      calculatedAt: now.toISOString(),
      ...(isOverride && {
        overrideDetails: {
          overrideScore: report.manualOverrideScore!,
          overrideReason: report.manualOverrideReason || 'Responder override',
        },
      }),
    };

    return {
      compositeScore: finalScore,
      severityScore: weightedSeverity,
      peopleAffectedScore: weightedPeople,
      vulnerabilityScore: weightedVulnerability,
      waitingTimeScore: weightedWaiting,
      hazardWeight: H,
      verificationMultiplier: C,
      breakdown,
    };
  }
}

export const priorityService = new PriorityService();
