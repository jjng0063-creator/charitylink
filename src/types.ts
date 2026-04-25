export type UserRole = 'donor' | 'charity';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  state: string; // Location state (e.g., "Selangor")
  bio?: string;
  createdAt: number;
}

export type PostStatus = 'available' | 'claimed' | 'donated';

export interface DonationPost {
  id: string;
  donorId: string;
  donorName: string;
  title: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[];
  category: string;
  customCategory?: string | null;
  state: string;
  status: PostStatus;
  visibility?: 'visible' | 'hidden';
  createdAt: number;
  updatedAt: number;
}

export interface NeedPost {
  id: string;
  requesterId: string;
  requesterName: string;
  title: string;
  description: string;
  category?: string;
  customCategory?: string | null;
  priority: 'low' | 'medium' | 'high';
  state: string;
  visibility?: 'visible' | 'hidden';
  createdAt: number;
}

export interface ChatRoom {
  id: string;
  participants: string[];
  participantDetails: Record<string, { displayName: string, photoURL?: string }>;
  lastMessage?: string;
  relatedPostIds?: string[];
  unreadBy?: Record<string, number>;
  updatedAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: number;
}
