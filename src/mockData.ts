import { DonationPost, NeedPost, UserProfile } from './types';

export const MOCK_USER: UserProfile = {
  uid: 'user-1',
  email: 'donor@example.com',
  displayName: 'Eco Donor',
  role: 'donor',
  state: 'Selangor',
  createdAt: Date.now(),
};

export const MOCK_POSTS: DonationPost[] = [
  {
    id: 'post-1',
    donorId: 'user-1',
    donorName: 'Eco Donor',
    title: 'Recycled Paper Notebooks',
    description: 'A set of 5 notebooks made from 100% recycled paper. Perfect for students.',
    imageUrl: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&q=80&w=400',
    category: 'Stationery',
    state: 'Selangor',
    status: 'available',
    createdAt: Date.now() - 1000000,
    updatedAt: Date.now() - 1000000,
  },
  {
    id: 'post-2',
    donorId: 'user-2',
    donorName: 'Sustainable Sam',
    title: 'Organic Cotton T-shirts',
    description: 'Pack of 3 white cotton t-shirts, size M. Like new.',
    imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=400',
    category: 'Clothing',
    state: 'Selangor',
    status: 'available',
    createdAt: Date.now() - 2000000,
    updatedAt: Date.now() - 2000000,
  },
];

export const MOCK_NEEDS: NeedPost[] = [
  {
    id: 'need-1',
    requesterId: 'user-3',
    requesterName: 'Green Earth Foundation',
    title: 'Reusable Water Bottles',
    description: 'We need 50 BPA-free water bottles for our upcoming community garden event.',
    category: 'Other',
    customCategory: 'Essentials',
    priority: 'high',
    state: 'Selangor',
    createdAt: Date.now() - 500000,
  },
];
