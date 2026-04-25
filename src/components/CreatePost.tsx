import React, { useRef, useState } from 'react';
import { Camera, Loader2, CheckCircle2, ImagePlus, HandHeart, PackageOpen, Sparkles } from 'lucide-react';
import { categorizeItem } from '../lib/gemini';
import { cn } from '../lib/utils';
import { db, storage } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORY_OPTIONS } from '../lib/categories';

type PostMode = 'donation' | 'need';
type NeedPriority = 'low' | 'medium' | 'high';

const LOCATION_OPTIONS = ['Selangor', 'Kuala Lumpur', 'Pulau Pinang', 'Johor', 'Perak'];
const ENABLE_AI_CATEGORY_SUGGESTION = false;

export function CreatePost() {
  const { user, profile } = useAuth();
  const [postMode, setPostMode] = useState<PostMode>('donation');
  const [images, setImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [category, setCategory] = useState<string>('');
  const [aiSuggestedCategory, setAiSuggestedCategory] = useState<string>('');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [needPriority, setNeedPriority] = useState<NeedPriority>('medium');
  const [successMode, setSuccessMode] = useState<PostMode | null>(null);
  const [postLocation, setPostLocation] = useState(profile?.state || 'Selangor');
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);

  React.useEffect(() => {
    if (profile?.state) {
      setPostLocation(profile.state);
    }
  }, [profile?.state]);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  /**
   * Clears the current image selection and any generated preview URLs.
   */
  const resetImages = () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setImages([]);
    setSelectedFiles([]);
    setAiSuggestedCategory('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Clears shared form fields after a successful submit.
   */
  const resetForm = () => {
    resetImages();
    setTitle('');
    setDescription('');
    setCategory('');
    setNeedPriority('medium');
    setCustomCategory('');
  };

  /**
   * Shows a temporary toast notification for user feedback.
   */
  const showToast = (type: 'error' | 'success', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3500);
  };

  /**
   * Wraps async work with a timeout to avoid indefinite loading states.
   */
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  /**
   * Reads the selected images for preview, then requests AI category suggestion from the first image.
   */
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;

    if (files.some((file) => file.size > 5 * 1024 * 1024)) {
      showToast('error', 'Please select images smaller than 5MB each.');
      return;
    }

    const shouldAnalyze = images.length === 0 && selectedFiles.length === 0;
    setSelectedFiles((current) => [...current, ...files]);

    const objectUrls = files.map((file) => URL.createObjectURL(file));
    previewUrlsRef.current = [...previewUrlsRef.current, ...objectUrls];
    setImages((current) => [...current, ...objectUrls]);

    if (shouldAnalyze && ENABLE_AI_CATEGORY_SUGGESTION) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        if (!base64String) return;

        setIsAnalyzing(true);
        setAiSuggestedCategory('');
        try {
          const suggestedCategory = await categorizeItem(base64String, files[0].type);
          setCategory(suggestedCategory);
          setCustomCategory('');
          setAiSuggestedCategory(suggestedCategory);
          showToast('success', `AI suggested category: ${suggestedCategory}`);
        } catch {
          showToast('error', 'Could not analyze the image right now. You can still type a category manually.');
        } finally {
          setIsAnalyzing(false);
        }
      };
      reader.readAsDataURL(files[0]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Uploads the selected image files to Firebase Storage and returns public download URLs.
   */
  const uploadImagesAndGetUrls = async (): Promise<string[]> => {
    if (!selectedFiles.length || !user) {
      throw new Error('No files selected for upload.');
    }

    const uploadedUrls: string[] = [];

    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop() || 'jpg';
      const imageRef = ref(storage, `posts/${user.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`);
      await uploadBytes(imageRef, file, { contentType: file.type });
      uploadedUrls.push(await getDownloadURL(imageRef));
    }

    return uploadedUrls;
  };

  /**
   * Creates a donation or need post depending on the active post mode.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !user || !profile) return;

    if (title.trim().length > 200) {
      showToast('error', 'Title must be 200 characters or less.');
      return;
    }

    if (description.trim().length > 5000) {
      showToast('error', 'Description must be 5000 characters or less.');
      return;
    }

    const normalizedCategory = category.trim();
    const normalizedCustomCategory = normalizedCategory === 'Other' ? customCategory.trim() : '';

    if (!normalizedCategory) {
      showToast('error', 'Please select a category.');
      return;
    }

    if (normalizedCategory === 'Other' && !normalizedCustomCategory) {
      showToast('error', 'Please specify the custom category.');
      return;
    }

    if (normalizedCustomCategory.length > 100) {
      showToast('error', 'Custom category must be 100 characters or less.');
      return;
    }

    if (postMode === 'donation' && !selectedFiles.length) {
      showToast('error', 'Please add at least one photo for a donation post.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (postMode === 'donation') {
        const imageUrls = await withTimeout(
          uploadImagesAndGetUrls(),
          20000,
          'Image upload timed out. Check Firebase Storage setup, internet, and browser shields.'
        );
        const imageUrl = imageUrls[0];

        await withTimeout(addDoc(collection(db, 'posts'), {
          donorId: user.uid,
          donorName: profile.displayName,
          title: title.trim(),
          description: description.trim(),
          imageUrl,
          imageUrls,
          category: normalizedCategory,
          customCategory: normalizedCustomCategory || null,
          state: postLocation,
          status: 'available',
          visibility: 'visible',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }), 15000, 'Saving post timed out. Please try again.');
      } else {
        await withTimeout(addDoc(collection(db, 'needs'), {
          requesterId: user.uid,
          requesterName: profile.displayName,
          title: title.trim(),
          description: description.trim(),
          category: normalizedCategory,
          customCategory: normalizedCustomCategory || null,
          priority: needPriority,
          state: postLocation,
          visibility: 'visible',
          createdAt: serverTimestamp(),
        }), 15000, 'Saving need timed out. Please try again.');
      }

      setSuccessMode(postMode);
      showToast('success', postMode === 'donation' ? 'Donation posted successfully.' : 'Need posted successfully.');
      setTimeout(() => {
        setSuccessMode(null);
        resetForm();
      }, 3000);
    } catch (err) {
      console.error(`Error creating ${postMode}:`, err);

      const message = err instanceof Error ? err.message : `Unknown error creating ${postMode}.`;
      if (message.toLowerCase().includes('cors') || message.toLowerCase().includes('network') || message.toLowerCase().includes('timed out')) {
        showToast('error', 'Upload failed due to connection/security restrictions. Please disable Brave Shields for localhost, verify Firebase setup, then try again.');
      } else {
        showToast('error', `Post failed: ${message}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successMode) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
        <CheckCircle2 className="w-16 h-16 text-emerald-500" />
        <h2 className="text-2xl font-bold">{successMode === 'donation' ? 'Donation Posted!' : 'Need Posted!'}</h2>
        <p className="text-gray-500">
          {successMode === 'donation'
            ? 'Your donation is now visible on the home page for nearby users.'
            : 'Your requested need is now visible on the needs page for nearby supporters.'}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-24">
      {toast && (
        <div
          role="status"
          className={cn(
            'rounded-2xl px-4 py-3 text-sm font-semibold border',
            toast.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          )}
        >
          {toast.message}
        </div>
      )}

      <div className="space-y-3">
        <div className="inline-flex w-full rounded-3xl bg-emerald-50 p-1">
          <button
            type="button"
            onClick={() => setPostMode('donation')}
            className={cn(
              'flex-1 rounded-[20px] px-4 py-3 text-sm font-bold transition',
              postMode === 'donation' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-600'
            )}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <PackageOpen className="w-4 h-4" /> Donation
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPostMode('need')}
            className={cn(
              'flex-1 rounded-[20px] px-4 py-3 text-sm font-bold transition',
              postMode === 'need' ? 'bg-white text-emerald-700 shadow-sm' : 'text-emerald-600'
            )}
          >
            <span className="inline-flex items-center justify-center gap-2">
              <HandHeart className="w-4 h-4" /> Need
            </span>
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold">{postMode === 'donation' ? 'Post a Donation' : 'Post a Need'}</h2>
          <p className="text-gray-500 text-sm">
            {postMode === 'donation'
              ? "Snap a photo and we'll help you categorize it."
              : 'Describe what you need so nearby donors can support you.'}
          </p>
        </div>
      </div>

      {postMode === 'donation' && (
        <div className="relative group">
          <input
            id="create-post-image-input"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            className="hidden"
          />
          {images.length > 0 ? (
            <div className="space-y-3">
              <div className="relative aspect-video rounded-3xl overflow-hidden border-2 border-emerald-500 bg-white">
                <img src={images[0]} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={resetImages}
                  className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
                >
                  X
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm"
                >
                  <ImagePlus className="w-3.5 h-3.5" /> Add more
                </button>
              </div>

              {images.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.slice(1).map((preview, index) => (
                    <div key={preview} className="relative aspect-square rounded-2xl overflow-hidden border border-emerald-100 bg-white">
                      <img src={preview} alt={`Preview ${index + 2}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <label
              htmlFor="create-post-image-input"
              className="flex flex-col items-center justify-center aspect-video rounded-3xl border-2 border-dashed border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-300 transition-all cursor-pointer group"
            >
              <div className="p-4 bg-white rounded-full shadow-sm text-emerald-600 group-hover:scale-110 transition-transform">
                <Camera className="w-8 h-8" />
              </div>
              <span className="mt-4 text-sm font-bold text-gray-600">Add photos or upload</span>
            </label>
          )}
        </div>
      )}

      {ENABLE_AI_CATEGORY_SUGGESTION && postMode === 'donation' && images.length > 0 && (
        <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-600">AI Category Suggestion</p>
              <p className="mt-1 text-sm font-semibold text-gray-700">
                {isAnalyzing
                  ? 'Analyzing your first photo...'
                  : aiSuggestedCategory
                    ? `Suggested: ${aiSuggestedCategory}`
                    : 'Upload a photo and AI will suggest the category here.'}
              </p>
              {aiSuggestedCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setCategory(aiSuggestedCategory);
                    setCustomCategory('');
                  }}
                  className="mt-3 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95"
                >
                  Use {aiSuggestedCategory}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {postMode === 'need' && (
        <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white text-emerald-600 flex items-center justify-center shadow-sm">
              <HandHeart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Need request</h3>
              <p className="text-sm text-gray-500">This will appear on the Needs page for supporters in your area.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as NeedPriority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => setNeedPriority(priority)}
                className={cn(
                  'rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide border transition',
                  needPriority === priority
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
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={postMode === 'donation' ? 'What are you giving away?' : 'What support do you need?'}
            maxLength={200}
            className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Category</label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                if (e.target.value !== 'Other') {
                  setCustomCategory('');
                }
              }}
              className={cn(
                'w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
                postMode === 'donation' && isAnalyzing && 'pr-10'
              )}
              required
            >
              <option value="">Select category</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            {postMode === 'donation' && isAnalyzing && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500 animate-spin" />
            )}
          </div>
          {category === 'Other' && (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder={postMode === 'donation' ? 'Specify category, e.g. Baby Items' : 'Specify need category, e.g. Medicine'}
              maxLength={100}
              className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              required
            />
          )}
          {ENABLE_AI_CATEGORY_SUGGESTION && postMode === 'donation' && aiSuggestedCategory && !isAnalyzing && images.length > 0 && (
            <p className="text-[10px] text-emerald-600 font-bold ml-1 uppercase tracking-wide flex items-center">
              <CheckCircle2 className="w-3 h-3 mr-1" /> AI Suggested
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Location</label>
          <select
            value={postLocation}
            onChange={(e) => setPostLocation(e.target.value)}
            className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none"
            required
          >
            {LOCATION_OPTIONS.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1">Description</label>
          <textarea
            rows={postMode === 'donation' ? 3 : 4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              postMode === 'donation'
                ? "Tell us more about the item's condition..."
                : 'Share the quantity, urgency, or extra details supporters should know.'
            }
            maxLength={5000}
            className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={(postMode === 'donation' && (!images.length || isAnalyzing)) || isSubmitting}
        className="w-full bg-emerald-600 text-white py-4 rounded-3xl font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Posting...
          </>
        ) : postMode === 'donation' ? 'Submit Donation' : 'Submit Need'}
      </button>
    </form>
  );
}
