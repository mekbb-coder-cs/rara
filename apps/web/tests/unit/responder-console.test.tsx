import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriageQueue } from '../../src/components/responder/TriageQueue';
import { VerificationModal } from '../../src/components/responder/VerificationModal';
import { PriorityBadge } from '../../src/components/responder/PriorityBadge';
import { TriageReportItem } from '../../src/lib/types';
import * as api from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  revealSensitiveDetails: vi.fn(),
  verifyReport: vi.fn(),
  updateReportStatus: vi.fn(),
  overridePriority: vi.fn(),
  requestMoreInfo: vi.fn(),
  assignResponder: vi.fn(),
  bulkActionReports: vi.fn(),
  fetchTriageQueue: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

describe('Responder Console & Triage Queue Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockReports: TriageReportItem[] = [
    {
      id: 'rep-uuid-1',
      trackingCode: 'RL-1001-AB',
      title: 'Biscayne Bay Rising Surge',
      description: 'Water breached residential sea wall, 4 trapped.',
      hazardType: 'FLOOD',
      status: 'SUBMITTED',
      severity: 'LIFE_THREATENING',
      approximateLocation: 'Brickell, Miami',
      latitude: 25.7617,
      longitude: -80.1918,
      peopleAffectedCount: 6,
      vulnerableGroups: ['elderly', 'children'],
      corroborationCount: 3,
      priorityScore: 88.5,
      priorityBreakdown: {
        severityScore: 35,
        peopleFactor: 18,
        vulnerabilityScore: 20,
        timeFactor: 8,
        baseSum: 81,
        hazardMultiplier: 1.1,
        confidenceMultiplier: 1.0,
        compositeScore: 88.5,
      },
      version: 1,
      assignedResponderId: 'responder-me-uuid',
      lockedById: null,
      lockedAt: null,
      verificationStatus: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'rep-uuid-2',
      trackingCode: 'RL-1002-CD',
      title: 'Downed Power Lines on Highway',
      description: 'Live electrical cables across highway exit.',
      hazardType: 'OTHER',
      status: 'SUBMITTED',
      severity: 'HIGH',
      approximateLocation: 'Miami Beach',
      latitude: 25.7906,
      longitude: -80.1300,
      peopleAffectedCount: 2,
      vulnerableGroups: [],
      corroborationCount: 1,
      priorityScore: 62.0,
      priorityBreakdown: {
        severityScore: 25,
        peopleFactor: 10,
        vulnerabilityScore: 0,
        timeFactor: 5,
        baseSum: 40,
        hazardMultiplier: 1.0,
        confidenceMultiplier: 1.0,
        compositeScore: 62.0,
      },
      version: 1,
      assignedResponderId: null,
      lockedById: null,
      lockedAt: null,
      verificationStatus: 'UNVERIFIED',
      createdAt: new Date().toISOString(),
    },
  ];

  it('renders triage queue with tracking codes, priority score badges and titles', () => {
    const onSelect = vi.fn();
    const onFiltersChange = vi.fn();

    render(
      <TriageQueue
        reports={mockReports}
        selectedReportId={null}
        onSelectReport={onSelect}
        filters={{ assignment: 'all', sortBy: 'priority', sortOrder: 'desc' }}
        onFiltersChange={onFiltersChange}
        onRefresh={vi.fn()}
        currentUserId="responder-me-uuid"
      />
    );

    expect(screen.getByText('RL-1001-AB')).toBeInTheDocument();
    expect(screen.getByText('Biscayne Bay Rising Surge')).toBeInTheDocument();
    expect(screen.getByText('RL-1002-CD')).toBeInTheDocument();
    expect(screen.getByText('Downed Power Lines on Highway')).toBeInTheDocument();
    expect(screen.getByText('P88.5')).toBeInTheDocument();
    expect(screen.getByText('P62.0')).toBeInTheDocument();
    expect(screen.getByText('+2 dupes')).toBeInTheDocument();
  });

  it('filters queue by assignment tabs (Assigned to Me vs Unassigned)', () => {
    const onFiltersChange = vi.fn();

    render(
      <TriageQueue
        reports={mockReports}
        selectedReportId={null}
        onSelectReport={vi.fn()}
        filters={{ assignment: 'all', sortBy: 'priority', sortOrder: 'desc' }}
        onFiltersChange={onFiltersChange}
        onRefresh={vi.fn()}
        currentUserId="responder-me-uuid"
      />
    );

    const assignedToMeBtn = screen.getByRole('button', { name: /assigned to me/i });
    fireEvent.click(assignedToMeBtn);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ assignment: 'assigned_to_me' })
    );

    const unassignedBtn = screen.getByRole('button', { name: /unassigned/i });
    fireEvent.click(unassignedBtn);

    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ assignment: 'unassigned' })
    );
  });

  it('displays explainable formula breakdown in PriorityBadge on click', () => {
    render(
      <PriorityBadge
        score={88.5}
        breakdown={mockReports[0].priorityBreakdown}
      />
    );

    const badgeBtn = screen.getByRole('button', { name: /priority score 88.5/i });
    fireEvent.click(badgeBtn);

    expect(screen.getByText(/Explainable Priority Formula/i)).toBeInTheDocument();
    expect(screen.getByText(/P = min\(100/i)).toBeInTheDocument();
    expect(screen.getByText(/Severity \(S\):/i)).toBeInTheDocument();
    expect(screen.getByText(/Hazard Mult \(H\):/i)).toBeInTheDocument();
  });

  it('unmasks sensitive PII in VerificationModal only on explicit request', async () => {
    (api.revealSensitiveDetails as any).mockResolvedValueOnce({
      exactAddress: '1250 Brickell Ave, Apt 1402',
      reporterPhone: '+13055558899',
      reporterName: 'Maria Rodriguez',
    });

    render(
      <VerificationModal
        report={mockReports[0]}
        isOpen={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        currentUserId="responder-me-uuid"
      />
    );

    expect(screen.getByText(/Sensitive PII/i)).toBeInTheDocument();
    expect(screen.getByText(/Reveal Contact Details \(Audited\)/i)).toBeInTheDocument();
    expect(screen.queryByText('1250 Brickell Ave, Apt 1402')).not.toBeInTheDocument();

    const revealBtn = screen.getByRole('button', { name: /reveal contact details/i });
    fireEvent.click(revealBtn);

    await waitFor(() => {
      expect(screen.getByText('1250 Brickell Ave, Apt 1402')).toBeInTheDocument();
      expect(screen.getByText('+13055558899')).toBeInTheDocument();
      expect(screen.getByText('Maria Rodriguez')).toBeInTheDocument();
    });

    expect(api.revealSensitiveDetails).toHaveBeenCalledWith('rep-uuid-1', undefined);
  });

  it('handles optimistic locking conflict (409) with prominent alert message', async () => {
    (api.verifyReport as any).mockRejectedValueOnce(
      new api.ApiError(
        'Someone else is currently handling or has already updated this case.',
        409,
        'CONCURRENT_MODIFICATION'
      )
    );

    render(
      <VerificationModal
        report={mockReports[0]}
        isOpen={true}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        currentUserId="responder-me-uuid"
      />
    );

    const reasonInput = screen.getByPlaceholderText(/state how verification was achieved/i);
    fireEvent.change(reasonInput, {
      target: { value: 'Spoke with resident on site.' },
    });

    const submitBtn = screen.getByRole('button', { name: /confirm verification/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Someone else is currently handling or has already updated this case/i)
      ).toBeInTheDocument();
    });
  });

  it('navigates triage queue using keyboard shortcuts (J/K/Enter)', () => {
    const onSelect = vi.fn();

    render(
      <TriageQueue
        reports={mockReports}
        selectedReportId={null}
        onSelectReport={onSelect}
        filters={{ assignment: 'all', sortBy: 'priority', sortOrder: 'desc' }}
        onFiltersChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    // Press 'J' to move down
    fireEvent.keyDown(window, { key: 'j' });
    // Press 'Enter' to open selected report
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalled();
  });
});
