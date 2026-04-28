import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, HandHeart, MapPin, Pencil, Save, Trash2, X } from 'lucide-react';
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { NeedPost } from '../types';
import { db } from '../lib/firebase';
import { useAuth, handleFirestoreError } from '../contexts/AuthContext';
import { CATEGORY_OPTIONS, getDisplayCategory, isCategoryOption } from '../lib/categories';
import { cn } from '../lib/utils';
import { BrandLoader, BrandLogo } from './BrandLogo';

interface ManageNeedsProps {
  onBack: () => void;
}

type NeedPriority = 'low' | 'medium' | 'high';

const LOCATION_OPTIONS = ['Selangor', 'Kuala Lumpur', 'Pulau Pinang', 'Johor', 'Perak'];

export function ManageNeeds({ onBack }: ManageNeedsProps) {
  const { user } = useAuth();
  const [myNeeds, setMyNeeds] = useState<NeedPost[]>([]);
  const [selectedNeed, setSelectedNeed] = useState<NeedPost | null>(null);
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCustomCategory, setEditCustomCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<NeedPriority>('medium');
  const [editLocation, setEditLocation] = useState('Selangor');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');
  const [isLoading, setIsLoading] = useState(true);

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
    return Date.now();
  };

  const fetchNeeds = async () => {
    if (!user) return;

    try {
      const q = query(collection(db, 'needs'), where('requesterId', '==', user.uid));
      const snapshot = await getDocs(q);
      const needs = snapshot.docs
        .map((needDoc) => {
          const data = needDoc.data();
          return {
            id: needDoc.id,
            ...data,
            createdAt: toMillis(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt) as NeedPost[];

      setMyNeeds(needs);
    } catch (err) {
      handleFirestoreError(err, 'list', 'needs (manage needs)');
      setStatusType('error');
      setStatusMessage('Unable to load your needs right now.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void fetchNeeds();
  }, [user]);

  const startEdit = (need: NeedPost) => {
    setEditingNeedId(need.id);
    setEditTitle(need.title || '');
    setEditCategory(isCategoryOption(need.category) ? need.category : 'Other');
    setEditCustomCategory(need.customCategory || (isCategoryOption(need.category) ? '' : need.category || ''));
    setEditDescription(need.description || '');
    setEditPriority(need.priority);
    setEditLocation(need.state || 'Selangor');
    setStatusMessage(null);
  };

  const cancelEdit = () => {
    setEditingNeedId(null);
    setEditTitle('');
    setEditCategory('');
    setEditCustomCategory('');
    setEditDescription('');
    setEditPriority('medium');
    setEditLocation('Selangor');
  };

  const saveEdit = async (needId: string) => {
    const title = editTitle.trim();
    const category = editCategory.trim();
    const customCategory = category === 'Other' ? editCustomCategory.trim() : '';
    const description = editDescription.trim();

    if (!title || title.length > 200) {
      setStatusType('error');
      setStatusMessage('Title is required and must be 200 characters or less.');
      return;
    }

    if (!isCategoryOption(category)) {
      setStatusType('error');
      setStatusMessage('Please select a valid category.');
      return;
    }

    if (category === 'Other' && !customCategory) {
      setStatusType('error');
      setStatusMessage('Please specify the custom category.');
      return;
    }

    if (customCategory.length > 100) {
      setStatusType('error');
      setStatusMessage('Custom category must be 100 characters or less.');
      return;
    }

    if (description.length > 5000) {
      setStatusType('error');
      setStatusMessage('Description must be 5000 characters or less.');
      return;
    }

    try {
      await updateDoc(doc(db, 'needs', needId), {
        title,
        category,
        customCategory: customCategory || null,
        description,
        priority: editPriority,
        state: editLocation,
        visibility: selectedNeed?.visibility || 'visible',
      });

      const nextNeed = {
        title,
        category,
        customCategory: customCategory || null,
        description,
        priority: editPriority,
        state: editLocation,
        visibility: selectedNeed?.visibility || 'visible',
      };

      setMyNeeds((prev) =>
        prev.map((need) => (need.id === needId ? { ...need, ...nextNeed } : need))
      );
      setSelectedNeed((prev) => (prev?.id === needId ? { ...prev, ...nextNeed } : prev));
      setStatusType('success');
      setStatusMessage('Need updated successfully.');
      cancelEdit();
    } catch (err) {
      handleFirestoreError(err, 'update', `needs/${needId}`);
      setStatusType('error');
      setStatusMessage('Update failed. Check permissions or try again.');
    }
  };

  const removeNeed = async (need: NeedPost) => {
    const shouldDelete = window.confirm('Delete this need permanently?');
    if (!shouldDelete) return;

    try {
      await deleteDoc(doc(db, 'needs', need.id));
      setMyNeeds((prev) => prev.filter((item) => item.id !== need.id));
      setSelectedNeed((prev) => (prev?.id === need.id ? null : prev));
      setStatusType('success');
      setStatusMessage('Need deleted successfully.');
    } catch (err) {
      handleFirestoreError(err, 'delete', `needs/${need.id}`);
      setStatusType('error');
      setStatusMessage('Delete failed. Check permissions or try again.');
    }
  };

  const toggleNeedVisibility = async (need: NeedPost) => {
    const nextVisibility = need.visibility === 'hidden' ? 'visible' : 'hidden';

    try {
      await updateDoc(doc(db, 'needs', need.id), {
        visibility: nextVisibility,
      });

      setMyNeeds((prev) =>
        prev.map((item) => (item.id === need.id ? { ...item, visibility: nextVisibility } : item))
      );
      setSelectedNeed((prev) => (prev?.id === need.id ? { ...prev, visibility: nextVisibility } : prev));
      setStatusType('success');
      setStatusMessage(nextVisibility === 'hidden' ? 'Need hidden from public display.' : 'Need visible again.');
    } catch (err) {
      handleFirestoreError(err, 'update', `needs/${need.id}/visibility`);
      setStatusType('error');
      setStatusMessage('Visibility update failed. Check permissions or try again.');
    }
  };

  if (!user) return null;

  if (selectedNeed) {
    const isEditing = editingNeedId === selectedNeed.id;

    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => {
              cancelEdit();
              setSelectedNeed(null);
            }}
            className="p-2 rounded-full bg-white border border-emerald-100 text-emerald-700 shadow-sm"
            aria-label="Back to need list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (isEditing ? cancelEdit() : startEdit(selectedNeed))}
              className="px-3 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold inline-flex items-center gap-2"
            >
              {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
              {isEditing ? 'Cancel' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={() => toggleNeedVisibility(selectedNeed)}
              className="px-3 py-2 rounded-full bg-gray-50 border border-gray-100 text-gray-700 text-xs font-bold inline-flex items-center gap-2"
            >
              {selectedNeed.visibility === 'hidden' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {selectedNeed.visibility === 'hidden' ? 'Show' : 'Hide'}
            </button>
            <button
              type="button"
              onClick={() => removeNeed(selectedNeed)}
              className="px-3 py-2 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold inline-flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={cn(
            'p-3 rounded-2xl text-sm font-semibold border',
            statusType === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
          )}>
            {statusMessage}
          </div>
        )}

        <div className="bg-white rounded-3xl border border-emerald-50 shadow-sm p-5 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <HandHeart className="w-7 h-7" />
            </div>
            <div className="min-w-0 flex-1">
              <span className={cn(
                'px-2 py-1 text-[10px] font-bold rounded-lg uppercase',
                selectedNeed.priority === 'high' ? 'bg-red-100 text-red-600' :
                selectedNeed.priority === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'
              )}>
                {selectedNeed.priority} Priority
              </span>
              {selectedNeed.visibility === 'hidden' && (
                <span className="ml-2 px-2 py-1 text-[10px] font-bold rounded-lg uppercase bg-red-100 text-red-600">
                  Hidden
                </span>
              )}
              <h2 className="mt-3 text-2xl font-black text-gray-900 leading-tight">{selectedNeed.title}</h2>
              <p className="mt-2 text-sm text-gray-500">{getDisplayCategory(selectedNeed)}</p>
            </div>
          </div>

          <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-2 rounded-2xl text-sm font-semibold">
            <MapPin className="w-4 h-4 mr-2" />
            {selectedNeed.state}
          </div>

          <p className="text-gray-600 leading-relaxed text-[15px] whitespace-pre-wrap bg-gray-50 p-4 rounded-2xl">
            {selectedNeed.description || 'No extra details provided.'}
          </p>

          {isEditing && (
            <div className="space-y-3 border-t border-emerald-50 pt-4">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={200}
                className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
                placeholder="Title"
              />

              <select
                value={editCategory}
                onChange={(e) => {
                  setEditCategory(e.target.value);
                  if (e.target.value !== 'Other') setEditCustomCategory('');
                }}
                className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
              >
                <option value="">Select category</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>

              {editCategory === 'Other' && (
                <input
                  type="text"
                  value={editCustomCategory}
                  onChange={(e) => setEditCustomCategory(e.target.value)}
                  maxLength={100}
                  className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
                  placeholder="Specify category"
                />
              )}

              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as NeedPriority[]).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    onClick={() => setEditPriority(priority)}
                    className={cn(
                      'rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide border transition',
                      editPriority === priority
                        ? priority === 'high'
                          ? 'bg-red-100 text-red-700 border-red-200'
                          : priority === 'medium'
                            ? 'bg-orange-100 text-orange-700 border-orange-200'
                            : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : 'bg-white text-gray-500 border-emerald-100'
                    )}
                  >
                    {priority}
                  </button>
                ))}
              </div>

              <select
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
              >
                {LOCATION_OPTIONS.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>

              <textarea
                rows={4}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={5000}
                className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-sm"
                placeholder="Description"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2.5 text-xs font-bold rounded-full bg-gray-100 text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => saveEdit(selectedNeed.id)}
                  className="px-4 py-2.5 text-xs font-bold rounded-full bg-emerald-600 text-white inline-flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-full bg-white border border-emerald-100 text-emerald-700 shadow-sm"
          aria-label="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Profile</p>
          <h2 className="text-2xl font-black text-gray-900">Manage Needs</h2>
        </div>
      </div>

      {statusMessage && (
        <div className={cn(
          'p-3 rounded-2xl text-sm font-semibold border',
          statusType === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'
        )}>
          {statusMessage}
        </div>
      )}

      {isLoading ? (
        <BrandLoader className="py-20" label="Loading your needs" />
      ) : myNeeds.length === 0 ? (
        <div className="bg-white p-6 rounded-2xl border border-emerald-50 text-center text-gray-500 font-medium shadow-sm flex flex-col items-center gap-3">
          <BrandLogo className="h-14 w-14" />
          You have no needs yet.
        </div>
      ) : (
        <div className="space-y-3">
          {myNeeds.map((need) => (
            <button
              key={need.id}
              type="button"
              onClick={() => setSelectedNeed(need)}
              className="text-left w-full bg-white rounded-[20px] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-emerald-50"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={cn(
                  'px-2 py-1 text-[10px] font-bold rounded-lg uppercase',
                  need.priority === 'high' ? 'bg-red-100 text-red-600' :
                  need.priority === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'
                )}>
                  {need.priority} Priority
                </span>
                <span className="text-xs text-gray-400 font-semibold">{need.state}</span>
              </div>
              {need.visibility === 'hidden' && (
                <span className="mt-3 inline-flex px-2 py-1 text-[10px] font-bold rounded-lg uppercase bg-red-100 text-red-600">
                  Hidden
                </span>
              )}
              <h3 className="mt-3 font-bold text-gray-800 text-base leading-snug line-clamp-2">{need.title}</h3>
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{getDisplayCategory(need)}</p>
              <p className="text-[11px] text-gray-400 mt-3">Tap to open details</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
