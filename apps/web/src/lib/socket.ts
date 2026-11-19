'use client';

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

export function getSocket(token?: string): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      auth: token ? { token } : undefined,
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  } else if (token) {
    socket.auth = { token };
  }

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function subscribeToRegion(regionId: string, token?: string): () => void {
  const s = getSocket(token);
  s.emit('join:region', regionId);

  return () => {
    s.emit('leave:region', regionId);
  };
}

export function subscribeToReport(reportId: string, token?: string): () => void {
  const s = getSocket(token);
  s.emit('join:report', reportId);

  return () => {
    s.emit('leave:report', reportId);
  };
}

export interface SocketReportCreatedEvent {
  reportId: string;
  trackingCode: string;
  hazardType: string;
  initialUrgency: string;
  regionId?: string;
  createdAt: string;
}

export interface SocketReportStatusEvent {
  reportId: string;
  trackingCode: string;
  oldStatus: string;
  newStatus: string;
  regionId?: string;
  updatedBy: string;
  version: number;
}

export interface SocketPriorityUpdatedEvent {
  reportId: string;
  compositeScore: number;
  breakdown: any;
  regionId?: string;
}

export interface SocketReportLockedEvent {
  reportId: string;
  lockedById: string;
  regionId?: string;
}

export interface SocketReportUnlockedEvent {
  reportId: string;
  regionId?: string;
}
