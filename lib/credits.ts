import { CONFIG } from '../constants/config';
import { supabase } from './supabase';

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

export async function awardTaskCredits(
  userId: string,
  collectiveId: string,
  assignmentId: string,
  amount: number
): Promise<void> {
  await creditsTransaction(userId, collectiveId, amount, 'task_complete', assignmentId);
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
