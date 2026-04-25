import React from 'react';
import { ArrowLeft, CalendarClock, HandHeart, Info, MapPin, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { NeedPost } from '../types';
import { cn } from '../lib/utils';
import { getDisplayCategory } from '../lib/categories';

interface NeedDetailsProps {
  need: NeedPost;
  onBack: () => void;
  onChat: (requesterId: string, requesterName: string, initialMessage?: string, relatedPostId?: string) => void;
}

export function NeedDetails({ need, onBack, onChat }: NeedDetailsProps) {
  const postedAt = format(need.createdAt, 'dd MMM yyyy, h:mm a');

  return (
    <div className="w-full max-w-md h-full bg-white flex flex-col shadow-2xl overflow-y-auto md:rounded-t-3xl sm:h-[90vh] sm:mt-auto">
      <div className="p-5 border-b border-emerald-50 flex items-center gap-4 sticky top-0 bg-white z-10">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full bg-emerald-50 text-emerald-700 active:scale-95 transition"
          aria-label="Back to needs"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Need Details</p>
          <h2 className="text-xl font-black text-gray-900 truncate">{need.title}</h2>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-3 mb-6">
          <span
            className={cn(
              'px-3 py-1.5 text-xs font-bold rounded-full uppercase',
              need.priority === 'high'
                ? 'bg-red-100 text-red-600'
                : need.priority === 'medium'
                  ? 'bg-orange-100 text-orange-600'
                  : 'bg-emerald-100 text-emerald-600'
            )}
          >
            {need.priority} Priority
          </span>
          {need.category && (
            <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase">
              {getDisplayCategory(need)}
            </span>
          )}
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-center bg-emerald-50 px-3 py-2 rounded-2xl text-sm font-semibold text-emerald-700">
            <MapPin className="w-4 h-4 mr-2" />
            {need.state}
          </div>
          <div className="flex items-center bg-gray-50 px-3 py-2 rounded-2xl text-sm font-semibold text-gray-600">
            <CalendarClock className="w-4 h-4 mr-2" />
            Posted {postedAt}
          </div>
        </div>

        <div className="bg-emerald-50/50 rounded-2xl p-4 flex items-center space-x-4 mb-6 border border-emerald-100">
          <div className="w-12 h-12 bg-emerald-200 rounded-full flex items-center justify-center flex-shrink-0 shadow-inner">
            <HandHeart className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-0.5">Requester</p>
            <p className="text-base font-bold text-gray-900">{need.requesterName}</p>
          </div>
        </div>

        <div className="space-y-3 mb-8">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Info className="w-5 h-5 mr-2 text-emerald-500" />
            Description
          </h3>
          <p className="text-gray-600 leading-relaxed text-[15px] whitespace-pre-wrap bg-gray-50 p-4 rounded-2xl">
            {need.description || 'No extra details provided.'}
          </p>
        </div>

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={() => onChat(need.requesterId, need.requesterName, `Hi! I'd like to support your need: ${need.title}`)}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-[15px] shadow-lg shadow-emerald-200/50 flex items-center justify-center hover:bg-emerald-700 transition active:scale-95"
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Support Need
          </button>
        </div>
      </div>
    </div>
  );
}
