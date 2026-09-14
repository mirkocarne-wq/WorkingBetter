import { z } from 'zod';

export const guideQuery = z.object({ profile: z.enum(['admin', 'hr', 'manager', 'employee']).optional() });
export const guideStepDto = z.object({ done: z.boolean(), profile: z.enum(['admin', 'hr', 'manager', 'employee']).optional() });
export const guideDismissDto = z.object({ dismissed: z.boolean() });
