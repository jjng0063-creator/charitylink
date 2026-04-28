import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { PostCard } from './components/PostCard';
import { CreatePost } from './components/CreatePost';
import { Profile } from './components/Profile';
import { ManagePosts } from './components/ManagePosts';
import { ManageNeeds } from './components/ManageNeeds';
import { AccountSettings } from './components/AccountSettings';
import { PostDetails } from './components/PostDetails';
import { NeedDetails } from './components/NeedDetails';
import { Chat } from './components/Chat';
import { BrandLoader, BrandLogo } from './components/BrandLogo';
import { db } from './lib/firebase';
import { collection, query, where, onSnapshot, doc, serverTimestamp, writeBatch, increment, arrayUnion } from 'firebase/firestore';
import { DonationPost, NeedPost } from './types';

import { CalendarClock, Heart, Search, Filter, LogIn, MapPin, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth, handleFirestoreError } from './contexts/AuthContext';
import { cn } from './lib/utils';
import { CATEGORY_OPTIONS, getDisplayCategory } from './lib/categories';
import { getCurrentCoordinates } from './lib/location';

const LOCATION_OPTIONS = [
  { name: 'Selangor', latitude: 3.0738, longitude: 101.5183 },
  { name: 'Kuala Lumpur', latitude: 3.139, longitude: 101.6869 },
  { name: 'Pulau Pinang', latitude: 5.4164, longitude: 100.3327 },
  { name: 'Johor', latitude: 1.4927, longitude: 103.7414 },
  { name: 'Perak', latitude: 4.5975, longitude: 101.0901 },
] as const;

const getNearestSupportedLocation = (latitude: number, longitude: number) => {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;

  const distanceTo = (target: { latitude: number; longitude: number }) => {
    const latDistance = toRadians(target.latitude - latitude);
    const lonDistance = toRadians(target.longitude - longitude);
    const startLat = toRadians(latitude);
    const targetLat = toRadians(target.latitude);

    const haversine =
      Math.sin(latDistance / 2) ** 2 +
      Math.cos(startLat) * Math.cos(targetLat) * Math.sin(lonDistance / 2) ** 2;

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  };

  return LOCATION_OPTIONS.reduce((nearest, option) =>
    distanceTo(option) < distanceTo(nearest) ? option : nearest
  ).name;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const { user, profile, loading, login, isInitial } = useAuth();
  const [userLocation, setUserLocation] = useState('Selangor');
  const [hasPickedLocation, setHasPickedLocation] = useState(false);
  const [selectedPost, setSelectedPost] = useState<DonationPost | null>(null);
  const [selectedNeed, setSelectedNeed] = useState<NeedPost | null>(null);
  const [needs, setNeeds] = useState<NeedPost[]>([]);
  const [isNeedsLoading, setIsNeedsLoading] = useState(true);
  const [posts, setPosts] = useState<DonationPost[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Feature states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<string | null>(null);
  const [pendingCategory, setPendingCategory] = useState<string>('');
  const [pendingLocation, setPendingLocation] = useState<string>('');
  const [activeNeedCategory, setActiveNeedCategory] = useState<string | null>(null);
  const [activeNeedLocation, setActiveNeedLocation] = useState<string | null>(null);
  const [activeNeedPriority, setActiveNeedPriority] = useState<string | null>(null);
  const [pendingNeedCategory, setPendingNeedCategory] = useState<string>('');
  const [pendingNeedLocation, setPendingNeedLocation] = useState<string>('');
  const [pendingNeedPriority, setPendingNeedPriority] = useState<string>('');
  const [filterTarget, setFilterTarget] = useState<'posts' | 'needs'>('posts');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isViewingAll, setIsViewingAll] = useState(false);
  const hasPickedLocationRef = useRef(false);
  
  const LOCATIONS = LOCATION_OPTIONS.map((location) => location.name);

  const handleLocationChange = (location: string) => {
    setHasPickedLocation(true);
    hasPickedLocationRef.current = true;
    setUserLocation(location);
  };

  const openPostFilterDrawer = () => {
    setFilterTarget('posts');
    setPendingCategory(activeCategory || '');
    setPendingLocation(activeLocation || '');
    setIsFilterOpen(true);
  };

  const openNeedsFilterDrawer = () => {
    setFilterTarget('needs');
    setPendingNeedCategory(activeNeedCategory || '');
    setPendingNeedLocation(activeNeedLocation || '');
    setPendingNeedPriority(activeNeedPriority || '');
    setIsFilterOpen(true);
  };

  const clearPostFilters = () => {
    setPendingCategory('');
    setPendingLocation('');
    setActiveCategory(null);
    setActiveLocation(null);
  };

  const clearNeedFilters = () => {
    setPendingNeedCategory('');
    setPendingNeedLocation('');
    setPendingNeedPriority('');
    setActiveNeedCategory(null);
    setActiveNeedLocation(null);
    setActiveNeedPriority(null);
  };

  const applyFilters = () => {
    if (filterTarget === 'needs') {
      setActiveNeedCategory(pendingNeedCategory || null);
      setActiveNeedLocation(pendingNeedLocation || null);
      setActiveNeedPriority(pendingNeedPriority || null);
    } else {
      setActiveCategory(pendingCategory || null);
      setActiveLocation(pendingLocation || null);
    }

    setIsFilterOpen(false);
  };

  const clearFilters = () => {
    if (filterTarget === 'needs') {
      clearNeedFilters();
    } else {
      clearPostFilters();
    }
  };

  /**
   * Switches tabs and clears the active chat unless the transition is an intentional chat open.
   */
  const handleTabChange = (tab: string, preserveChat = false) => {
    if (tab !== 'messages' || !preserveChat) {
      setActiveChatId(null);
    }

    setActiveTab(tab);
  };

  /**
   * Builds a deterministic chat ID so the same two users always share one chat room.
   */
  const buildChatId = (userA: string, userB: string) => {
    const [a, b] = [userA, userB].sort();
    // Length-prefixed format avoids accidental collisions when IDs contain separators.
    return `${a.length}:${a}|${b.length}:${b}`;
  };

  /**
   * Opens a chat thread and keeps the current thread selected.
   */
  const openChat = (chatId: string) => {
    setActiveChatId(chatId);
    handleTabChange('messages', true);
    setSelectedPost(null);
    setSelectedNeed(null);
  };

  useEffect(() => {
    const handlePushChatOpen = (event: Event) => {
      const chatId = (event as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (chatId) {
        openChat(chatId);
      }
    };

    window.addEventListener('charitylink:open-chat', handlePushChatOpen);
    return () => window.removeEventListener('charitylink:open-chat', handlePushChatOpen);
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Fetch all available posts to show same location first, then others
    const q = query(
      collection(db, 'posts'), 
      where('status', '==', 'available')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || Date.now(),
          updatedAt: data.updatedAt?.toMillis?.() || Date.now(),
        };
      }) as DonationPost[];
      
      // Separate posts into same location and other locations
      const visiblePosts = postsData.filter(post => post.visibility !== 'hidden');
      const sameLocation = visiblePosts.filter(post => post.state === userLocation);
      const otherLocation = visiblePosts.filter(post => post.state !== userLocation);
      
      // Shuffle function using Fisher-Yates algorithm
      const shuffleArray = <T,>(array: T[]): T[] => {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
      };

      // Shuffle both lists to provide a dynamic feed
      const shuffledSame = shuffleArray(sameLocation);
      const shuffledOther = shuffleArray(otherLocation);
      
      // Combine with same location first
      setPosts([...shuffledSame, ...shuffledOther]);
      setIsPostsLoading(false);
    }, (err) => {
      handleFirestoreError(err, 'list', 'posts');
      setIsPostsLoading(false);
    });

    const needsQuery = query(collection(db, 'needs'));

    const unsubscribeNeeds = onSnapshot(needsQuery, (snapshot) => {
      const needsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toMillis?.() || Date.now()
        };
      }) as NeedPost[];
      setNeeds(needsData);
      setIsNeedsLoading(false);
    }, (err) => {
      handleFirestoreError(err, 'list', 'needs');
      setIsNeedsLoading(false);
    });

    return () => {
      unsubscribe();
      unsubscribeNeeds();
    };
  }, [user, userLocation]);

  useEffect(() => {
    if (profile?.state && !hasPickedLocation) {
      setUserLocation(profile.state);
    }
  }, [profile?.state, hasPickedLocation]);

  useEffect(() => {
    if (!user || hasPickedLocation) return;

    let isCancelled = false;

    const detectLocation = async () => {
      const coordinates = await getCurrentCoordinates();
      if (isCancelled || hasPickedLocationRef.current) return;

      if (coordinates) {
        setUserLocation(getNearestSupportedLocation(coordinates.latitude, coordinates.longitude));
        return;
      }

      if (profile?.state) {
        setUserLocation(profile.state);
      }
    };

    void detectLocation();

    return () => {
      isCancelled = true;
    };
  }, [user, hasPickedLocation, profile?.state]);

  if (loading || isInitial) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-eco-bg">
        <BrandLoader />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-eco-bg flex flex-col items-center justify-center p-8 text-center space-y-8">
        <BrandLogo className="h-28 w-28" />
        <div className="space-y-2">
          <h1 className="text-4xl font-black text-gray-900 leading-tight">CharityLink</h1>
          <p className="text-gray-500 font-medium max-w-[240px] mx-auto">Connecting donors with local charities for a greener world.</p>
        </div>
        <button 
          onClick={login}
          className="w-full max-w-xs flex items-center justify-center space-x-3 bg-white text-gray-700 py-4 px-6 rounded-3xl border border-gray-100 shadow-sm hover:bg-gray-50 transition-all active:scale-95"
        >
          <LogIn className="w-5 h-5 text-emerald-600" />
          <span className="font-bold">Sign in with Google</span>
        </button>
      </div>
    );
  }

  // Filter logic
  const filteredPosts = posts.filter(post => {
    const matchesSearch = !searchQuery || 
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      post.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getDisplayCategory(post).toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = !activeCategory || post.category === activeCategory;
    const matchesLocation = !activeLocation || post.state === activeLocation;
    return matchesSearch && matchesCategory && matchesLocation;
  });

  const displayedPosts = isViewingAll ? filteredPosts : filteredPosts.slice(0, 4);
  const needPriorityRank = { high: 0, medium: 1, low: 2 };
  const visibleNeeds = needs.filter(need => need.visibility !== 'hidden');
  const orderedNeeds = [
    ...visibleNeeds
      .filter(need => need.state === userLocation)
      .sort((a, b) => needPriorityRank[a.priority] - needPriorityRank[b.priority]),
    ...visibleNeeds
      .filter(need => need.state !== userLocation)
      .sort((a, b) => needPriorityRank[a.priority] - needPriorityRank[b.priority]),
  ];
  const filteredNeeds = orderedNeeds.filter(need => {
    const matchesCategory = !activeNeedCategory || need.category === activeNeedCategory;
    const matchesLocation = !activeNeedLocation || need.state === activeNeedLocation;
    const matchesPriority = !activeNeedPriority || need.priority === activeNeedPriority;
    return matchesCategory && matchesLocation && matchesPriority;
  });
  const isFilteringNeeds = filterTarget === 'needs';

  /**
   * Opens an existing chat or creates one atomically by deterministic ID.
   */
  const handleStartChat = async (targetUserId: string, targetUserName: string, initialMessage?: string, relatedPostId?: string) => {
    if (!user) {
      alert("Please sign in to start a chat.");
      return;
    }
    if (!targetUserId) {
      alert("Error: Missing donor information.");
      return;
    }
    if (user.uid === targetUserId) {
      alert("You cannot start a chat with yourself! This post/need was created by you.");
      return;
    }

    const chatId = buildChatId(user.uid, targetUserId);
    const chatRef = doc(db, 'chats', chatId);
    const trimmedInitialMessage = initialMessage?.trim();
    const participantDetails = {
      [user.uid]: { displayName: profile?.displayName || user.displayName || 'Eco Hero' },
      [targetUserId]: { displayName: targetUserName },
    };
    const newChatPayload = {
      participants: [user.uid, targetUserId],
      participantDetails,
      relatedPostIds: relatedPostId ? [relatedPostId] : [],
      unreadBy: {
        [user.uid]: 0,
        [targetUserId]: trimmedInitialMessage ? 1 : 0,
      },
      lastMessage: trimmedInitialMessage || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const isMissingChatBootstrapError = (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ['not-found', 'permission-denied'].includes((error as { code?: string }).code || '');

    try {
      if (!trimmedInitialMessage) {
        if (relatedPostId) {
          try {
            const batch = writeBatch(db);
            batch.update(chatRef, {
              relatedPostIds: arrayUnion(relatedPostId),
            });
            await batch.commit();
          } catch (error) {
            if (!isMissingChatBootstrapError(error)) {
              throw error;
            }

            const createBatch = writeBatch(db);
            createBatch.set(chatRef, newChatPayload);
            await createBatch.commit();
          }
        }
      } else {
        const messageRef = doc(collection(db, `chats/${chatId}/messages`));
        const messagePayload = {
          senderId: user.uid,
          text: trimmedInitialMessage,
          createdAt: serverTimestamp(),
        };

        try {
          const batch = writeBatch(db);
          batch.set(messageRef, messagePayload);
          batch.update(chatRef, {
            lastMessage: trimmedInitialMessage,
            updatedAt: serverTimestamp(),
            [`unreadBy.${user.uid}`]: 0,
            [`unreadBy.${targetUserId}`]: increment(1),
            ...(relatedPostId ? { relatedPostIds: arrayUnion(relatedPostId) } : {}),
          });
          await batch.commit();
        } catch (error) {
          if (!isMissingChatBootstrapError(error)) {
            throw error;
          }

          const createBatch = writeBatch(db);
          createBatch.set(chatRef, newChatPayload);
          createBatch.set(messageRef, messagePayload);
          await createBatch.commit();
        }
      }

      openChat(chatId);
    } catch (err: any) {
      console.error("Failed to start chat", err);
      alert("Failed to start chat: " + (err.message || err));
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="space-y-6">
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search items..." 
                  className="w-full pl-10 pr-4 py-3 bg-white border border-emerald-50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <button 
                onClick={openPostFilterDrawer}
                className="p-3 bg-white border border-emerald-50 rounded-2xl text-emerald-600 shadow-sm transition hover:bg-emerald-50"
              >
                <Filter className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {isViewingAll ? "All Donations" : "Featured Donations"}
                </h2>
                {!isViewingAll && filteredPosts.length > 4 && (
                  <button 
                    onClick={() => setIsViewingAll(true)}
                    className="text-emerald-600 text-sm font-bold active:scale-95 transition"
                  >
                    View All
                  </button>
                )}
              </div>
              
              {/* Xiaohongshu Masonry Grid */}
              <div className="columns-2 gap-3 pb-24">
                {isPostsLoading ? (
                  <BrandLoader className="[column-span:all] py-20 w-full break-inside-avoid" label="Loading donations" />
                ) : displayedPosts.length > 0 ? (
                  displayedPosts.map((post) => (
                    <PostCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />
                  ))
                ) : (
                  <div className="[column-span:all] min-h-[360px] pb-24 flex flex-col items-center justify-center text-center space-y-4 w-full break-inside-avoid">
                    <BrandLogo className="h-16 w-16" />
                    <p className="text-gray-500 font-medium">No results found.</p>
                    {(searchQuery || activeCategory || activeLocation) && (
                      <button 
                        onClick={() => {
                          setSearchQuery('');
                          clearPostFilters();
                        }}
                        className="text-emerald-600 font-bold bg-emerald-50 px-6 py-2 rounded-full"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      
      case 'needs':
        return (
          <div className="space-y-6 pb-24">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Charity Needs</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={openNeedsFilterDrawer}
                  className="p-3 bg-white border border-emerald-50 rounded-2xl text-emerald-600 shadow-sm transition hover:bg-emerald-50"
                >
                  <Filter className="w-5 h-5" />
                </button>
                <Heart className="text-red-500 fill-red-500 w-6 h-6" />
              </div>
            </div>
            
            <div className="space-y-4">
              {isNeedsLoading ? (
                <BrandLoader className="py-20 w-full" label="Loading needs" />
              ) : filteredNeeds.length > 0 ? (
                filteredNeeds.map((need) => (
                  <div key={need.id} className="bg-white p-5 rounded-3xl border border-emerald-50 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                      <span className={cn(
                        "px-2 py-1 text-[10px] font-bold rounded-lg uppercase",
                        need.priority === 'high' ? "bg-red-100 text-red-600" :
                        need.priority === 'medium' ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600"
                      )}>
                        {need.priority} Priority
                      </span>
                      <span className="text-xs text-gray-400 font-medium">{need.requesterName}</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">{need.title}</h3>
                    {need.category && (
                      <div className="inline-flex px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                        {getDisplayCategory(need)}
                      </div>
                    )}
                    <p className="text-gray-500 text-sm leading-relaxed">{need.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-2 rounded-2xl">
                        <MapPin className="w-4 h-4 mr-1.5" />
                        {need.state}
                      </div>
                      <div className="flex items-center text-xs font-semibold text-gray-400 bg-gray-50 px-3 py-2 rounded-2xl">
                        <CalendarClock className="w-4 h-4 mr-1.5" />
                        Posted {format(need.createdAt, 'dd MMM yyyy, h:mm a')}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedNeed(need)}
                        className="w-full bg-white border border-emerald-100 text-emerald-700 py-3 rounded-2xl font-bold text-sm hover:bg-emerald-50 transition-colors"
                      >
                        View Details
                      </button>
                      <button 
                        onClick={() => handleStartChat(need.requesterId, need.requesterName, `Hi! I'd like to support your need: ${need.title}`)}
                        className="w-full bg-emerald-600 text-white py-3 rounded-2xl font-bold text-sm hover:bg-emerald-700 transition-colors"
                      >
                        Support Need
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center space-y-4 w-full flex flex-col items-center">
                  <BrandLogo className="h-16 w-16" />
                  <p className="text-gray-500 font-medium">
                    No needs found{activeNeedLocation ? ` in ${activeNeedLocation}` : ''}.
                  </p>
                  {(activeNeedCategory || activeNeedLocation || activeNeedPriority) && (
                    <button
                      onClick={clearNeedFilters}
                      className="text-emerald-600 font-bold bg-emerald-50 px-6 py-2 rounded-full"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      case 'messages':
        return <Chat activeChatId={activeChatId} onChatChange={setActiveChatId} />;

      case 'post':
        return <CreatePost />;

      case 'profile':
        return (
          <Profile
            onManagePosts={() => handleTabChange('manage-posts')}
            onManageNeeds={() => handleTabChange('manage-needs')}
            onSettings={() => handleTabChange('account-settings')}
          />
        );

      case 'manage-posts':
        return <ManagePosts onBack={() => handleTabChange('profile')} />;

      case 'manage-needs':
        return <ManageNeeds onBack={() => handleTabChange('profile')} />;

      case 'account-settings':
        return <AccountSettings onBack={() => handleTabChange('profile')} />;

      default:
        return (
          <div className="flex flex-col items-center justify-center h-[50vh] text-center px-8">
            <BrandLogo className="mb-4 h-20 w-20" />
            <h3 className="text-xl font-bold text-gray-900">Feature Coming Soon</h3>
            <p className="text-gray-500 mt-2">Our team is hard at work building this part of the CharityLink experience.</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-eco-bg text-gray-900 pb-20">
      <Header location={userLocation} setLocation={handleLocationChange} onOpenChat={openChat} />
      
      <main className="max-w-md mx-auto px-5 pt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      <Navigation activeTab={activeTab} onTabChange={handleTabChange} />

      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center"
          >
            <PostDetails post={selectedPost} onBack={() => setSelectedPost(null)} onChat={handleStartChat} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedNeed && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm sm:items-center sm:justify-center"
          >
            <NeedDetails need={selectedNeed} onBack={() => setSelectedNeed(null)} onChat={handleStartChat} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Options Drawer */}
      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex flex-col justify-end"
            onClick={() => setIsFilterOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white max-w-md mx-auto w-full rounded-t-3xl overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-5 flex items-center justify-between border-b border-gray-100">
                <h3 className="text-lg font-bold text-gray-900">
                  Filter {isFilteringNeeds ? 'Needs' : 'Posts'}
                </h3>
                <button onClick={() => setIsFilterOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Category</p>
                  <select
                    value={isFilteringNeeds ? pendingNeedCategory : pendingCategory}
                    onChange={(event) => {
                      if (isFilteringNeeds) {
                        setPendingNeedCategory(event.target.value);
                      } else {
                        setPendingCategory(event.target.value);
                      }
                    }}
                    className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">All Categories</option>
                    {CATEGORY_OPTIONS.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Location</p>
                  <select
                    value={isFilteringNeeds ? pendingNeedLocation : pendingLocation}
                    onChange={(event) => {
                      if (isFilteringNeeds) {
                        setPendingNeedLocation(event.target.value);
                      } else {
                        setPendingLocation(event.target.value);
                      }
                    }}
                    className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="">All Locations</option>
                    {LOCATIONS.map(location => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </div>

                {isFilteringNeeds && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 px-1">Priority</p>
                    <select
                      value={pendingNeedPriority}
                      onChange={(event) => setPendingNeedPriority(event.target.value)}
                      className="w-full rounded-2xl border border-emerald-100 bg-white px-4 py-4 text-sm font-bold text-gray-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
                    >
                      <option value="">All Priorities</option>
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>
                  </div>
                )}

                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  Showing {isFilteringNeeds ? pendingNeedCategory || 'all categories' : pendingCategory || 'all categories'} in {isFilteringNeeds ? pendingNeedLocation || 'all locations' : pendingLocation || 'all locations'}{isFilteringNeeds ? ` with ${pendingNeedPriority || 'all priorities'}` : ''} after you apply.
                </div>
              </div>
              <div className="p-5 border-t border-gray-100">
                <div className="flex gap-3">
                  <button
                    onClick={clearFilters}
                    className="flex-1 bg-gray-100 text-gray-700 font-bold py-4 rounded-full active:scale-95 transition"
                  >
                    Clear
                  </button>
                  <button 
                    onClick={applyFilters}
                    className="flex-1 bg-emerald-600 text-white font-bold py-4 rounded-full shadow-md active:scale-95 transition"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
