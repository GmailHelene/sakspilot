/**
 * @sakspilot/shared — typer + zod-schemas brukt av BÅDE API og web.
 *
 * Hvis du endrer et schema her, må du:
 *  1. Verifisere at API-routen som bruker det fortsatt validerer riktig
 *  2. Verifisere at web-komponenten som sender data matcher
 *
 * Single source of truth. Forhindrer at API og web glir fra hverandre.
 */
import { z } from 'zod';

// ── Sak ──────────────────────────────────────────────────────────

export const SakStatusSchema = z.enum([
  'ikke_pabegynt',
  'pagaaende',
  'venter_kunde',
  'venter_3part',
  'ferdig',
  'arkivert',
]);
export type SakStatus = z.infer<typeof SakStatusSchema>;

export const CreateSakSchema = z.object({
  title: z.string().min(1, 'Tittel kreves').max(200),
  clientId: z.string().uuid().nullable().optional(),
  saksnummer: z.string().max(60).optional(),
  description: z.string().max(5000).optional(),
  status: SakStatusSchema.optional(),
  deadline: z.coerce.date().nullable().optional(),
  hourlyRate: z.number().int().min(0).max(100000).nullable().optional(),
  folderPath: z.string().max(500).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
});
export type CreateSakInput = z.infer<typeof CreateSakSchema>;

export const UpdateSakSchema = CreateSakSchema.partial();
export type UpdateSakInput = z.infer<typeof UpdateSakSchema>;

// ── Klient ───────────────────────────────────────────────────────

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(200),
  orgNumber: z.string().max(40).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(40).optional(),
  address: z.string().max(500).optional(),
  defaultHourlyRate: z.number().int().min(0).max(100000).nullable().optional(),
  notes: z.string().max(5000).optional(),
});
export type CreateClientInput = z.infer<typeof CreateClientSchema>;

// ── Automation (agent) ───────────────────────────────────────────

export const AutomationTriggerSchema = z.enum([
  'sak_status_changed',
  'sak_created',
  'milestone_completed',
  'milestone_due_soon',
  'time_entry_logged',
]);
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>;

export const AutomationActionSchema = z.enum([
  'create_sticky',
  'create_milestone',
  'change_sak_status',
  'show_notification',
]);
export type AutomationAction = z.infer<typeof AutomationActionSchema>;

export const CreateAutomationSchema = z.object({
  name: z.string().min(1).max(120),
  trigger: AutomationTriggerSchema,
  triggerConfig: z.record(z.unknown()).default({}),
  action: AutomationActionSchema,
  actionConfig: z.record(z.unknown()).default({}),
  enabled: z.boolean().optional(),
});
export type CreateAutomationInput = z.infer<typeof CreateAutomationSchema>;

// ── Auth ─────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(120),
  organizationName: z.string().min(1).max(200),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ── User session (subset av JWT-payload) ─────────────────────────

export interface UserSession {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: 'owner' | 'member' | 'admin';
}
