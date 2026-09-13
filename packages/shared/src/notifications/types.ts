/** Tipi di notifica (INT-001…005). Ogni tipo ha un template in `templates.ts` e una preferenza utente. */
export const NotificationTypes = [
  'feedback.received',
  'feedback.request.received',
  'recognition.received',
  'one_on_one.scheduled',
  'one_on_one.reminder',
  'action_item.assigned',
  'action_item.overdue',
  'objective.check_in_due',
  'objective.off_track',
  'person.invited',
  'people.import.completed',
  'form.assigned',
  'review.launched',
  'review.stage_due',
  'review.shared',
  'review.signed',
  'user.password_reset',
  'survey.opened',
  'survey.reminder',
  'survey.closed',
  'survey.shared',
  'welfare.credited',
  'welfare.request_submitted',
  'welfare.request_decided',
  'welfare.budget_expiring',
  'welfare.threshold_near',
  'welfare.payroll_ready',
  'system',
] as const;
export type NotificationType = (typeof NotificationTypes)[number];

export const NotificationChannels = ['in_app', 'email'] as const;
export type NotificationChannel = (typeof NotificationChannels)[number];

export type DigestMode = 'immediate' | 'daily' | 'off';

/** Default per tipo: quali canali sono attivi se l'utente non ha espresso una preferenza. */
export const NotificationDefaults: Record<NotificationType, { inApp: boolean; email: boolean }> = {
  'feedback.received': { inApp: true, email: true },
  'feedback.request.received': { inApp: true, email: true },
  'recognition.received': { inApp: true, email: true },
  'one_on_one.scheduled': { inApp: true, email: true },
  'one_on_one.reminder': { inApp: true, email: false },
  'action_item.assigned': { inApp: true, email: false },
  'action_item.overdue': { inApp: true, email: false },
  'objective.check_in_due': { inApp: true, email: false },
  'objective.off_track': { inApp: true, email: true },
  'person.invited': { inApp: false, email: true },
  'people.import.completed': { inApp: true, email: false },
  'form.assigned': { inApp: true, email: true },
  'review.launched': { inApp: true, email: true },
  'review.stage_due': { inApp: true, email: true },
  'review.shared': { inApp: true, email: true },
  'review.signed': { inApp: true, email: false },
  'user.password_reset': { inApp: false, email: true },
  'survey.opened': { inApp: true, email: true },
  'survey.reminder': { inApp: true, email: true },
  'survey.closed': { inApp: true, email: false },
  'survey.shared': { inApp: true, email: false },
  'welfare.credited': { inApp: true, email: true },
  'welfare.request_submitted': { inApp: true, email: false },
  'welfare.request_decided': { inApp: true, email: true },
  'welfare.budget_expiring': { inApp: true, email: true },
  'welfare.threshold_near': { inApp: true, email: false },
  'welfare.payroll_ready': { inApp: true, email: true },
  system: { inApp: true, email: false },
};
