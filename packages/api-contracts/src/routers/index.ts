import { router } from '../trpc.js';
import { healthRouter } from './health.js';
import { identityRouter } from './identity.js';
import { patientsRouter } from './patients.js';
import { catalogRouter } from './catalog.js';
import { filesRouter } from './files.js';
import { schedulingRouter } from './scheduling.js';
import { clinicalRouter } from './clinical.js';
import { billingRouter } from './billing.js';

/**
 * Router raíz de Castellar.
 *
 * Sprint 0: health.
 * Sprint 1: identity.
 * Sprint 2: patients, catalog, files.
 * Sprint 3: scheduling.
 * Sprint 4: clinical.
 * Sprint 5: billing.
 */
export const appRouter = router({
  health: healthRouter,
  identity: identityRouter,
  patients: patientsRouter,
  catalog: catalogRouter,
  files: filesRouter,
  scheduling: schedulingRouter,
  clinical: clinicalRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
