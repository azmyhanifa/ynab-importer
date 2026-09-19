'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

const ACTION_WIDTH = 84;
const OPEN_THRESHOLD = 36;
const COMMIT_DISTANCE = 100;
const DIRECTION_LOCK = 12;

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

function isFormControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select'));
}

export default function SwipeToDelete({
  open,
  onOpenChange,
  onDelete,
  surfaceClassName = '',
  dimmed = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  surfaceClassName?: string;
  dimmed?: boolean;
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const lastX = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);
  const lock = useRef<'h' | 'v' | null>(null);
  const draggingRef = useRef(false);
  const suppressClick = useRef(false);
  const pointerId = useRef<number | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [rowWidth, setRowWidth] = useState(320);

  const setOff = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setRowWidth(el.getBoundingClientRect().width || 320);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const blockScroll = (event: TouchEvent) => {
      if (lock.current === 'h') event.preventDefault();
    };
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, []);

  // Another row took over — snap this one shut. Never snap open from the
  // prop; that raced with taps and left rows stuck on Delete.
  useEffect(() => {
    if (draggingRef.current) return;
    if (!open && offsetRef.current !== 0) setOff(0);
  }, [open]);

  useEffect(() => () => detachRef.current?.(), []);

  const commitDelete = () => {
    detachRef.current?.();
    draggingRef.current = false;
    setDragging(false);
    onOpenChange(false);
    onDelete();
  };

  const settle = () => {
    const width = rowWidth || rootRef.current?.getBoundingClientRect().width || 320;
    const commitAt = Math.max(COMMIT_DISTANCE, Math.min(width * 0.3, 120));
    const flick = velocity.current < -0.45 && offsetRef.current < -20;
    if (offsetRef.current <= -commitAt || flick) {
      commitDelete();
      return;
    }
    if (offsetRef.current <= -OPEN_THRESHOLD) {
      setOff(-ACTION_WIDTH);
      onOpenChange(true);
      return;
    }
    setOff(0);
    onOpenChange(false);
  };

  const trackMove = (clientX: number, clientY: number) => {
    const dx = clientX - startX.current;
    const dy = clientY - startY.current;
    if (!lock.current) {
      if (Math.abs(dx) < DIRECTION_LOCK && Math.abs(dy) < DIRECTION_LOCK) return;
      lock.current = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'h' : 'v';
      if (lock.current === 'h') {
        draggingRef.current = true;
        setDragging(true);
        onOpenChange(true);
      }
    }
    if (lock.current !== 'h') return;
    if (Math.abs(dx) > 16) suppressClick.current = true;
    const now = performance.now();
    velocity.current = (clientX - lastX.current) / Math.max(now - lastT.current, 1);
    lastX.current = clientX;
    lastT.current = now;

    let next = startOffset.current + dx;
    if (next > 0) next *= 0.18;
    const maxLeft = -(Math.max(rowWidth, 1) * 0.92);
    if (next < maxLeft) next = maxLeft + (next - maxLeft) * 0.2;
    setOff(next);
  };

  const endGesture = () => {
    pointerId.current = null;
    detachRef.current?.();
    detachRef.current = null;
    if (lock.current === 'h') {
      if (performance.now() - lastT.current > 80) velocity.current = 0;
      draggingRef.current = false;
      setDragging(false);
      settle();
    }
    lock.current = null;
  };

  const attachWindow = () => {
    detachRef.current?.();
    const onMove = (event: PointerEvent) => {
      if (pointerId.current !== event.pointerId) return;
      trackMove(event.clientX, event.clientY);
    };
    const onUp = (event: PointerEvent) => {
      if (pointerId.current !== event.pointerId) return;
      endGesture();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    detachRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isFormControl(event.target)) return;
    pointerId.current = event.pointerId;
    startX.current = event.clientX;
    startY.current = event.clientY;
    startOffset.current = offsetRef.current;
    lastX.current = event.clientX;
    lastT.current = performance.now();
    velocity.current = 0;
    lock.current = null;
    attachWindow();
  };

  return (
    <div ref={rootRef} className="relative overflow-hidden touch-pan-y">
      <div className="absolute inset-0 bg-[#e24b4a] flex items-stretch justify-end">
        <button
          type="button"
          onClick={commitDelete}
          onPointerDown={event => event.stopPropagation()}
          className="h-full text-white text-[13px] font-semibold tracking-wide"
          style={{ width: ACTION_WIDTH }}
        >
          Delete
        </button>
      </div>
      <div
        className={`${surfaceClassName} relative ${dimmed ? 'opacity-55' : ''}`}
        style={{
          transform: `translate3d(${offset}px,0,0)`,
          transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onClickCapture={event => {
          if (isFormControl(event.target)) {
            suppressClick.current = false;
            return;
          }
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
            return;
          }
          if (offsetRef.current < -12) {
            event.preventDefault();
            event.stopPropagation();
            setOff(0);
            onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
