// Blocage et signalement. Les règles de sécurité sont dans supabase/settings.sql.
import { supabase } from './supabase'

export type BlockedPerson = { id: string, username: string | null, full_name: string | null, avatar_url: string | null, blocked_at: string }
export type ReportTarget = { type: 'profile' | 'week' | 'comment' | 'message', id: string, userId?: string | null }

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'] as const
export type ReportReason = typeof REPORT_REASONS[number]

export async function blockUser(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('block_user', { target: userId })
  return !error
}

export async function unblockUser(userId: string): Promise<boolean> {
  const { error } = await supabase.rpc('unblock_user', { target: userId })
  return !error
}

export async function getBlockedPeople(): Promise<BlockedPerson[]> {
  const { data, error } = await supabase.rpc('get_blocked_profiles')
  return error ? [] : ((data || []) as BlockedPerson[])
}

export async function isBlockedByMe(userId: string): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return false
  const { data } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', u.user.id).eq('blocked_id', userId).maybeSingle()
  return !!data
}

export async function sendReport(target: ReportTarget, reason: ReportReason, details: string): Promise<boolean> {
  const { error } = await supabase.from('reports').insert({
    target_type: target.type, target_id: target.id, target_user_id: target.userId || null,
    reason, details: details.trim() || null,
  })
  return !error
}
