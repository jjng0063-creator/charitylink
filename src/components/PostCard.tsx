import React from 'react';
import { DonationPost } from '../types';
import { MapPin } from 'lucide-react';
import { getDisplayCategory } from '../lib/categories';

interface PostCardProps {
  post: DonationPost;
  key?: React.Key;
  onClick?: () => void;
}

export function PostCard({ post, onClick }: PostCardProps) {
  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-[20px] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-md transition-shadow cursor-pointer break-inside-avoid mb-4"
    >
      <div className="relative w-full">
        <img 
          src={post.imageUrl} 
          alt={post.title} 
          className="w-full max-h-[300px] object-cover bg-gray-100"
          referrerPolicy="no-referrer"
        />
        {/* Category tag overlaid cleanly */}
        <div className="absolute top-2.5 left-2.5 bg-black/30 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-medium text-white tracking-wide shadow-sm">
          {getDisplayCategory(post)}
        </div>
      </div>
      
      <div className="p-3 pt-2.5">
        <h3 className="font-bold text-gray-800 text-[13px] leading-snug line-clamp-2">{post.title}</h3>
        
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center space-x-1.5 flex-1 min-w-0">
             <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 shadow-inner">
                <span className="text-[9px] font-bold text-emerald-700 uppercase">{post.donorName.charAt(0)}</span>
             </div>
             <span className="text-[11px] text-gray-500 font-medium truncate">{post.donorName}</span>
          </div>
          
          {post.state && (
            <div className="flex items-center text-gray-400 text-[10px] flex-shrink-0 ml-2">
              <MapPin className="w-3 h-3 mr-0.5" />
              <span className="truncate max-w-[60px]">{post.state}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
