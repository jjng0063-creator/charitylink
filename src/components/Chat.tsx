import React, { useState, useEffect, useRef } from 'react';
import { Send, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { useAuth, handleFirestoreError } from '../contexts/AuthContext';
import { db, presenceDb } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, serverTimestamp, updateDoc, doc, increment, writeBatch } from 'firebase/firestore';
import { onValue, ref as databaseRef } from 'firebase/database';
import { ChatRoom, Message } from '../types';
import { BrandLoader, BrandLogo } from './BrandLogo';

interface PresenceState {
  state?: 'online' | 'offline';
  lastChanged?: number;
}

export function Chat({ activeChatId, onChatChange }: { activeChatId: string | null, onChatChange: (id: string | null) => void }) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [chatError, setChatError] = useState<string | null>(null);
  const [otherPresence, setOtherPresence] = useState<PresenceState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Normalizes Firestore Timestamp-like values to epoch milliseconds.
   */
  const toMillis = (value: unknown): number => {
    if (typeof value === 'number') return value;

    if (
      typeof value === 'object' &&
      value !== null &&
      'toMillis' in value &&
      typeof (value as { toMillis?: unknown }).toMillis === 'function'
    ) {
      return (value as { toMillis: () => number }).toMillis();
    }

    return 0;
  };

  useEffect(() => {
    if (!user) return;
    setChatError(null);
    // Removed orderBy('updatedAt', 'desc') to avoid requiring Firebase composite index
    const q = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const fetchedChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ChatRoom);
      // Sort client-side
      fetchedChats.sort((a, b) => {
        const timeA = toMillis(a.updatedAt);
        const timeB = toMillis(b.updatedAt);
        return timeB - timeA;
      });
      setChats(fetchedChats);
      setIsLoading(false);
    }, (err) => {
      if (err.code !== 'failed-precondition') handleFirestoreError(err, 'list', 'chats');
      // If indexing is needed, order by 'updatedAt' might fail initially, handled gracefully by just ignoring or providing index link
      setChatError('Unable to load chats right now. Please try again.');
      setIsLoading(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeChatId || !user) return;
    setChatError(null);
    updateDoc(doc(db, 'chats', activeChatId), {
      [`unreadBy.${user.uid}`]: 0,
    }).catch((err) => {
      handleFirestoreError(err, 'update', `chats/${activeChatId}`);
    });
    const q = query(
      collection(db, `chats/${activeChatId}/messages`),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: toMillis(doc.data().createdAt) || Date.now()
        }) as Message));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      (err) => {
        handleFirestoreError(err, 'list', `chats/${activeChatId}/messages`);
        setChatError('Unable to load messages for this chat.');
      }
    );
    return () => unsub();
  }, [activeChatId, user]);

  useEffect(() => {
    if (!activeChatId || !user || !presenceDb) {
      setOtherPresence(null);
      return;
    }

    const currentChat = chats.find((chat) => chat.id === activeChatId);
    const otherParticipantId = currentChat?.participants.find((id) => id !== user.uid);
    if (!otherParticipantId) {
      setOtherPresence(null);
      return;
    }

    const statusRef = databaseRef(presenceDb, `status/${otherParticipantId}`);
    const unsubscribe = onValue(statusRef, (snapshot) => {
      const value = snapshot.val() as PresenceState | null;
      setOtherPresence(value);
    });

    return () => unsubscribe();
  }, [activeChatId, chats, user]);

  /**
   * Sends a message and updates chat metadata for inbox ordering.
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !activeChatId || !user) return;
    const text = message.trim();
    setMessage('');
    setChatError(null);
    try {
      const currentChat = chats.find(chat => chat.id === activeChatId);
      const recipientId = currentChat?.participants.find(id => id !== user.uid);
      const batch = writeBatch(db);
      const messageRef = doc(collection(db, `chats/${activeChatId}/messages`));
      const chatRef = doc(db, 'chats', activeChatId);

      batch.set(messageRef, {
        senderId: user.uid,
        text,
        createdAt: serverTimestamp(),
      });

      batch.update(chatRef, recipientId ? {
        lastMessage: text,
        updatedAt: serverTimestamp(),
        [`unreadBy.${user.uid}`]: 0,
        [`unreadBy.${recipientId}`]: increment(1),
      } : {
        lastMessage: text,
        updatedAt: serverTimestamp(),
        [`unreadBy.${user.uid}`]: 0,
      });

      await batch.commit();
    } catch (err) {
      console.error("Failed to send message", err);
      handleFirestoreError(err, 'create', `chats/${activeChatId}/messages`);
      setMessage(text);
      setChatError('Message failed to send. Please try again.');
    }
  };

  /**
   * Finds the display details for the other participant in a two-user chat room.
   */
  const getOtherParticipant = (chat: ChatRoom) => {
    if (!user) return { displayName: 'Unknown' };
    const otherId = chat.participants.find(id => id !== user.uid) || chat.participants[0];
    return chat.participantDetails?.[otherId] || { displayName: 'Unknown User' };
  };

  const getPresenceLabel = () => {
    if (!presenceDb) return 'Status unavailable';
    if (otherPresence?.state === 'online') return 'Online';

    if (typeof otherPresence?.lastChanged === 'number' && otherPresence.lastChanged > 0) {
      return `Last seen ${formatDistanceToNow(otherPresence.lastChanged, { addSuffix: true })}`;
    }

    return 'Offline';
  };

  if (!user) return null;

  if (activeChatId) {
    const currentChat = chats.find(c => c.id === activeChatId);
    const otherUser = currentChat ? getOtherParticipant(currentChat) : { displayName: 'Loading...' };

    return (
      <div className="flex flex-col h-[calc(100vh-180px)]">
        <div className="flex items-center p-4 border-b border-emerald-50 bg-white sticky top-0">
          <button onClick={() => onChatChange(null)} className="mr-4 text-emerald-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h3 className="font-bold text-gray-900">{otherUser.displayName}</h3>
            <span className="text-[10px] text-emerald-500 font-bold uppercase">{getPresenceLabel()}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatError && (
            <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {chatError}
            </div>
          )}
          {messages.map(msg => {
            const isMe = msg.senderId === user.uid;
            return (
              <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "p-3 rounded-2xl shadow-sm max-w-[80%]",
                  isMe ? "bg-emerald-600 text-white rounded-tr-none" : "bg-white border border-emerald-50 rounded-tl-none text-gray-900"
                )}>
                  <p className="text-sm">{msg.text}</p>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-emerald-50">
          <div className="flex items-center space-x-2 bg-gray-50 rounded-2xl px-4 py-2">
            <input 
              type="text" 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..." 
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
            />
            <button type="submit" disabled={!message.trim()} className="bg-emerald-600 text-white p-2 rounded-xl disabled:opacity-50">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Messages</h2>
        <div className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
          {chats.filter(chat => (chat.unreadBy?.[user.uid] || 0) > 0).length} unread
        </div>
      </div>
      
      <div className="space-y-2">
        {chatError && (
          <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {chatError}
          </div>
        )}
        {isLoading ? (
          <BrandLoader className="py-10" label="Loading chats" />
        ) : chats.length > 0 ? (
          chats.map((chat) => {
            const otherUser = getOtherParticipant(chat);
            const unreadCount = chat.unreadBy?.[user.uid] || 0;
            return (
              <button 
                key={chat.id}
                onClick={() => onChatChange(chat.id)}
                className="w-full flex items-center p-4 bg-white rounded-3xl border border-emerald-50 shadow-sm hover:bg-emerald-50/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center font-bold text-emerald-700 mr-4">
                  {otherUser.displayName[0] || '?'}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex justify-between items-center gap-2">
                    <h4 className="font-bold text-gray-900 truncate">{otherUser.displayName}</h4>
                    {unreadCount > 0 && (
                      <span className="shrink-0 min-w-6 h-6 px-2 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-sm truncate mt-0.5 text-gray-500">
                    {chat.lastMessage || "No messages yet"}
                  </p>
                </div>
              </button>
            )
          })
        ) : (
          <div className="py-10 text-center space-y-3 flex flex-col items-center">
             <BrandLogo className="h-14 w-14" />
             <p className="text-gray-500 font-medium">You have no active chats.</p>
          </div>
        )}
      </div>
    </div>
  );
}
