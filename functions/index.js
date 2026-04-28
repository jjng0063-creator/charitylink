const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const truncate = (text, maxLength = 120) => {
  if (!text) return 'You have a new message on CharityLink.';
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
};

exports.sendChatNotification = onDocumentCreated('chats/{chatId}/messages/{messageId}', async (event) => {
  const message = event.data?.data();
  if (!message?.senderId || !message?.text) {
    return;
  }

  const { chatId, messageId } = event.params;
  const chatSnapshot = await db.collection('chats').doc(chatId).get();
  if (!chatSnapshot.exists) {
    return;
  }

  const chat = chatSnapshot.data();
  const participants = Array.isArray(chat.participants) ? chat.participants : [];
  const receiverId = participants.find((participantId) => participantId !== message.senderId);
  if (!receiverId) {
    return;
  }

  const tokenSnapshot = await db.collection('users').doc(receiverId).collection('fcmTokens').get();
  const tokenDocs = tokenSnapshot.docs.filter((tokenDoc) => {
    const token = tokenDoc.data().token;
    return typeof token === 'string' && token.length > 0;
  });
  const tokens = tokenDocs.map((tokenDoc) => tokenDoc.data().token);
  if (tokens.length === 0) {
    return;
  }

  const senderName =
    chat.participantDetails?.[message.senderId]?.displayName ||
    'Someone';

  for (const tokenGroup of chunk(tokens, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: tokenGroup,
      notification: {
        title: `New message from ${senderName}`,
        body: truncate(message.text),
      },
      data: {
        type: 'chat',
        chatId,
        messageId,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
        },
      },
    });

    const invalidTokenIds = [];
    response.responses.forEach((sendResponse, index) => {
      if (sendResponse.success) return;

      const code = sendResponse.error?.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        const originalIndex = tokens.indexOf(tokenGroup[index]);
        const tokenDoc = tokenDocs[originalIndex];
        if (tokenDoc) {
          invalidTokenIds.push(tokenDoc.id);
        }
      }
    });

    if (invalidTokenIds.length > 0) {
      const batch = db.batch();
      invalidTokenIds.forEach((tokenId) => {
        batch.delete(db.collection('users').doc(receiverId).collection('fcmTokens').doc(tokenId));
      });
      await batch.commit();
    }
  }
});
