import React, { useEffect, useRef } from 'react';

/**
 * SplitDivider — Draggable resizable separator between message list and reader pane.
 *
 * @param {Object} props
 * @param {'vertical'|'horizontal'} props.direction - Split orientation
 * @param {Function} props.onResize - Callback receiving new percentage (e.g. 40)
 * @param {number} props.currentRatio - Current split percentage
 */
export default function SplitDivider({ direction = 'vertical', onResize, currentRatio = 40 }) {
  const isDraggingRef = useRef(false);
  const startPosRef = useRef(0);
  const startRatioRef = useRef(currentRatio);

  useEffect(() => {
    function handleMouseMove(e) {
      if (!isDraggingRef.current) return;

      const container = direction === 'vertical'
        ? window.innerWidth
        : window.innerHeight;

      const currentPos = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      const deltaPercent = (delta / container) * 100;

      let newRatio = startRatioRef.current + deltaPercent;
      newRatio = Math.max(20, Math.min(80, newRatio)); // Bound between 20% and 80%

      onResize(Math.round(newRatio));
    }

    function handleMouseUp() {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    }

    function handleTouchMove(e) {
      if (!isDraggingRef.current || !e.touches[0]) return;
      const touch = e.touches[0];
      const container = direction === 'vertical' ? window.innerWidth : window.innerHeight;
      const currentPos = direction === 'vertical' ? touch.clientX : touch.clientY;
      const delta = currentPos - startPosRef.current;
      const deltaPercent = (delta / container) * 100;
      let newRatio = startRatioRef.current + deltaPercent;
      newRatio = Math.max(20, Math.min(80, newRatio));
      onResize(Math.round(newRatio));
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [direction, onResize]);

  function startDrag(clientX, clientY) {
    isDraggingRef.current = true;
    startPosRef.current = direction === 'vertical' ? clientX : clientY;
    startRatioRef.current = currentRatio;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'vertical' ? 'col-resize' : 'row-resize';
  }

  function handleKeyDown(e) {
    if (direction === 'vertical') {
      if (e.key === 'ArrowLeft') onResize(Math.max(20, currentRatio - 2));
      if (e.key === 'ArrowRight') onResize(Math.min(80, currentRatio + 2));
    } else {
      if (e.key === 'ArrowUp') onResize(Math.max(20, currentRatio - 2));
      if (e.key === 'ArrowDown') onResize(Math.min(80, currentRatio + 2));
    }
  }

  return (
    <div
      className={`split-divider split-divider-${direction}`}
      onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }}
      role="separator"
      tabIndex={0}
      aria-orientation={direction}
      aria-valuenow={currentRatio}
      aria-valuemin={20}
      aria-valuemax={80}
      onKeyDown={handleKeyDown}
      title="Drag to resize split panes"
    >
      <div className="split-divider-grip">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
