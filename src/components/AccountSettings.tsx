import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, MapPin, Save, UserRound } from 'lucide-react';
import { useAuth, handleFirestoreError } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface AccountSettingsProps {
  onBack: () => void;
}

const LOCATION_OPTIONS = ['Selangor', 'Kuala Lumpur', 'Pulau Pinang', 'Johor', 'Perak'];

export function AccountSettings({ onBack }: AccountSettingsProps) {
  const { user, profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [state, setState] = useState(profile?.state || 'Selangor');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error'>('success');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName || '');
    setState(profile?.state || 'Selangor');
  }, [profile?.displayName, profile?.state]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();

    const nextDisplayName = displayName.trim();

    if (!nextDisplayName || nextDisplayName.length > 100) {
      setStatusType('error');
      setStatusMessage('Display name is required and must be 100 characters or less.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      await updateProfile({
        displayName: nextDisplayName,
        state,
      });
      setStatusType('success');
      setStatusMessage('Account settings updated successfully.');
    } catch (err) {
      handleFirestoreError(err, 'update', user ? `users/${user.uid}` : 'users/current');
      setStatusType('error');
      setStatusMessage('Unable to update settings right now. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!user || !profile) return null;

  return (
    <form onSubmit={saveSettings} className="space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full bg-white border border-emerald-100 text-emerald-700 shadow-sm"
          aria-label="Back to profile"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Profile</p>
          <h2 className="text-2xl font-black text-gray-900">Account Settings</h2>
        </div>
      </div>

      {statusMessage && (
        <div className={cn(
          'p-3 rounded-2xl text-sm font-semibold border',
          statusType === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-red-50 text-red-700 border-red-100'
        )}>
          {statusMessage}
        </div>
      )}

      <div className="bg-white rounded-3xl border border-emerald-50 shadow-sm p-5 space-y-5">
        <div className="flex items-center gap-4">
          <img
            src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.displayName}`}
            alt="Avatar"
            className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{profile.email || user.email}</p>
            <p className="text-xs text-gray-500">Google account email</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center">
            <UserRound className="w-3.5 h-3.5 mr-1.5" />
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={100}
            className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            placeholder="Your display name"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider ml-1 flex items-center">
            <MapPin className="w-3.5 h-3.5 mr-1.5" />
            Default Location
          </label>
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
            className="w-full px-4 py-3 bg-white border border-emerald-50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            required
          >
            {LOCATION_OPTIONS.map((location) => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 px-1">
            Used as your fallback location for posting and local feed priority.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/50 active:scale-95 transition disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Save Settings
        </button>
      </div>
    </form>
  );
}

