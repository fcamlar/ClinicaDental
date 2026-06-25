import type { identity } from '@castellar/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Adaptador de SupabaseAdminClient — usa la service_role key.
 *
 * El service_role bypasea RLS de Supabase Auth (y Postgres). NUNCA exponer
 * esta key al frontend.
 */
export class SupabaseAdminAdapter implements identity.SupabaseAdminClient {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      throw new Error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorias');
    }
    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async inviteUserByEmail(email: string): Promise<{ supabaseUserId: string }> {
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) {
      throw new Error(`Supabase invite falló: ${error?.message ?? 'sin usuario'}`);
    }
    return { supabaseUserId: data.user.id };
  }

  async deleteUser(supabaseUserId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(supabaseUserId);
    if (error) throw new Error(`Supabase delete falló: ${error.message}`);
  }
}
