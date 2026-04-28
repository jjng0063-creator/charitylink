import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Clock, Eye, EyeOff, ImagePlus, MapPin, MessageSquare, Pencil, Save, Trash2, User, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { ChatRoom, DonationPost } from '../types';
import { useAuth, handleFirestoreError } from '../contexts/AuthContext';
import { db, storage } from '../lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CATEGORY_OPTIONS, getDisplayCategory, isCategoryOption } from '../lib/categories';
import { BrandLoader, BrandLogo } from './BrandLogo';

interface ManagePostsProps {
  onBack: () => void;
}

type RequestInsight = {
  id: string;
  requesterName: string;
  preview: string;
};

const getPostImages = (post: DonationPost) => post.imageUrls?.length ? post.imageUrls : [post.imageUrl];

export function ManagePosts({ onBack }: ManagePostsProps) {
  const { user } = useAuth();
  const [myDonations, setMyDonations] = useState<DonationPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<DonationPost | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCustomCategory, setEditCustomCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editSelectedFile, setEditSelectedFile] = useState<File | null>(null);
  const [requestInsights, setRequestInsights] = useState<RequestInsight[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');
  const [isLoading, setIsLoading] = useState(true);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [editGallery, setEditGallery] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editGalleryInputRef = useRef<HTMLInputElement>(null);

  /**
   * Normalizes Firestore timestamp-like values to epoch milliseconds.
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

  /**
   * Shortens a message for the request analysis panel.
   */
  const previewText = (text?: string) => {
    if (!text) return 'No message yet.';
    return text.length > 72 ? `${text.slice(0, 72)}...` : text;
  };

  /**
   * Loads donations posted by the current signed-in user.
   */
  const fetchDonations = async () => {
    if (!user) return;

    try {
      const q = query(collection(db, 'posts'), where('donorId', '==', user.uid));
      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DonationPost[];
      setMyDonations(posts);
    } catch (err) {
      handleFirestoreError(err, 'list', 'posts (manage posts)');
      setStatusType('error');
      setStatusMessage('Unable to load your donations right now.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchDonations();
  }, [user]);

  useEffect(() => {
    if (!selectedPost || editingPostId !== selectedPost.id || editSelectedFile) return;

    const currentImages = editGallery.length ? editGallery : getPostImages(selectedPost);
    setEditImage(currentImages[selectedImageIndex] || currentImages[0] || null);
  }, [selectedImageIndex, selectedPost, editingPostId, editSelectedFile, editGallery]);

  useEffect(() => {
    if (!user || !selectedPost) return;

    let cancelled = false;

    const loadRequestAnalysis = async () => {
      setIsAnalysisLoading(true);
      try {
        const q = query(collection(db, 'chats'), where('participants', 'array-contains', user.uid));
        const snapshot = await getDocs(q);
        const relatedChats = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ChatRoom)
          .filter((chat) => Array.isArray(chat.relatedPostIds) && chat.relatedPostIds.includes(selectedPost.id))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));

        const insights: RequestInsight[] = relatedChats.map((chat) => {
          const requesterId = chat.participants.find((id) => id !== user.uid) || chat.participants[0];
          const requesterName = chat.participantDetails?.[requesterId]?.displayName || 'Unknown user';
          return {
            id: chat.id,
            requesterName,
            preview: previewText(chat.lastMessage),
          };
        });

        if (!cancelled) setRequestInsights(insights);
      } catch (err) {
        handleFirestoreError(err, 'list', `chats (analysis for ${selectedPost.id})`);
        if (!cancelled) setRequestInsights([]);
      } finally {
        if (!cancelled) setIsAnalysisLoading(false);
      }
    };

    loadRequestAnalysis();

    return () => {
      cancelled = true;
    };
  }, [user, selectedPost]);

  /**
   * Opens edit mode and pre-fills form values from the selected post.
   */
  const startEdit = (post: DonationPost) => {
    setEditingPostId(post.id);
    setEditTitle(post.title || '');
    setEditCategory(isCategoryOption(post.category) ? post.category : 'Other');
    setEditCustomCategory(post.customCategory || (isCategoryOption(post.category) ? '' : post.category || ''));
    setEditDescription(post.description || '');
    setEditImage(getPostImages(post)[0] || null);
    setEditSelectedFile(null);
    setStatusMessage(null);
    setSelectedImageIndex(0);
    setEditGallery(getPostImages(post));
  };

  /**
   * Cancels edit mode and clears form inputs.
   */
  const cancelEdit = () => {
    setEditingPostId(null);
    setEditTitle('');
    setEditCategory('');
    setEditCustomCategory('');
    setEditDescription('');
    setEditImage(null);
    setEditSelectedFile(null);
    setSelectedImageIndex(0);
    setEditGallery([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (editGalleryInputRef.current) editGalleryInputRef.current.value = '';
  };

  /**
   * Reads a replacement image and stores it for preview plus upload.
   */
  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setStatusType('error');
      setStatusMessage('Please select an image smaller than 5MB.');
      return;
    }

    setEditSelectedFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setEditImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  /**
   * Uploads one or more new images and appends them to the in-memory edit gallery.
   */
  const handleAddEditImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length || !selectedPost || !user) return;

    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      setStatusType('error');
      setStatusMessage('Please select images smaller than 5MB each.');
      return;
    }

    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const extension = file.name.split('.').pop() || 'jpg';
        const imageRef = ref(storage, `posts/${user.uid}/${selectedPost.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`);
        await uploadBytes(imageRef, file, { contentType: file.type });
        uploadedUrls.push(await getDownloadURL(imageRef));
      }

      setEditGallery((current) => [...current, ...uploadedUrls]);
      setSelectedImageIndex((current) => current + uploadedUrls.length);
      setEditImage(uploadedUrls[uploadedUrls.length - 1] || null);
      setStatusType('success');
      setStatusMessage('New image added to the edit gallery.');
    } catch (err) {
      handleFirestoreError(err, 'create', `posts/${selectedPost.id}/images`);
      setStatusType('error');
      setStatusMessage('Unable to add a new image right now.');
    } finally {
      if (editGalleryInputRef.current) editGalleryInputRef.current.value = '';
    }
  };

  /**
   * Deletes the currently selected image from the edit gallery draft.
   */
  const deleteSelectedEditImage = () => {
    if (!editGallery.length) return;
    if (editGallery.length <= 1) {
      setStatusType('error');
      setStatusMessage('A post must keep at least one image.');
      return;
    }

    const nextImages = editGallery.filter((_, index) => index !== selectedImageIndex);
    const nextIndex = Math.max(0, Math.min(selectedImageIndex, nextImages.length - 1));

    setEditGallery(nextImages);
    setSelectedImageIndex(nextIndex);
    setEditImage(nextImages[nextIndex] || nextImages[0] || null);
    setStatusType('success');
    setStatusMessage('Selected image removed from the edit gallery.');
  };

  /**
   * Uploads a replacement image to Firebase Storage and returns its public URL.
   */
  const uploadEditImageAndGetUrl = async (postId: string): Promise<string> => {
    if (!user || !editSelectedFile) {
      throw new Error('No replacement image selected.');
    }

    const extension = editSelectedFile.name.split('.').pop() || 'jpg';
    const imageRef = ref(storage, `posts/${user.uid}/${postId}-${Date.now()}.${extension}`);
    await uploadBytes(imageRef, editSelectedFile, { contentType: editSelectedFile.type });
    return getDownloadURL(imageRef);
  };

  /**
   * Updates post content fields allowed by Firestore security rules.
   */
  const saveEdit = async (postId: string) => {
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
      const nextImageUrl = editSelectedFile ? await uploadEditImageAndGetUrl(postId) : null;
      const nextImageUrls = [...editGallery];

      if (nextImageUrl) {
        const safeIndex = Math.min(Math.max(selectedImageIndex, 0), Math.max(nextImageUrls.length - 1, 0));
        nextImageUrls[safeIndex] = nextImageUrl;
      }

      const primaryImageUrl = nextImageUrls[0] || selectedPost?.imageUrl || '';

      await updateDoc(doc(db, 'posts', postId), {
        title,
        category,
        customCategory: customCategory || null,
        description,
        imageUrl: primaryImageUrl,
        imageUrls: nextImageUrls,
        updatedAt: serverTimestamp(),
      });

      setMyDonations((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                title,
                category,
                customCategory: customCategory || null,
                description,
                imageUrl: primaryImageUrl,
                imageUrls: nextImageUrls,
                updatedAt: Date.now(),
              }
            : post
        )
      );

      if (selectedPost?.id === postId) {
        setSelectedPost((prev) =>
          prev
            ? {
                ...prev,
                title,
                category,
                customCategory: customCategory || null,
                description,
                imageUrl: primaryImageUrl,
                imageUrls: nextImageUrls,
                updatedAt: Date.now(),
              }
            : prev
        );
      }

      setStatusType('success');
      setStatusMessage('Post updated successfully.');
      cancelEdit();
    } catch (err) {
      handleFirestoreError(err, 'update', `posts/${postId}`);
      setStatusType('error');
      setStatusMessage('Update failed. Check permissions or try again.');
    }
  };

  /**
   * Deletes a post if it is still available (enforced by backend rules).
   */
  const removePost = async (post: DonationPost) => {
    if (post.status !== 'available') {
      setStatusType('error');
      setStatusMessage('Only available posts can be deleted.');
      return;
    }

    const shouldDelete = window.confirm('Delete this post permanently?');
    if (!shouldDelete) return;

    try {
      await deleteDoc(doc(db, 'posts', post.id));
      setMyDonations((prev) => prev.filter((item) => item.id !== post.id));
      setSelectedPost((prev) => (prev?.id === post.id ? null : prev));
      setStatusType('success');
      setStatusMessage('Post deleted successfully.');
    } catch (err) {
      handleFirestoreError(err, 'delete', `posts/${post.id}`);
      setStatusType('error');
      setStatusMessage('Delete failed. Only available posts can be deleted.');
    }
  };

  const togglePostVisibility = async (post: DonationPost) => {
    const nextVisibility = post.visibility === 'hidden' ? 'visible' : 'hidden';

    try {
      await updateDoc(doc(db, 'posts', post.id), {
        visibility: nextVisibility,
        updatedAt: serverTimestamp(),
      });

      setMyDonations((prev) =>
        prev.map((item) =>
          item.id === post.id ? { ...item, visibility: nextVisibility, updatedAt: Date.now() } : item
        )
      );
      setSelectedPost((prev) =>
        prev?.id === post.id ? { ...prev, visibility: nextVisibility, updatedAt: Date.now() } : prev
      );
      setStatusType('success');
      setStatusMessage(nextVisibility === 'hidden' ? 'Post hidden from public display.' : 'Post visible again.');
    } catch (err) {
      handleFirestoreError(err, 'update', `posts/${post.id}/visibility`);
      setStatusType('error');
      setStatusMessage('Visibility update failed. Check permissions or try again.');
    }
  };

  if (!user) return null;

  if (selectedPost) {
    const isEditing = editingPostId === selectedPost.id;

    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => {
              cancelEdit();
              setSelectedPost(null);
              setSelectedImageIndex(0);
            }}
            className="p-2 rounded-full bg-white border border-emerald-100 text-emerald-700 shadow-sm"
            aria-label="Back to post list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startEdit(selectedPost)}
              className="px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-bold flex items-center gap-2"
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
            <button
              type="button"
              onClick={() => togglePostVisibility(selectedPost)}
              className="px-4 py-2 rounded-full bg-gray-50 border border-gray-100 text-gray-700 text-sm font-bold flex items-center gap-2"
            >
              {selectedPost.visibility === 'hidden' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {selectedPost.visibility === 'hidden' ? 'Show' : 'Hide'}
            </button>
            <button
              type="button"
              onClick={() => removePost(selectedPost)}
              className="px-4 py-2 rounded-full bg-red-50 border border-red-100 text-red-700 text-sm font-bold flex items-center gap-2 disabled:opacity-50"
              disabled={selectedPost.status !== 'available'}
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>

        {statusMessage && (
          <div
            className={cn(
              'px-3 py-2 rounded-xl text-xs font-semibold border',
              statusType === 'success'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            )}
          >
            {statusMessage}
          </div>
        )}

        <div className="bg-white rounded-[20px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-emerald-50">
          <div className="relative w-full">
            <img
              src={getPostImages(selectedPost)[selectedImageIndex] || getPostImages(selectedPost)[0]}
              alt={`${selectedPost.title} ${selectedImageIndex + 1}`}
              className="w-full h-72 object-cover bg-gray-100"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-2 left-2 bg-black/30 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-medium text-white tracking-wide shadow-sm uppercase">
              {selectedPost.status}
            </div>
            {selectedPost.visibility === 'hidden' && (
              <div className="absolute top-2 right-2 bg-red-500/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide shadow-sm uppercase">
                Hidden
              </div>
            )}
          </div>

          {getPostImages(selectedPost).length > 1 && (
            <div className="px-4 pb-4 pt-3">
              <div className="grid grid-cols-4 gap-2">
                {getPostImages(selectedPost).map((imageUrl, index) => (
                  <button
                    key={`${imageUrl}-${index}`}
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    className={"aspect-square rounded-2xl overflow-hidden bg-gray-100 border transition-all " + (selectedImageIndex === index ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-100')}
                    aria-label={`View image ${index + 1}`}
                  >
                    <img
                      src={imageUrl}
                      alt={`${selectedPost.title} ${index + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 space-y-4">
            <div>
              <h2 className="text-2xl font-black text-gray-900 leading-tight">{selectedPost.title}</h2>
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-medium text-gray-500">
                <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                  <MapPin className="w-4 h-4 mr-1.5" />
                  {selectedPost.state}
                </div>
                <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
                  <Clock className="w-4 h-4 mr-1.5" />
                  {new Date(selectedPost.updatedAt || selectedPost.createdAt).toLocaleString()}
                </div>
                <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
                  <User className="w-4 h-4 mr-1.5" />
                  {selectedPost.donorName}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Category</label>
              <div className="inline-flex px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-sm">
                {getDisplayCategory(selectedPost)}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-gray-900 flex items-center">
                <MessageSquare className="w-5 h-5 mr-2 text-emerald-500" />
                Description
              </h3>
              <p className="text-gray-600 leading-relaxed text-[15px] whitespace-pre-wrap bg-gray-50 p-4 rounded-2xl">
                {selectedPost.description}
              </p>
            </div>

            {isEditing && (
              <div className="space-y-3 border-t border-emerald-50 pt-4">
                <div className="space-y-2">
                  <div className="relative aspect-video rounded-2xl overflow-hidden border border-emerald-100 bg-gray-50">
                    <img
                      src={editImage || editGallery[selectedImageIndex] || selectedPost.imageUrl}
                      alt={selectedPost.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm"
                    >
                      <ImagePlus className="w-3.5 h-3.5" /> Change image
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => editGalleryInputRef.current?.click()}
                      className="px-3 py-2 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold inline-flex items-center gap-2"
                    >
                      <ImagePlus className="w-3.5 h-3.5" /> Add more images
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedEditImage}
                      className="px-3 py-2 rounded-full bg-red-50 border border-red-100 text-red-700 text-xs font-bold inline-flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete selected image
                    </button>
                  </div>
                  <input
                    ref={editGalleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAddEditImages}
                    className="hidden"
                  />
                  {getPostImages(selectedPost).length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {editGallery.map((imageUrl, index) => (
                        <button
                          key={`${imageUrl}-${index}`}
                          type="button"
                          onClick={() => setSelectedImageIndex(index)}
                          className={"aspect-square rounded-2xl overflow-hidden border transition-all bg-gray-50 " + (selectedImageIndex === index ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-emerald-100')}
                          aria-label={`View image ${index + 1}`}
                        >
                          <img
                            src={imageUrl}
                            alt={`${selectedPost.title} ${index + 1}`}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleEditImageChange}
                    className="hidden"
                  />
                </div>

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
                    if (e.target.value !== 'Other') {
                      setEditCustomCategory('');
                    }
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
                    <X className="w-3.5 h-3.5 inline-block mr-1" /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(selectedPost.id)}
                    className="px-4 py-2.5 text-xs font-bold rounded-full bg-emerald-600 text-white"
                  >
                    <Save className="w-3.5 h-3.5 inline-block mr-1" /> Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[20px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-emerald-50 p-4 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2 text-emerald-500" />
              Request Analysis
            </h3>
            <p className="text-sm text-gray-500 mt-1">Shows request history linked to this post.</p>
          </div>

          {isAnalysisLoading ? (
            <BrandLoader className="py-10" label="Checking requests" />
          ) : requestInsights.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Requests</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700">{requestInsights.length}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Latest</p>
                  <p className="mt-1 text-sm font-bold text-gray-800 line-clamp-2">{requestInsights[0]?.requesterName}</p>
                </div>
              </div>

              <div className="space-y-2">
                {requestInsights.map((insight) => (
                  <div key={insight.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-bold text-gray-900 truncate">{insight.requesterName}</p>
                      <span className="text-[10px] font-bold uppercase text-emerald-600">Requested</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{insight.preview}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-500">
              No request history yet for this post.
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
          <h2 className="text-2xl font-bold text-gray-900">Manage Posts</h2>
          <p className="text-sm text-gray-500">Tap a post to view details, requests, and edit controls.</p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={cn(
            'px-3 py-2 rounded-xl text-xs font-semibold border',
            statusType === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          )}
        >
          {statusMessage}
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? (
          <BrandLoader className="py-16" label="Loading your posts" />
        ) : myDonations.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl border border-emerald-50 text-center text-gray-500 font-medium shadow-sm flex flex-col items-center gap-3">
            <BrandLogo className="h-14 w-14" />
            You have no posts yet.
          </div>
        ) : (
          <div className="columns-1 gap-3 space-y-3">
            {myDonations.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setSelectedPost(post)}
                className="text-left w-full break-inside-avoid bg-white rounded-[20px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-emerald-50"
              >
                <div className="relative w-full">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-52 object-cover bg-gray-100"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2 bg-black/30 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-medium text-white tracking-wide shadow-sm uppercase">
                    {post.status}
                  </div>
                  {post.visibility === 'hidden' && (
                    <div className="absolute top-2 right-2 bg-red-500/90 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide shadow-sm uppercase">
                      Hidden
                    </div>
                  )}
                </div>

                <div className="p-3 pt-2.5 space-y-2">
                  <div>
                    <h3 className="font-bold text-gray-800 text-[13px] leading-snug line-clamp-2">{post.title}</h3>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{getDisplayCategory(post)}</p>
                  </div>
                  <p className="text-[11px] text-gray-400">Tap to open details</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

