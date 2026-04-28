import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationPermissionState = 'enabled' | 'disabled' | 'prompt' | 'unsupported';

let registeredUserId: string | null = null;
let registeredTokenId: string | null = null;
let isRegistering = false;

const getTokenId = (token: string) => encodeURIComponent(token);

export async function getPushNotificationStatus(): Promise<NotificationPermissionState> {
  if (!Capacitor.isNativePlatform()) {
    return 'unsupported';
  }

  try {
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'granted') return 'enabled';
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') return 'prompt';
    return 'disabled';
  } catch (error) {
    console.error('Unable to check push notification permission:', error);
    return 'disabled';
  }
}

/**
 * Registers the Android device for FCM push notifications and stores its token.
 */
export async function registerPushNotifications(userId: string) {
  if (!Capacitor.isNativePlatform() || isRegistering) {
    return;
  }

  isRegistering = true;

  try {
    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener('registration', async (token: Token) => {
      const tokenId = getTokenId(token.value);

      await setDoc(
        doc(db, 'users', userId, 'fcmTokens', tokenId),
        {
          token: token.value,
          platform: Capacitor.getPlatform(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      registeredUserId = userId;
      registeredTokenId = tokenId;
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('Push notification registration failed:', error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.info('Push notification received while app is open:', notification);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.info('Push notification opened:', action.notification);
      const chatId = action.notification.data?.chatId;
      if (typeof chatId === 'string' && chatId) {
        window.dispatchEvent(new CustomEvent('charitylink:open-chat', { detail: { chatId } }));
      }
    });

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.info('Push notification permission was not granted.');
      return;
    }

    if (Capacitor.getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'default',
        name: 'CharityLink Notifications',
        description: 'Chat and request updates from CharityLink.',
        importance: 4,
        visibility: 1,
      });
    }

    await PushNotifications.register();
  } catch (error) {
    console.error('Unable to register push notifications:', error);
  } finally {
    isRegistering = false;
  }
}

export async function enablePushNotifications(userId: string) {
  registeredUserId = null;
  registeredTokenId = null;
  await registerPushNotifications(userId);
  return getPushNotificationStatus();
}

/**
 * Removes this device token from Firestore when the user signs out.
 */
export async function unregisterPushNotifications() {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const userId = registeredUserId;
  const tokenId = registeredTokenId;
  registeredUserId = null;
  registeredTokenId = null;

  try {
    await PushNotifications.removeAllListeners();
    if (userId && tokenId) {
      await deleteDoc(doc(db, 'users', userId, 'fcmTokens', tokenId));
    }
  } catch (error) {
    console.error('Unable to unregister push notifications:', error);
  }
}
