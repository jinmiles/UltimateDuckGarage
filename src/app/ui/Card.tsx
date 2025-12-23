'use client';

import type { ReactNode } from 'react';
import { card as cardTokens } from './theme';

type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'highlight' | 'empty';
};

/**
 * Reusable card surface with shared background, border and rounding.
 */
export function Card({ children, className = '', variant = 'default' }: CardProps) {
  let variantClass = cardTokens.padded;

  if (variant === 'highlight') {
    variantClass = `${cardTokens.padded} ${cardTokens.highlight}`;
  } else if (variant === 'empty') {
    variantClass = `${cardTokens.empty}`;
  }

  return (
    <div className={`${cardTokens.base} ${variantClass} ${className}`}>
      {children}
    </div>
  );
}
