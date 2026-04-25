import React, { useEffect, useState } from 'react';
import { MapPin, Bell, X, Package, MessageSquare, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { ChatRoom } from '../types';

interface HeaderProps {
  location: string;
  setLocation?: (location: string) => void;
  onOpenChat?: (chatId: string) => void;
}

interface NotificationItem {
  id: string;
  chatId: string;
  title: string;
  desc: string;
  time: string;
  unreadCount: number;
  icon: typeof Package;
  color: string;
}

export function Header({ location, setLocation, onOpenChat }: HeaderProps) {
  const { user } = useAuth();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(true);
  const [ownedPostIds, setOwnedPostIds] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);

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
    if (!user) {
      setOwnedPostIds([]);
      setChats([]);
      setIsLoadingNotifications(false);
      return;
    }

    setIsLoadingNotifications(true);

    const postsQuery = query(collection(db, 'posts'), where('donorId', '==', user.uid));
    const chatsQuery = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));

    const unsubscribePosts = onSnapshot(
      postsQuery,
      (snapshot) => {
        setOwnedPostIds(snapshot.docs.map((postDoc) => postDoc.id));
      },
      () => {
        setOwnedPostIds([]);
      }
    );

    const unsubscribeChats = onSnapshot(
      chatsQuery,
      (snapshot) => {
        const nextChats = snapshot.docs.map((chatDoc) => ({
          id: chatDoc.id,
          ...chatDoc.data(),
        })) as ChatRoom[];

        nextChats.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        setChats(nextChats);
        setIsLoadingNotifications(false);
      },
      () => {
        setChats([]);
        setIsLoadingNotifications(false);
      }
    );

    return () => {
      unsubscribePosts();
      unsubscribeChats();
    };
  }, [user]);

  const notifications: NotificationItem[] = !user
    ? []
    : chats
        .map((chat) => {
          const unreadCount = chat.unreadBy?.[user.uid] || 0;
          if (unreadCount <= 0) return null;

          const otherUserId = chat.participants.find((participantId) => participantId !== user.uid) || chat.participants[0];
          const otherUserName = chat.participantDetails?.[otherUserId]?.displayName || 'Unknown user';
          const relatedPostIds = Array.isArray(chat.relatedPostIds) ? chat.relatedPostIds : [];
          const isRequest = relatedPostIds.some((postId) => ownedPostIds.includes(postId));
          const updatedAt = toMillis(chat.updatedAt);

          return {
            id: `${chat.id}:${updatedAt}`,
            chatId: chat.id,
            title: isRequest ? 'New request' : 'New message',
            desc: chat.lastMessage?.trim() || `${otherUserName} sent you a message.`,
            time: updatedAt ? formatDistanceToNow(updatedAt, { addSuffix: true }) : 'Just now',
            unreadCount,
            icon: isRequest ? Package : MessageSquare,
            color: isRequest ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600',
          };
        })
        .filter((notification): notification is NotificationItem => notification !== null);

  const totalUnreadCount = notifications.reduce((sum, notification) => sum + notification.unreadCount, 0);

  return (
    <>
      <header className="sticky top-0 bg-emerald-600 text-white px-4 py-4 rounded-b-[2rem] shadow-lg z-40">
        <div className="flex justify-between items-center max-w-md mx-auto">
          <div className="flex flex-col">
            <span className="text-xs text-emerald-100 font-medium uppercase tracking-widest">Your Location</span>
            <div className="flex items-center mt-0.5">
              <MapPin className="w-4 h-4 mr-1 text-emerald-200" />
              <select
                value={location}
                onChange={(e) => setLocation?.(e.target.value)}
                className="text-lg font-bold bg-transparent border-0 p-0 text-white focus:ring-0 cursor-pointer appearance-none outline-none"
              >
                <option value="Selangor" className="text-gray-900">Selangor</option>
                <option value="Kuala Lumpur" className="text-gray-900">Kuala Lumpur</option>
                <option value="Pulau Pinang" className="text-gray-900">Pulau Pinang</option>
                <option value="Johor" className="text-gray-900">Johor</option>
                <option value="Perak" className="text-gray-900">Perak</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 ml-1 text-emerald-200" />
            </div>
          </div>
          <button
            onClick={() => setIsNotifOpen(true)}
            className="relative p-2 bg-emerald-500 rounded-full hover:bg-emerald-400 transition-colors"
            aria-label="Open notifications"
          >
            <Bell className="w-6 h-6" />
            {totalUnreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 inline-flex items-center justify-center bg-red-400 rounded-full border-2 border-emerald-500 text-[10px] font-bold text-white">
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isNotifOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end"
            onClick={() => setIsNotifOpen(false)}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-gray-50 w-full max-w-sm h-full shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 bg-white flex items-center justify-between border-b border-gray-100 shadow-sm z-10">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 flex items-center">
                    <Bell className="w-5 h-5 mr-2 text-emerald-600" />
                    Notifications
                  </h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-emerald-600">
                    {totalUnreadCount} unread messages
                  </p>
                </div>
                <button onClick={() => setIsNotifOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:bg-gray-200 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingNotifications ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                  </div>
                ) : notifications.length > 0 ? (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        setIsNotifOpen(false);
                        onOpenChat?.(notification.chatId);
                      }}
                      className="w-full text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 hover:shadow-md transition cursor-pointer"
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${notification.color}`}>
                        <notification.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h4 className="font-bold text-gray-900 text-sm truncate pr-2">{notification.title}</h4>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {notification.unreadCount > 0 && (
                              <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                                {notification.unreadCount > 99 ? '99+' : notification.unreadCount}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-gray-400">{notification.time}</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{notification.desc}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center pt-8 pb-4">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Bell className="w-8 h-8 text-emerald-200" />
                    </div>
                    <p className="text-sm font-bold text-gray-400">You're all caught up!</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
