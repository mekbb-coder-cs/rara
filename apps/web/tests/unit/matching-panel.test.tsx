import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MatchingPanel } from '../../src/components/responder/MatchingPanel';
import * as api from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  listAidNeeds: vi.fn(),
  getCandidateMatches: vi.fn(),
  createAidNeed: vi.fn(),
  confirmMatch: vi.fn(),
  escalateNeed: vi.fn(),
}));

describe('MatchingPanel Component Unit Tests', () => {
  const mockNeed = {
    id: 'need-123',
    reportId: 'rep-456',
    aidType: 'FOOD_WATER' as const,
    quantityRequired: 50,
    quantityFulfilled: 0,
    unit: 'water boxes',
    urgency: 'URGENT' as const,
    status: 'OPEN' as const,
    latitude: 13.4967,
    longitude: 39.4753,
    isEscalated: false,
    createdAt: new Date().toISOString(),
  };

  const mockCandidate = {
    offerId: 'offer-789',
    organizationId: 'org-ercs',
    organizationName: 'Ethiopian Red Cross Society - Tigray Branch',
    providerReliabilityScore: 0.95,
    aidType: 'FOOD_WATER' as const,
    title: 'Purified Water Storage Depot',
    capacityAvailable: 100,
    capacityTotal: 100,
    unit: 'water boxes',
    latitude: 13.51,
    longitude: 39.48,
    distanceKm: 2.5,
    estimatedTravelMinutes: 19,
    compatibilityScore: 92.5,
    scoreBreakdown: {
      typeFitScore: 30,
      distanceScore: 23,
      capacityScore: 20,
      reliabilityScore: 14.5,
      urgencyMultiplier: 1.2,
      estimatedDistanceKm: 2.5,
      estimatedTravelMinutes: 19,
      compositeScore: 92.5,
      reasons: ['Exact type match: FOOD_WATER', 'Within 2.5 km', '100% capacity available'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listAidNeeds).mockResolvedValue([mockNeed]);
    vi.mocked(api.getCandidateMatches).mockResolvedValue({
      need: mockNeed,
      candidates: [mockCandidate],
      noMatchFound: false,
      candidateCount: 1,
    });
  });

  it('renders ranked candidate offer with match score badge and distance', async () => {
    render(
      <MatchingPanel
        reportId="rep-456"
        reportTitle="Ayder Subcity Flooding"
        reportTrackingCode="RL-8822-MK"
        reportLatitude={13.4967}
        reportLongitude={39.4753}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Purified Water Storage Depot/i)).toBeInTheDocument();
      expect(screen.getByText(/92.5% Match/i)).toBeInTheDocument();
      expect(screen.getByText(/Ethiopian Red Cross Society/i)).toBeInTheDocument();
      expect(screen.getByText(/2.5 km away/i)).toBeInTheDocument();
    });
  });

  it('confirms suggested match and displays confirmation feedback', async () => {
    vi.mocked(api.confirmMatch).mockResolvedValue({
      id: 'match-res-1',
      status: 'PENDING_PROVIDER',
      matchedQuantity: 50,
    });

    render(
      <MatchingPanel
        reportId="rep-456"
        reportTitle="Ayder Subcity Flooding"
        reportTrackingCode="RL-8822-MK"
        reportLatitude={13.4967}
        reportLongitude={39.4753}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm Match/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Match/i }));

    await waitFor(() => {
      expect(api.confirmMatch).toHaveBeenCalledWith({
        needId: 'need-123',
        offerId: 'offer-789',
        requestedQuantity: 50,
        timeoutMinutes: 60,
      });
      expect(screen.getByText(/Match confirmed! Stock reserved/i)).toBeInTheDocument();
    });
  });

  it('allows escalating need to emergency coordinator with reason', async () => {
    vi.mocked(api.escalateNeed).mockResolvedValue({
      ...mockNeed,
      isEscalated: true,
      status: 'ESCALATED_TO_COORDINATOR' as any,
    });

    render(
      <MatchingPanel
        reportId="rep-456"
        reportTitle="Ayder Subcity Flooding"
        reportTrackingCode="RL-8822-MK"
        reportLatitude={13.4967}
        reportLongitude={39.4753}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Escalate to Coordinator/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Escalate to Coordinator/i));

    // Fill escalation reason in modal
    const textarea = screen.getByPlaceholderText(/e.g. Local water supply depots/i);
    fireEvent.change(textarea, {
      target: { value: 'Local depots empty; need regional tanker from Mekelle.' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Escalation/i }));

    await waitFor(() => {
      expect(api.escalateNeed).toHaveBeenCalledWith(
        'need-123',
        'Local depots empty; need regional tanker from Mekelle.'
      );
      expect(
        screen.getByText(/Need successfully escalated to emergency coordinators/i)
      ).toBeInTheDocument();
    });
  });
});
