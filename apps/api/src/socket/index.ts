import { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Role } from '@relieflink/shared';

let io: SocketIOServer | null = null;

interface SocketUser {
  userId: string;
  email?: string;
  role: Role;
  assignedRegions?: string[];
}

export function initSocketServer(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: [env.CORS_ORIGIN, 'http://localhost:3000'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket: Socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      // Allow anonymous client connections for public tracking
      socket.data.isAnonymous = true;
      return next();
    }

    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
      socket.data.user = {
        userId: decoded.sub || decoded.userId,
        email: decoded.email,
        role: decoded.role,
        assignedRegions: decoded.assignedRegions || [],
      };
      socket.data.isAnonymous = false;
      return next();
    } catch {
      socket.data.isAnonymous = true;
      return next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const user: SocketUser | undefined = socket.data.user;
    logger.debug({ socketId: socket.id, userId: user?.userId }, 'Socket client connected');

    // Automatically join user personal room and assigned responder rooms
    if (user) {
      socket.join(`user:${user.userId}`);

      if (
        user.role === Role.RESPONDER ||
        user.role === Role.COORDINATOR ||
        user.role === Role.ADMIN
      ) {
        socket.join('responders:all');
        if (user.assignedRegions) {
          user.assignedRegions.forEach((regId) => {
            socket.join(`responders:${regId}`);
          });
        }
      }
    }

    // Client subscribes to a specific region
    socket.on('subscribe:region', (data: { regionId: string }) => {
      if (data?.regionId) {
        socket.join(`region:${data.regionId}`);
        if (
          user &&
          (user.role === Role.RESPONDER ||
            user.role === Role.COORDINATOR ||
            user.role === Role.ADMIN)
        ) {
          socket.join(`responders:${data.regionId}`);
        }
      }
    });

    // Client tracks a specific incident report
    socket.on('subscribe:report', (data: { reportId?: string; trackingCode?: string }) => {
      if (data?.reportId) socket.join(`report:${data.reportId}`);
      if (data?.trackingCode) socket.join(`report:${data.trackingCode}`);
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'Socket client disconnected');
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function broadcastReportCreated(report: any, regionId?: string | null) {
  if (!io) return;
  // Broadcast to public region channel
  if (regionId) {
    io.to(`region:${regionId}`).emit('report:created', { report });
    io.to(`responders:${regionId}`).emit('report:created', { report });
  }
  // Also broadcast to general responders
  io.to('responders:all').emit('report:created', { report });
}

export function broadcastReportStatusChanged(params: {
  reportId: string;
  trackingCode: string;
  oldStatus: string;
  newStatus: string;
  regionId?: string | null;
  updatedBy?: string;
  version: number;
}) {
  if (!io) return;
  const payload = {
    reportId: params.reportId,
    trackingCode: params.trackingCode,
    oldStatus: params.oldStatus,
    newStatus: params.newStatus,
    updatedBy: params.updatedBy,
    version: params.version,
    timestamp: new Date().toISOString(),
  };

  io.to(`report:${params.reportId}`).emit('report:status_changed', payload);
  io.to(`report:${params.trackingCode}`).emit('report:status_changed', payload);
  if (params.regionId) {
    io.to(`region:${params.regionId}`).emit('report:status_changed', payload);
    io.to(`responders:${params.regionId}`).emit('report:status_changed', payload);
  }
  io.to('responders:all').emit('report:status_changed', payload);
}

export function broadcastPriorityUpdated(params: {
  reportId: string;
  compositeScore: number;
  breakdown: any;
  regionId?: string | null;
}) {
  if (!io) return;
  const payload = {
    reportId: params.reportId,
    compositeScore: params.compositeScore,
    breakdown: params.breakdown,
  };

  if (params.regionId) {
    io.to(`responders:${params.regionId}`).emit('report:priority_updated', payload);
  }
  io.to('responders:all').emit('report:priority_updated', payload);
}

export function broadcastReportLocked(params: {
  reportId: string;
  lockedById: string;
  lockedByName?: string;
  regionId?: string | null;
}) {
  if (!io) return;
  const payload = {
    reportId: params.reportId,
    lockedById: params.lockedById,
    lockedByName: params.lockedByName,
    timestamp: new Date().toISOString(),
  };

  if (params.regionId) {
    io.to(`responders:${params.regionId}`).emit('report:locked', payload);
  }
  io.to('responders:all').emit('report:locked', payload);
}

export function broadcastReportUnlocked(params: {
  reportId: string;
  regionId?: string | null;
}) {
  if (!io) return;
  const payload = {
    reportId: params.reportId,
    timestamp: new Date().toISOString(),
  };

  if (params.regionId) {
    io.to(`responders:${params.regionId}`).emit('report:unlocked', payload);
  }
  io.to('responders:all').emit('report:unlocked', payload);
}
