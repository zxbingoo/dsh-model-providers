import z from '@deepseek-ai/schemastery';
import { DEFAULTS, EFFORTS } from './controller.mjs';
export const Config = z.object({
  enabled: z.boolean().default(DEFAULTS.enabled).volatile(),
  model: z.string().min(1).max(200).default(DEFAULTS.model).volatile(),
  reasoningEffort: z.union(EFFORTS.map(value => z.const(value))).default(DEFAULTS.reasoningEffort).volatile(),
  contextWindows: z.dict(z.number().min(1).max(Number.MAX_SAFE_INTEGER).step(1)).default({}).volatile(),
});
