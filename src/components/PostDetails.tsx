import React from 'react';
import { DonationPost } from '../types';
import { ArrowLeft, CalendarClock, Clock, MapPin, User, MessageCircle, Info } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { getDisplayCategory } from '../lib/categories';

interface PostDetailsProps {
  post: DonationPost;
  onBack: () => void;
  onChat: (donorId: string, donorName: string, initialMessage?: string, relatedPostId?: string) => void;
}

export function PostDetails({ post, onBack, onChat }: PostDetailsProps) {
  const galleryImages = post.imageUrls?.length ? post.imageUrls : [post.imageUrl];
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const postedAt = format(post.createdAt, 'dd MMM yyyy, h:mm a');

  return (
    <div className="w-full max-w-md h-full bg-white flex flex-col shadow-2xl overflow-y-auto md:rounded-t-3xl sm:h-[95vh] sm:mt-auto">
      {/* Header with back button overlay */}
      <div className="relative w-full flex-shrink-0 bg-gray-100">
        <img 
          src={galleryImages[selectedImageIndex] || galleryImages[0]} 
          alt={`${post.title} ${selectedImageIndex + 1}`} 
          className="w-full h-72 object-cover"
          referrerPolicy="no-referrer"
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 to-transparent"></div>
        
        <button 
          onClick={onBack}
          className="absolute top-4 left-4 bg-white/90 backdrop-blur-md p-2.5 rounded-full shadow-sm text-gray-700 hover:bg-white transition active:scale-95 z-10"
        >
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        
        <div className="absolute bottom-4 left-4 flex gap-2 z-10">
          <span className="bg-emerald-600/90 text-white backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">
            {getDisplayCategory(post)}
          </span>
          <span className="bg-white/90 text-emerald-700 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold shadow-sm capitalize">
            {post.status}
          </span>
        </div>
      </div>

      {galleryImages.length > 1 && (
        <div className="px-6 pt-4">
          <div className="grid grid-cols-4 gap-2">
            {galleryImages.map((imageUrl, index) => (
              <button
                key={`${imageUrl}-${index}`}
                type="button"
                onClick={() => setSelectedImageIndex(index)}
                className={"aspect-square rounded-2xl overflow-hidden bg-gray-100 border transition-all " + (selectedImageIndex === index ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-gray-100')}
                aria-label={`View image ${index + 1}`}
              >
                <img
                  src={imageUrl}
                  alt={`${post.title} ${index + 1}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content Details */}
      <div className="p-6 flex-1 flex flex-col">
        <h1 className="text-2xl font-black text-gray-900 leading-tight mb-3">{post.title}</h1>
        
        <div className="flex flex-wrap gap-4 text-sm font-medium text-gray-500 mb-6">
          <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
            <MapPin className="w-4 h-4 mr-1.5" />
            {post.state}
          </div>
          <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
            <Clock className="w-4 h-4 mr-1.5" />
            {formatDistanceToNow(post.createdAt)} ago
          </div>
          <div className="flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
            <CalendarClock className="w-4 h-4 mr-1.5" />
            Posted {postedAt}
          </div>
        </div>

        <div className="bg-emerald-50/50 rounded-2xl p-4 flex items-center space-x-4 mb-6 border border-emerald-100">
          <div className="w-12 h-12 bg-emerald-200 rounded-full flex items-center justify-center flex-shrink-0 shadow-inner">
            <User className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider mb-0.5">Donator</p>
            <p className="text-base font-bold text-gray-900">{post.donorName}</p>
          </div>
        </div>

        <div className="space-y-3 mb-8">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Info className="w-5 h-5 mr-2 text-emerald-500" />
            Description
          </h3>
          <p className="text-gray-600 leading-relaxed text-[15px] whitespace-pre-wrap bg-gray-50 p-4 rounded-2xl">
            {post.description}
          </p>
        </div>

        <div className="mt-auto pt-6 space-y-3">
          <button 
            onClick={() => onChat(post.donorId, post.donorName, `Hi! I'm interested in requesting: ${post.title}`, post.id)}
            className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-[15px] shadow-lg shadow-emerald-200/50 flex items-center justify-center hover:bg-emerald-700 transition active:scale-95"
          >
            Request Item
          </button>
          <button 
            onClick={() => onChat(post.donorId, post.donorName, undefined, post.id)}
            className="w-full bg-white border-2 border-gray-100 text-gray-700 py-3.5 rounded-2xl font-bold text-[15px] flex items-center justify-center hover:bg-gray-50 transition active:scale-95"
          >
            <MessageCircle className="w-5 h-5 mr-2 text-emerald-600" />
            Chat with Donor
          </button>
        </div>
      </div>
    </div>
  );
}
