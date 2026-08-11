import * as z from 'zod';

export const environmentIdSchema = z.number().int().positive().describe('The Dockhand environment (Docker host) ID, from list_environments');
