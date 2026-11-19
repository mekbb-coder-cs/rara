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
  },
};
