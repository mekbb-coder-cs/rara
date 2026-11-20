import { AuditLogFilter, AuditLogItem, AfterActionReportSummary } from '@relieflink/shared';
import { auditRepository, AuditLogRecord } from '../repositories/audit.repository.js';
import { userRepository, InMemoryUserRepository } from '../repositories/user.repository.js';

export class AuditService {
  async getAuditLogs(filter: AuditLogFilter = {}): Promise<AuditLogItem[]> {
    const rawLogs = await auditRepository.getLogs({
      userId: filter.userId,
      action: filter.action as any,
      entityName: filter.entityName,
      limit: filter.limit || 100,
    });

    let filtered = rawLogs;
    if (filter.startDate) {
      const start = new Date(filter.startDate).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= start);
    }
    if (filter.endDate) {
      const end = new Date(filter.endDate).getTime();
      filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= end);
    }

    return filtered.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.userId ? `User-${l.userId.slice(0, 8)}` : 'System',
      userRole: l.userRole ? String(l.userRole) : null,
      action: String(l.action),
      entityName: l.entityName,
      entityId: l.entityId,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      metadata: l.metadata,
      timestamp: l.timestamp.toISOString(),
    }));
  }

  /**
   * Generates standard CSV format for audit log export
   */
  async exportAuditLogsToCsv(filter: AuditLogFilter = {}): Promise<string> {
    const logs = await this.getAuditLogs(filter);
    const headers = [
      'Timestamp',
      'ActorID',
      'Role',
      'Action',
      'Entity',
      'EntityID',
      'Details',
      'IPAddress',
    ];

    const escapeCsv = (str: string | null | undefined): string => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = logs.map((log) => {
      const details = log.metadata ? JSON.stringify(log.metadata) : '';
      return [
        escapeCsv(log.timestamp),
        escapeCsv(log.userId || 'SYSTEM'),
        escapeCsv(log.userRole || 'N/A'),
        escapeCsv(log.action),
        escapeCsv(log.entityName),
        escapeCsv(log.entityId),
        escapeCsv(details),
        escapeCsv(log.ipAddress || 'internal'),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Generates standard CSV format for After-Action Report
   */
  exportAfterActionReportToCsv(report: AfterActionReportSummary): string {
    const lines: string[] = [];

    lines.push(`"AFTER-ACTION CRISIS REPORT: ${report.title}"`);
    lines.push(`"Region","${report.regionName} (${report.regionId})"`);
    lines.push(`"Period","${report.startDate} to ${report.endDate}"`);
    lines.push(`"Total Incidents","${report.totalIncidents}"`);
    lines.push(`"Verified Incidents","${report.verifiedIncidents}"`);
    lines.push(`"Resolved Incidents","${report.resolvedIncidents}"`);
    lines.push(`"Avg Time to Verify (mins)","${report.avgTimeToVerifyMinutes}"`);
    lines.push(`"Avg Time to Resolve (mins)","${report.avgTimeToResolveMinutes}"`);
    lines.push(`"Aid Fulfilment Rate","${report.aidFulfilmentPercentage}%"`);
    lines.push('');
    lines.push('"RESOURCE EXPENDITURE"');
    lines.push('"Aid Type","Quantity","Unit"');
    for (const r of report.resourceExpenditure) {
      lines.push(`"${r.aidType}","${r.quantity}","${r.unit}"`);
    }
    lines.push('');
    lines.push('"CHRONOLOGICAL TIMELINE OF CRITICAL EVENTS"');
    lines.push('"Time","Event","Details"');
    for (const ev of report.timelineEvents) {
      lines.push(`"${ev.time}","${ev.event}","${ev.details.replace(/"/g, '""')}"`);
    }

    return lines.join('\n');
  }
}

export const auditService = new AuditService();
