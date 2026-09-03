import { CONFIG } from '../constants/config';
import { supabase } from './supabase';

/**
 * Direct RPC call to `credits_transaction`.
 *
 * WARNING: this always fails from the client. The RPC is
 * `revoke execute ... from anon, authenticated` (001_initial_schema.sql) and is
 * callable only with the service role. The helpers below that still use it have
 * no client call sites today — the denouncement payouts they describe are made
 * by the `denounce-timeout` Edge Function, which holds the service role. If you
 * ever need one of them from the app, give it an Edge Function of its own the
 * way `awardTaskCredits` has one; do not widen the grant on the RPC.
 */
async function creditsTransaction(
  userId: string,
  collectiveId: string,
  delta: number,
  reason: string,
  referenceId?: string
): Promise<void> {
  const { error } = await supabase.rpc('credits_transaction', {
    p_user_id: userId,
    p_collective_id: collectiveId,
    p_delta: delta,
    p_reason: reason,
    p_reference_id: referenceId ?? null,
  });
  if (error) throw error;
}

/**
 * Award the completion credits for an assignment, immediately.
 *
 * Goes through the `award-task-credits` Edge Function rather than calling
 * `credits_transaction` directly: that RPC is revoked from `authenticated`, so
 * a direct client call always fails. The function verifies the caller owns the
 * assignment and reads the amount from the row, then calls the RPC with the
 * service role. It is idempotent, so a retry is safe.
 */
export async function awardTaskCredits(assignmentId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('award-task-credits', {
    body: { assignmentId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

export async function deductTaskCredits(
  userId: string,
  collectiveId: string,
  assignmentId: string,
  amount: number
): Promise<void> {
  await creditsTransaction(userId, collectiveId, -amount, 'task_failed', assignmentId);
}

export async function awardDenounceReward(
  accuserId: string,
  collectiveId: string,
  denouncementId: string
): Promise<void> {
  await creditsTransaction(
    accuserId,
    collectiveId,
    CONFIG.DENOUNCE_ACCUSER_REWARD,
    'denouncement_upheld_reward',
    denouncementId
  );
}

export async function deductDenounceAccuserPenalty(
  accuserId: string,
  collectiveId: string,
  denouncementId: string
): Promise<void> {
  await creditsTransaction(
    accuserId,
    collectiveId,
    -CONFIG.DENOUNCE_ACCUSER_PENALTY,
    'denouncement_dismissed_penalty',
    denouncementId
  );
}

export async function deductAccusedCredits(
  accusedId: string,
  collectiveId: string,
  denouncementId: string,
  amount: number
): Promise<void> {
  await creditsTransaction(accusedId, collectiveId, -amount, 'denouncement_upheld_deduction', denouncementId);
}

export async function applyTwoPersonAbusePenalty(
  userId1: string,
  userId2: string,
  collectiveId: string
): Promise<void> {
  await Promise.all([
    creditsTransaction(userId1, collectiveId, -CONFIG.DENOUNCE_TWO_PERSON_ABUSE_PENALTY, 'denouncement_abuse_penalty'),
    creditsTransaction(userId2, collectiveId, -CONFIG.DENOUNCE_TWO_PERSON_ABUSE_PENALTY, 'denouncement_abuse_penalty'),
  ]);
}
