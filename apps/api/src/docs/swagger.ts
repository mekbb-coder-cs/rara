export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ReliefLink API',
    version: '1.0.0',
    description:
      'Mission-critical crisis response portal and humanitarian aid matching platform API documentation.\n\n**Safety Notice**: For life-threatening emergencies, call your local emergency number immediately. ReliefLink does not replace official emergency services.',
    contact: {
      name: 'ReliefLink Emergency Operations',
      email: 'ops@relieflink.org',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Gateway',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your short-lived access JWT (Header: Authorization: Bearer <token>)',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'rl_refresh_token',
        description: 'HTTP-only rotating refresh token cookie',
      },
      trackingTokenAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Tracking-Token',
        description: 'Short-lived signed token for anonymous reporter tracking',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Invalid payload submitted' },
              details: { type: 'array', items: { type: 'object' } },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
      CreateReportPayload: {
        type: 'object',
        required: ['type', 'description', 'latitude', 'longitude', 'address'],
        properties: {
          type: {
            type: 'string',
            enum: ['FLOOD', 'FIRE', 'MEDICAL', 'MISSING_PERSON', 'FOOD_WATER', 'SHELTER', 'ROAD_BLOCKED', 'OTHER'],
            example: 'FLOOD',
          },
          title: { type: 'string', example: 'Floodwaters rising at Biscayne Blvd' },
          description: {
            type: 'string',
            minLength: 10,
            example: 'First floor rapidly flooding with 3 feet of storm surge. Three elderly residents trapped inside.',
          },
          severity: {
            type: 'string',
            enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'LIFE_THREATENING'],
            default: 'MEDIUM',
            example: 'CRITICAL',
          },
          peopleAffectedCount: { type: 'integer', minimum: 1, default: 1, example: 3 },
          vulnerableGroups: {
            type: 'array',
            items: { type: 'string', enum: ['children', 'elderly', 'disabled', 'pregnant'] },
            example: ['elderly', 'disabled'],
          },
          latitude: { type: 'number', minimum: -90, maximum: 90, example: 25.7617 },
          longitude: { type: 'number', minimum: -180, maximum: 180, example: -80.1918 },
          address: { type: 'string', example: '1240 Biscayne Blvd, Miami, FL 33132' },
          contactPhone: { type: 'string', example: '+13055550199' },
          isAnonymous: { type: 'boolean', default: false },
          reporterName: { type: 'string', example: 'Carlos Mendez' },
          media: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              required: ['url', 'mimeType', 'fileSizeBytes'],
              properties: {
                url: { type: 'string', format: 'uri' },
                mimeType: { type: 'string', enum: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] },
                fileSizeBytes: { type: 'integer', maximum: 26214400 },
                isSensitive: { type: 'boolean', default: false },
              },
            },
          },
          honeypot: {
            type: 'string',
            description: 'Anti-bot trap: Must be omitted or empty. Non-empty string triggers automatic spam block.',
          },
        },
      },
      ReportUpdatePayload: {
        type: 'object',
        required: ['note'],
        properties: {
          note: { type: 'string', minLength: 3, example: 'Water level stabilized; rescue boat has arrived.' },
          status: {
            type: 'string',
            enum: ['SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
          },
          isPublic: { type: 'boolean', default: true },
        },
      },
    },
  },
  paths: {
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness Probe',
        responses: { 200: { description: 'Node process is alive' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness Probe',
        responses: {
          200: { description: 'All database and cache dependencies operational' },
          503: { description: 'One or more dependencies down' },
        },
      },
    },
    '/reports': {
      post: {
        tags: ['Reports'],
        summary: 'Submit Crisis Incident Report',
        description:
          'Ingests a crisis report (anonymous or authenticated). Supports idempotency via Idempotency-Key header. Automatically triggers spatial duplicate detection and clustering.',
        parameters: [
          {
            in: 'header',
            name: 'Idempotency-Key',
            schema: { type: 'string', format: 'uuid' },
            description: 'Unique client key preventing duplicate report submission on network retry.',
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReportPayload' } } },
        },
        responses: {
          201: { description: 'Report created or linked to existing cluster' },
          400: { description: 'Validation error' },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/reports/offline-sync': {
      post: {
        tags: ['Reports'],
        summary: 'Sync Batch of Offline Reports',
        description:
          'Synchronizes up to 50 incident reports recorded during network disconnection, preserving original client offline timestamps.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reports'],
                properties: {
                  reports: {
                    type: 'array',
                    items: {
                      allOf: [
                        { $ref: '#/components/schemas/CreateReportPayload' },
                        {
                          type: 'object',
                          required: ['localId', 'offlineCreatedAt'],
                          properties: {
                            localId: { type: 'string' },
                            offlineCreatedAt: { type: 'string', format: 'date-time' },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Batch synchronized successfully' } },
      },
    },
    '/reports/public-feed': {
      get: {
        tags: ['Reports'],
        summary: 'Privacy-Filtered Public Map Feed',
        description:
          'Safe geospatial feed of active incidents. Exact street addresses, names, and phone numbers are redacted. GPS coordinates are jittered ~500m to prevent victim doxxing.',
        parameters: [
          { in: 'query', name: 'type', schema: { type: 'string' } },
          { in: 'query', name: 'severity', schema: { type: 'string' } },
          { in: 'query', name: 'lat', schema: { type: 'number' } },
          { in: 'query', name: 'lng', schema: { type: 'number' } },
          { in: 'query', name: 'radiusKm', schema: { type: 'number', default: 25 } },
        ],
        responses: { 200: { description: 'Privacy-filtered incident feed' } },
      },
    },
    '/reports/track/{trackingCode}': {
      get: {
        tags: ['Reports'],
        summary: 'Track Report Status by Tracking Code',
        parameters: [{ in: 'path', name: 'trackingCode', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Report timeline and status' }, 404: { description: 'Tracking code not found' } },
      },
    },
    '/reports/{id}': {
      get: {
        tags: ['Reports'],
        summary: 'Get Report Details',
        description:
          'Returns report details. For verified responders/admins, unmasks exact address and phone, and logs an immutable READ_PII audit record. For the public, returns redacted data.',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Incident details' }, 404: { description: 'Report not found' } },
      },
    },
    '/reports/{id}/updates': {
      post: {
        tags: ['Reports'],
        summary: 'Add Timeline Progress Update to Report',
        security: [{ bearerAuth: [] }, { trackingTokenAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ReportUpdatePayload' } } },
        },
        responses: { 201: { description: 'Timeline update recorded' } },
      },
    },
    '/reports/{id}/flag': {
      post: {
        tags: ['Reports'],
        summary: 'Flag Incident as False Report or Spam',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason'],
                properties: {
                  reason: { type: 'string', enum: ['SPAM', 'FALSE_REPORT', 'DUPLICATE', 'OFFENSIVE', 'MALICIOUS'] },
                  details: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Abuse flag logged for responder triage' } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register new user account',
        responses: { 201: { description: 'Account registered' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate and receive tokens',
        responses: { 200: { description: 'Logged in' } },
      },
    },
    '/organizations': {
      get: {
        tags: ['Organizations'],
        summary: 'List verified organizations',
        responses: { 200: { description: 'Organizations list' } },
      },
    },
    '/api/v1/reports/triage': {
      get: {
        tags: ['Responder Triage'],
        summary: 'Get live triage queue ordered by PriorityScore with filters',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Triage queue list' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/api/v1/reports/{id}/verify': {
      post: {
        tags: ['Responder Triage'],
        summary: 'Verify or reject report with mandatory reason & confidence',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Report verification outcome recorded' },
          409: { description: 'Concurrency conflict (optimistic lock)' },
        },
      },
    },
    '/api/v1/reports/{id}/status': {
      patch: {
        tags: ['Responder Triage'],
        summary: 'Transition report status in state machine',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Status updated' },
          400: { description: 'Invalid state transition' },
          409: { description: 'Concurrency conflict' },
        },
      },
    },
    '/api/v1/reports/{id}/lock': {
      post: {
        tags: ['Responder Triage'],
        summary: 'Acquire active triage lock',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Report locked' },
          409: { description: 'Already locked by someone else' },
        },
      },
    },
    '/api/v1/reports/{id}/reveal-sensitive': {
      post: {
        tags: ['Responder Triage'],
        summary: 'Reveal sensitive victim contact details with mandatory AuditLog',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Sensitive PII unmasked and audited' },
          403: { description: 'Forbidden (outside region)' },
        },
      },
    },
    '/api/v1/reports/{id}/priority-override': {
      post: {
        tags: ['Responder Triage'],
        summary: 'Manually override PriorityScore with justification note',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Priority overridden' },
        },
      },
    },
    '/api/v1/reports/bulk-action': {
      post: {
        tags: ['Responder Triage'],
        summary: 'Execute bulk triage action across reports',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Bulk actions processed' },
        },
      },
    },
    // ==========================================
    // PHASE 6: AID SUPPLY AND MATCHING
    // ==========================================
    '/api/v1/aid/offers': {
      post: {
        tags: ['Aid Supply & Matching'],
        summary: 'Publish new aid offer (Approved Providers & Admins)',
        security: [{ bearerAuth: [] }],
        responses: {
          201: { description: 'Aid offer published' },
          403: { description: 'Forbidden (Unapproved organization)' },
        },
      },
      get: {
        tags: ['Aid Supply & Matching'],
        summary: 'Query active aid offers by type, location, and radius',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'List of matching aid offers' },
        },
      },
    },
    '/api/v1/aid/offers/{id}': {
      get: {
        tags: ['Aid Supply & Matching'],
        summary: 'Retrieve single aid offer with inventory status',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Aid offer record' },
          404: { description: 'Not found' },
        },
      },
      patch: {
        tags: ['Aid Supply & Matching'],
        summary: 'Update aid offer details and capacity',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Aid offer updated' },
        },
      },
    },
    '/api/v1/aid/needs': {
      post: {
        tags: ['Aid Supply & Matching'],
        summary: 'Structure an AidNeed from a verified incident report (Responders & Coordinators)',
        security: [{ bearerAuth: [] }],
        responses: {
          201: { description: 'Aid need structured and registered' },
        },
      },
      get: {
        tags: ['Aid Supply & Matching'],
        summary: 'Query aid needs',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'List of aid needs' },
        },
      },
    },
    '/api/v1/aid/needs/{id}/candidates': {
      get: {
        tags: ['Aid Supply & Matching'],
        summary: 'Rank candidate offers for an AidNeed using the transparent matching engine',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Ranked candidate offers with score breakdown' },
        },
      },
    },
    '/api/v1/aid/matches/confirm': {
      post: {
        tags: ['Aid Supply & Matching'],
        summary: 'Responder confirms suggested match; atomically reserves stock and dispatches to provider',
        security: [{ bearerAuth: [] }],
        responses: {
          201: { description: 'Match confirmed, stock reserved' },
          409: { description: 'Insufficient capacity / Double-allocation prevented' },
        },
      },
    },
    '/api/v1/aid/matches/{id}/respond': {
      post: {
        tags: ['Aid Supply & Matching'],
        summary: 'Aid provider responds: accept, decline (mandatory reason), or partial fulfill',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Provider response processed, inventory and reliability updated' },
        },
      },
    },
    '/api/v1/aid/matches/provider-queue': {
      get: {
        tags: ['Aid Supply & Matching'],
        summary: 'Retrieve provider incoming match requests and active matches',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Provider match queue' },
        },
      },
    },
    '/api/v1/aid/needs/{id}/escalate': {
      post: {
        tags: ['Aid Supply & Matching'],
        summary: 'Escalate unmatchable need to emergency coordinators',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Need escalated to coordinator' },
        },
      },
    },
    '/api/v1/aid/coordinator/unmatched': {
      get: {
        tags: ['Aid Supply & Matching'],
        summary: 'Coordinator overview of unmatched and escalated needs across regions',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Overview of unmatched needs and capacity deficits' },
        },
      },
    },
    '/api/v1/aid/matches/process-timeouts': {
      post: {
        tags: ['Aid Supply & Matching'],
        summary: 'Trigger sweep for timed-out provider match requests and re-route to next best candidates',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Timeouts processed and re-routed' },
        },
      },
    },
    // ==========================================
    // PHASE 7: COORDINATION & COMMUNICATION
    // ==========================================
    '/api/v1/coordination/tasks': {
      post: {
        tags: ['Coordination & Communication'],
        summary: 'Create a field response task from confirmed match or report',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Task created and dispatched' } },
      },
      get: {
        tags: ['Coordination & Communication'],
        summary: 'List field tasks with status/assignee filters',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'List of tasks' } },
      },
    },
    '/api/v1/coordination/tasks/{id}/status': {
      patch: {
        tags: ['Coordination & Communication'],
        summary: 'Update task execution status (ASSIGNED -> EN_ROUTE -> ON_SITE -> DONE/FAILED)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Task status updated and logged to case timeline' } },
      },
    },
    '/api/v1/coordination/tasks/{id}/location': {
      post: {
        tags: ['Coordination & Communication'],
        summary: 'Opt-in volunteer/team real-time location update while on task',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Live location recorded' } },
      },
    },
    '/api/v1/coordination/tracking/live': {
      get: {
        tags: ['Coordination & Communication'],
        summary: 'Get active opt-in volunteer locations for coordinator map',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Active field volunteer coordinates' } },
      },
    },
    '/api/v1/coordination/cases/{reportId}/close': {
      post: {
        tags: ['Coordination & Communication'],
        summary: 'Close case with mandatory closing note and reporter confirmation',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Case marked resolved' } },
      },
    },
    '/api/v1/coordination/cases/{reportId}/reopen': {
      post: {
        tags: ['Coordination & Communication'],
        summary: 'Reopen closed case with mandatory reason',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Case reopened to IN_PROGRESS' } },
      },
    },
    '/api/v1/coordination/cases/{reportId}/chat': {
      get: {
        tags: ['Coordination & Communication'],
        summary: 'Fetch team chat messages for case (responders and assigned providers only)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Chat message history' } },
      },
      post: {
        tags: ['Coordination & Communication'],
        summary: 'Post team chat message (reporter private PII protected)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Message sent' } },
      },
    },
    '/api/v1/coordination/broadcasts': {
      get: {
        tags: ['Coordination & Communication'],
        summary: 'Public feed of active area-wide crisis advisories',
        responses: { 200: { description: 'Active broadcasts' } },
      },
      post: {
        tags: ['Coordination & Communication'],
        summary: 'Publish area-wide broadcast advisory (Coordinators & Admins)',
        security: [{ bearerAuth: [] }],
        responses: { 201: { description: 'Broadcast alert published' } },
      },
    },
    '/api/v1/coordination/escalations': {
      get: {
        tags: ['Coordination & Communication'],
        summary: 'List active escalation alerts for stalled unverified or unmatched cases',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Escalation alerts' } },
      },
    },
    '/api/v1/coordination/notifications/preferences': {
      get: {
        tags: ['Coordination & Communication'],
        summary: 'Get authenticated user notification and quiet hours preferences',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'User preferences' } },
      },
      put: {
        tags: ['Coordination & Communication'],
        summary: 'Update notification channels and quiet hours schedule',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Preferences updated' } },
      },
    },
    '/api/v1/admin/config': {
      get: {
        tags: ['Admin & Settings'],
        summary: 'Get global system settings and configuration',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'System configuration' } },
      },
    },
    '/api/v1/admin/config/priority-weights': {
      put: {
        tags: ['Admin & Settings'],
        summary: 'Update explainable priority score formula weights (audit logged)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Priority weights updated' } },
      },
    },
    '/api/v1/admin/users': {
      get: {
        tags: ['Admin & Settings'],
        summary: 'List users with roles, verification, and activity',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Users list' } },
      },
    },
    '/api/v1/admin/audit-logs': {
      get: {
        tags: ['Admin & Audit'],
        summary: 'Search and inspect sensitive access & audit logs',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Filtered audit logs' } },
      },
    },
    '/api/v1/admin/audit-logs/export': {
      get: {
        tags: ['Admin & Audit'],
        summary: 'Export audit logs to CSV',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'CSV file download' } },
      },
    },
    '/api/v1/compliance/retention/run': {
      post: {
        tags: ['Privacy & Compliance'],
        summary: 'Run automated data retention anonymization job on old reports',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Retention job execution summary' } },
      },
    },
    '/api/v1/compliance/users/{id}/export': {
      get: {
        tags: ['Privacy & Compliance'],
        summary: 'GDPR user data portability export',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'User data bundle' } },
      },
    },
    '/api/v1/compliance/users/{id}': {
      delete: {
        tags: ['Privacy & Compliance'],
        summary: 'GDPR right to erasure: permanently anonymize reports and erase user account',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'User erasure confirmation' } },
      },
    },
    '/api/v1/analytics/operations': {
      get: {
        tags: ['Analytics & Operations'],
        summary: 'Aggregated operations metrics, workload, SLA response times, and incident heat map',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Operations dashboard metrics' } },
      },
    },
    '/api/v1/analytics/after-action-report': {
      get: {
        tags: ['Analytics & Operations'],
        summary: 'Generate event after-action report (JSON or CSV)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'After-action disaster report' } },
      },
    },
    '/api/v1/analytics/transparency': {
      get: {
        tags: ['Analytics & Operations'],
        summary: 'Public non-identifying crisis statistics & outcomes',
        responses: { 200: { description: 'Public transparency figures' } },
      },
    },
  },
};
