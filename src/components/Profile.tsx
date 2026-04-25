import React, { useState, useEffect } from 'react';

import { Award, HandHeart, Package, Settings, LogOut } from 'lucide-react';
import { DonationPost, NeedPost } from '../types';
import { useAuth, handleFirestoreError } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

interface ProfileProps {
  onManagePosts: () => void;
  onManageNeeds: () => void;
  onSettings: () => void;
}

export function Profile({ onManagePosts, onManageNeeds, onSettings }: ProfileProps) {
  const { user, profile, logout } = useAuth();
  const [myDonations, setMyDonations] = useState<DonationPost[]>([]);
  const [myNeeds, setMyNeeds] = useState<NeedPost[]>([]);

  /**
   * Loads donations posted by the current signed-in user.
   */
  const fetchDonations = async () => {
    if (!user) return;

    try {
      const q = query(collection(db, 'posts'), where('donorId', '==', user.uid));
      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as DonationPost[];
      setMyDonations(posts);
      localStorage.setItem('my_donations', JSON.stringify(posts));
    } catch (err) {
      handleFirestoreError(err, 'list', 'posts (my items)');
    }
  };

  /**
   * Loads needs posted by the current signed-in user.
   */
  const fetchNeeds = async () => {
    if (!user) return;

    try {
      const q = query(collection(db, 'needs'), where('requesterId', '==', user.uid));
      const snapshot = await getDocs(q);
      const needs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as NeedPost[];
      setMyNeeds(needs);
    } catch (err) {
      handleFirestoreError(err, 'list', 'needs (my requests)');
    }
  };

  useEffect(() => {
    if (!user) return;

    void fetchDonations();
    void fetchNeeds();
  }, [user]);

  if (!user || !profile) return null;

  return (
    <div className="space-y-8 pb-24">
      <div className="flex flex-col items-center">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-emerald-100 p-1 border-2 border-emerald-500">
            <img 
              src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`} 
              alt="Avatar" 
              className="w-full h-full rounded-full bg-white transition-transform hover:scale-110" 
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute bottom-0 right-0 bg-emerald-500 text-white p-1.5 rounded-full border-2 border-white">
            <Award className="w-4 h-4" />
          </div>
        </div>
        <h2 className="mt-4 text-2xl font-bold">{profile.displayName}</h2>
        <p className="text-gray-500 text-sm font-medium">{profile.state}, Malaysia</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-3xl border border-emerald-50 shadow-sm text-center">
          <span className="block text-2xl font-bold text-emerald-600">{myDonations.length}</span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Donations Posted</span>
        </div>
        <div className="bg-white p-4 rounded-3xl border border-emerald-50 shadow-sm text-center">
          <span className="block text-2xl font-bold text-emerald-600">{myNeeds.length}</span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Needs Posted</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-bold text-gray-900 flex items-center">
            <Package className="w-4 h-4 mr-2 text-emerald-500" />
            My Donations
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onManagePosts}
              className="text-xs text-emerald-600 font-bold hover:underline"
            >
              Manage
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-50 text-sm text-gray-500 font-medium shadow-sm">
          Manage your donation records, visibility, and request history from the manage page.
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-bold text-gray-900 flex items-center">
            <HandHeart className="w-4 h-4 mr-2 text-emerald-500" />
            My Needs
          </h3>
          <button
            type="button"
            onClick={onManageNeeds}
            className="text-xs text-emerald-600 font-bold hover:underline"
          >
            Manage
          </button>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-50 text-sm text-gray-500 font-medium shadow-sm">
          Manage your need requests, priority, and public visibility from the manage page.
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onSettings}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-emerald-50 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center">
            <Settings className="w-5 h-5 mr-3 text-gray-400" />
            <span className="text-sm font-bold">Settings</span>
          </div>
          <span className="text-gray-300">›</span>
        </button>
        <button 
          onClick={logout}
          className="w-full flex items-center justify-between p-4 bg-white rounded-2xl border border-emerald-50 text-red-500 hover:bg-red-50 transition-colors"
        >
          <div className="flex items-center">
            <LogOut className="w-5 h-5 mr-3" />
            <span className="text-sm font-bold">Log Out</span>
          </div>
        </button>
      </div>
    </div>
  );
}
