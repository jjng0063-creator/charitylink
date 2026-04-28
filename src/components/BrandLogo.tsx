import React from 'react';
import { cn } from '../lib/utils';

interface BrandLogoProps {
  className?: string;
  imageClassName?: string;
  alt?: string;
}

export function BrandLogo({ className, imageClassName, alt = 'CharityLink logo' }: BrandLogoProps) {
  return (
    <div className={cn('inline-flex items-center justify-center', className)}>
      <img
        src="/charitylink-logo.png"
        alt={alt}
        className={cn('h-full w-full object-contain drop-shadow-sm', imageClassName)}
      />
    </div>
  );
}

interface BrandLoaderProps {
  className?: string;
  label?: string;
}

export function BrandLoader({ className, label = 'Loading CharityLink...' }: BrandLoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 text-center', className)}>
      <BrandLogo className="h-16 w-16 animate-pulse" />
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">{label}</p>
    </div>
  );
}
