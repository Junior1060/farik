const { z } = require('zod');

// Tenant message classification (agentService.handleTenantMessage)
const messageClassificationSchema = z.object({
  category: z.enum([
    'PAYMENT_QUESTION', 'MAINTENANCE_STATUS', 'LEASE_QUESTION', 'GENERAL_INQUIRY',
    'CHARGE_DISPUTE', 'LEASE_BREAK_REQUEST', 'LEGAL_ESCALATION', 'TENANT_COMPLAINT',
  ]),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  requiresEscalation: z.boolean(),
  autoResponse: z.string().nullable().optional().default(null),
  escalationSummary: z.string().nullable().optional().default(null),
  draftResponse: z.string().nullable().optional().default(null),
  reason: z.string().optional().default(''),
});

// Maintenance triage (agentService.triageMaintenanceRequest)
const maintenanceTriageSchema = z.object({
  urgency: z.enum(['EMERGENCY', 'HIGH', 'ROUTINE']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  category: z.enum(['plumbing', 'electrical', 'hvac', 'structural', 'appliance', 'general']),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  estimatedCostMin: z.number().nullable().optional().default(null),
  estimatedCostMax: z.number().nullable().optional().default(null),
  summary: z.string(),
  reasoning: z.string().optional().default(''),
});

// Invoice extraction (invoiceExtractionService)
const invoiceExtractionSchema = z.object({
  vendorName: z.string().nullable().optional().default(null),
  invoiceNumber: z.string().nullable().optional().default(null),
  invoiceDate: z.string().nullable().optional().default(null),
  lineItems: z.array(z.object({
    description: z.string(),
    amount: z.number(),
  })).optional().default([]),
  tax: z.number().nullable().optional().default(null),
  total: z.number().nullable().optional().default(null),
  serviceDescription: z.string().nullable().optional().default(null),
});

module.exports = { messageClassificationSchema, maintenanceTriageSchema, invoiceExtractionSchema };
