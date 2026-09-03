import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const { data } = await Notifications.getDevicePushTokenAsync();
  const token = data;

  await supabase
    .from('profiles')
    .update({ device_push_token: token })
    .eq('id', userId);

  return token;
}

/**
 * Ask the server to send the push for an event this client just caused.
 *
 * send-notification needs the service role, which the app must never hold, so
 * these three events sent nothing at all. notify-collective checks that the
 * caller is entitled to trigger the event and derives both the message and the
 * recipients itself — nothing here decides who gets told what.
 *
 * Fire-and-forget: a failed push must never fail the action that caused it.
 */
export async function notifyCollective(
  payload:
    | { event: 'denounced' | 'resisted'; denouncementId: string }
    | { event: 'joined'; collectiveId: string }
): Promise<void> {
  try {
    await supabase.functions.invoke('notify-collective', { body: payload });
  } catch (err: any) {
    if (__DEV__) console.warn('[notifications] notify failed:', err?.message ?? err);
  }
}
