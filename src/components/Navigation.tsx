import React from 'react';
import { Home, PlusSquare, MessageCircle, User, Heart } from 'lucide-react';
import { cn } from '../lib/utils';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'needs', icon: Heart, label: 'Needs' },
    { id: 'post', icon: PlusSquare, label: 'Post' },
    { id: 'messages', icon: MessageCircle, label: 'Chat' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-emerald-100 px-4 py-2 z-50">
      <div className="max-w-md mx-auto flex justify-between items-center">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-col items-center p-2 rounded-xl transition-all duration-200",
              activeTab === tab.id 
                ? "text-emerald-600 bg-emerald-50" 
                : "text-gray-400 hover:text-emerald-500"
            )}
          >
            <tab.icon className={cn("w-6 h-6", activeTab === tab.id && "scale-110")} />
            <span className="text-[10px] font-medium mt-1 uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
