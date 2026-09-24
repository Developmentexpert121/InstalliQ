import { useState, useRef, useCallback, useEffect } from "react";

interface PinchZoomWrapperProps {
  children: React.ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
}

export default function PinchZoomWrapper({
  children,
  className = "",
  minScale = 1,
  maxScale = 3,
}: PinchZoomWrapperProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const initialDistRef = useRef<number | null>(null);
  const initialScaleRef = useRef(1);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const isPanningRef = useRef(false);

  const getDistance = (touches: React.TouchList | TouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (touches: React.TouchList | TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const clampTranslate = useCallback(
    (tx: number, ty: number, s: number) => {
      if (s <= 1) return { x: 0, y: 0 };
      const el = containerRef.current;
      if (!el) return { x: tx, y: ty };
      const maxX = (el.scrollWidth * (s - 1)) / 2;
      const maxY = (el.scrollHeight * (s - 1)) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, tx)),
        y: Math.max(-maxY, Math.min(maxY, ty)),
      };
    },
    []
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        initialDistRef.current = getDistance(e.touches);
        initialScaleRef.current = scale;
        isPanningRef.current = false;
      } else if (e.touches.length === 1 && scale > 1) {
        isPanningRef.current = true;
        lastTouchRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    },
    [scale]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && initialDistRef.current !== null) {
        e.preventDefault();
        const currentDist = getDistance(e.touches);
        const newScale = Math.min(
          maxScale,
          Math.max(minScale, initialScaleRef.current * (currentDist / initialDistRef.current))
        );
        setScale(newScale);
        if (newScale <= 1) {
          setTranslate({ x: 0, y: 0 });
        }
      } else if (e.touches.length === 1 && scale > 1 && isPanningRef.current && lastTouchRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastTouchRef.current.x;
        const dy = e.touches[0].clientY - lastTouchRef.current.y;
        lastTouchRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setTranslate((prev) => clampTranslate(prev.x + dx, prev.y + dy, scale));
      }
    },
    [scale, maxScale, minScale, clampTranslate]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) {
        initialDistRef.current = null;
      }
      if (e.touches.length === 0) {
        isPanningRef.current = false;
        lastTouchRef.current = null;
        if (scale < 1.05) {
          setScale(1);
          setTranslate({ x: 0, y: 0 });
        }
      }
    },
    [scale]
  );

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", preventDefault, { passive: false });
    return () => el.removeEventListener("touchmove", preventDefault);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {scale > 1.05 && (
        <button
          onClick={resetZoom}
          className="absolute top-2 right-2 z-50 bg-primary text-primary-foreground text-xs font-medium px-2.5 py-1.5 rounded-full shadow-lg flex items-center gap-1"
          data-testid="button-reset-zoom"
        >
          <span>{Math.round(scale * 100)}%</span>
          <span className="opacity-70">✕</span>
        </button>
      )}
      <div
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: "center top",
          transition: scale <= 1.05 && !isPanningRef.current ? "transform 0.2s ease-out" : "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="w-full h-full"
      >
        {children}
      </div>
    </div>
  );
}
