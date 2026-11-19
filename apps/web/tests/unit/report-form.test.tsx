import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportWizard } from '../../src/components/report/ReportWizard';
import { I18nProvider } from '../../src/context/I18nContext';
import { NetworkProvider } from '../../src/context/NetworkContext';
import * as api from '../../src/lib/api';

vi.mock('../../src/lib/api', () => ({
  submitReport: vi.fn(),
  syncOfflineBatch: vi.fn(),
  fetchPublicFeed: vi.fn().mockResolvedValue([]),
  fetchReportTimeline: vi.fn(),
}));

vi.mock('../../src/lib/db', () => ({
  saveOfflineReport: vi.fn().mockResolvedValue({
    localId: 'RL-OFFLINE-TEST-1234',
    payload: {},
    createdAt: new Date().toISOString(),
    status: 'PENDING',
  }),
  getPendingOfflineReports: vi.fn().mockResolvedValue([]),
  markReportSynced: vi.fn().mockResolvedValue(undefined),
  countPendingReports: vi.fn().mockResolvedValue(0),
}));

describe('ReportWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderWizard = () =>
    render(
      <I18nProvider>
        <NetworkProvider>
          <ReportWizard />
        </NetworkProvider>
      </I18nProvider>
    );

  it('renders Step 1 by default and shows incident types', () => {
    renderWizard();
    expect(screen.getByText('What happened?')).toBeInTheDocument();
    expect(screen.getByText('Flood / Water Rising')).toBeInTheDocument();
    expect(screen.getByText('Fire / Smoke')).toBeInTheDocument();
  });

  it('validates minimum description length before proceeding to Step 2', () => {
    renderWizard();

    // Click Continue without description
    const nextButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(nextButton);

    expect(
      screen.getByText(/Please provide a brief description of what is happening/i)
    ).toBeInTheDocument();

    // Fill valid description
    const descInput = screen.getByLabelText(/Detailed Description of the Situation/i);
    fireEvent.change(descInput, { target: { value: 'Severe river flooding entered residential homes.' } });

    fireEvent.click(nextButton);

    // Should now be on Step 2
    expect(screen.getByText('Where is help needed?')).toBeInTheDocument();
  });

  it('validates address requirement on Step 2', () => {
    renderWizard();

    // Pass Step 1
    const descInput = screen.getByLabelText(/Detailed Description of the Situation/i);
    fireEvent.change(descInput, { target: { value: 'Severe river flooding entered residential homes.' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // On Step 2: Try to continue with empty address
    const addressInput = screen.getByLabelText(/Street Address or Landmark/i);
    fireEvent.change(addressInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/Please provide an address/i)).toBeInTheDocument();

    // Fill address
    fireEvent.change(addressInput, { target: { value: '450 Biscayne Blvd, Miami FL' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Should now be on Step 3
    expect(screen.getByText('How urgent is this?')).toBeInTheDocument();
  });

  it('navigates through all 4 steps and submits successfully, showing tracking code', async () => {
    vi.mocked(api.submitReport).mockResolvedValue({
      success: true,
      trackingCode: 'RL-9921-88',
      savedOffline: false,
    });

    renderWizard();

    // Step 1
    fireEvent.change(screen.getByLabelText(/Detailed Description/i), {
      target: { value: 'Rising flood waters trapping 4 residents on roof.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2
    fireEvent.change(screen.getByLabelText(/Street Address/i), {
      target: { value: '120 NW 8th St, Downtown' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 3
    // Select Vulnerable Groups
    const childrenCheckbox = screen.getByLabelText(/Children/i);
    fireEvent.click(childrenCheckbox);
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 4
    expect(screen.getByText('Verification & Contact')).toBeInTheDocument();

    // Submit Report
    const submitButton = screen.getByRole('button', { name: /Submit Emergency Report/i });
    fireEvent.click(submitButton);

    // Verify Success Screen
    await waitFor(() => {
      expect(screen.getByText('Emergency Report Received')).toBeInTheDocument();
      expect(screen.getByText('RL-9921-88')).toBeInTheDocument();
      expect(screen.getByText(/What Happens Next/i)).toBeInTheDocument();
    });
  });

  it('displays offline saved screen when submitted without internet connection', async () => {
    vi.mocked(api.submitReport).mockResolvedValue({
      success: true,
      trackingCode: 'RL-OFFLINE-9900-AB',
      savedOffline: true,
    });

    renderWizard();

    // Step 1
    fireEvent.change(screen.getByLabelText(/Detailed Description/i), {
      target: { value: 'Power pole fallen, road blocked completely.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 2
    fireEvent.change(screen.getByLabelText(/Street Address/i), {
      target: { value: 'Highway 1 Mile Marker 40' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 3
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Step 4
    const submitButton = screen.getByRole('button', { name: /Submit Emergency Report/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Saved Offline for Synchronization')).toBeInTheDocument();
      expect(screen.getByText('RL-OFFLINE-9900-AB')).toBeInTheDocument();
      expect(screen.getByText(/No internet connection was detected/i)).toBeInTheDocument();
    });
  });
});
