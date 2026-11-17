import { useState, useRef, useCallback } from 'react';

/**
 * Mobile Touch Swipe Gestures Hook
 * Detects horizontal swipe gestures on touch devices.
 * 
 * @param {Object} options
 * @param {number} [options.threshold=70] - Distance in px to trigger action on release
 * @param {Function} [options.onSwipeLeft] - Callback fired when swiped left past threshold
 * @param {Function} [options.onSwipeRight] - Callback fired when swiped right past threshold
 * @param {boolean} [options.disabled=false] - Whether gestures are disabled
 * @returns {{ onTouchStart: Function, onTouchMove: Function, onTouchEnd: Function, swipeOffset: number, swipeDirection: 'left'|'right'|null }}
 */
export function useSwipeGesture({
  threshold = 70,
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
} = {}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState(null);

  const startCoordsRef = useRef({ x: 0, y: 0 });
  const isHorizontalRef = useRef(null); // null = undetermined, true = horizontal swipe, false = vertical scroll
  const isTouchingRef = useRef(false);

  const onTouchStart = useCallback((e) => {
    if (disabled || !e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    startCoordsRef.current = { x: touch.clientX, y: touch.clientY };
    isHorizontalRef.current = null;
    isTouchingRef.current = true;
    setSwipeOffset(0);
    setSwipeDirection(null);
  }, [disabled]);

  const onTouchMove = useCallback((e) => {
    if (disabled || !isTouchingRef.current || !e.touches || e.touches.length === 0) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startCoordsRef.current.x;
    const deltaY = touch.clientY - startCoordsRef.current.y;

    // Determine direction on first significant movement (> 8px)
    if (isHorizontalRef.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          isHorizontalRef.current = true;
        } else {
          isHorizontalRef.current = false;
        }
      }
    }

    // Only process swipe if horizontal gesture is locked
    if (isHorizontalRef.current === true) {
      // Apply elastic damping past 140px
      let offset = deltaX;
      const maxClamp = 180;
      if (offset > maxClamp) {
        offset = maxClamp + (offset - maxClamp) * 0.2;
      } else if (offset < -maxClamp) {
        offset = -maxClamp + (offset + maxClamp) * 0.2;
      }

      setSwipeOffset(offset);
      setSwipeDirection(offset > 0 ? 'right' : offset < 0 ? 'left' : null);
    }
  }, [disabled]);

  const onTouchEnd = useCallback(() => {
    if (disabled || !isTouchingRef.current) return;
    isTouchingRef.current = false;

    if (isHorizontalRef.current === true) {
      if (swipeOffset >= threshold && onSwipeRight) {
        onSwipeRight();
      } else if (swipeOffset <= -threshold && onSwipeLeft) {
        onSwipeLeft();
      }
    }

    isHorizontalRef.current = null;
    setSwipeOffset(0);
    setSwipeDirection(null);
  }, [disabled, swipeOffset, threshold, onSwipeLeft, onSwipeRight]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    swipeOffset,
    swipeDirection,
  };
}

export default useSwipeGesture;
