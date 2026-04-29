import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export type NotificationPermissionState = 'enabled' | 'disabled' | 'prompt' | 'unsupported';

let registeredUserId: string | null = null;
let registeredTokenId: string | null = null;
let isRegistering = false;

const PUSH_DISABLED_KEY = 'charitylink:pushNotificationsDisabled';
const PUSH_TOKEN_USER_KEY = 'charitylink:pushNotificationUserId';
const PUSH_TOKEN_ID_KEY = 'charitylink:pushNotificationTokenId';

const getTokenId = (token: string) => encodeURIComponent(token);

const readLocalValue = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalValue = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Push registration can still work even if local storage is unavailable.
  }
};

const removeLocalValue = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
};

const isPushDisabledByUser = () => readLocalValue(PUSH_DISABLED_KEY) === 'true';

export async function getPushNotificationStatus(): Promise<NotificationPermissionState> {
  if (!Capacitor.isNativePlatform()) {
    return 'unsupported';
  }

  if (isPushDisabledByUser()) {
    return 'disabled';
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
  if (!Capacitor.isNativePlatform() || isRegistering || isPushDisabledByUser()) {
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
      writeLocalValue(PUSH_TOKEN_USER_KEY, userId);
      writeLocalValue(PUSH_TOKEN_ID_KEY, tokenId);
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
  removeLocalValue(PUSH_DISABLED_KEY);
  registeredUserId = null;
  registeredTokenId = null;
  await registerPushNotifications(userId);
  return getPushNotificationStatus();
}

export async function disablePushNotifications(userId: string): Promise<NotificationPermissionState> {
  writeLocalValue(PUSH_DISABLED_KEY, 'true');
  await unregisterPushNotifications({ userId, deleteAllTokens: true });
  return 'disabled';
}

/**
 * Removes this device token from Firestore when the user signs out.
 */
export async function unregisterPushNotifications(options: { userId?: string; deleteAllTokens?: boolean } = {}) {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  const userId = options.userId || registeredUserId || readLocalValue(PUSH_TOKEN_USER_KEY);
  const tokenId = registeredTokenId || readLocalValue(PUSH_TOKEN_ID_KEY);
  registeredUserId = null;
  registeredTokenId = null;
  removeLocalValue(PUSH_TOKEN_USER_KEY);
  removeLocalValue(PUSH_TOKEN_ID_KEY);

  try {
    await PushNotifications.removeAllListeners();
    if (userId && options.deleteAllTokens) {
      const tokenSnapshot = await getDocs(collection(db, 'users', userId, 'fcmTokens'));
      await Promise.all(tokenSnapshot.docs.map((tokenDoc) => deleteDoc(tokenDoc.ref)));
      return;
    }

    if (userId && tokenId) {
      await deleteDoc(doc(db, 'users', userId, 'fcmTokens', tokenId));
    }
  } catch (error) {
    console.error('Unable to unregister push notifications:', error);
  }
}
