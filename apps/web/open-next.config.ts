/**
 * OpenNext config para Cloudflare Workers.
 *
 * Configuración mínima: usa el preset 'cloudflare-incremental' que es el
 * recomendado para Next 15 + Workers. ISR e imágenes se podrán activar
 * cuando provisionemos R2 / KV para cache.
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // Cache vacío de momento — usaremos KV/R2 para ISR cuando toque.
});
