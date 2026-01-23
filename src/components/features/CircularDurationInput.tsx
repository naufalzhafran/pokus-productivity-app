import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CircularDurationInputProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: React.ReactNode;
  readOnly?: boolean;
}

export function CircularDurationInput({
  value,
  onChange,
  max = 60,
  size = 320,
  strokeWidth = 8,
  className,
  readOnly = false,
  children,
}: CircularDurationInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // We use a fixed coordinate system for the SVG internals (0,0) to (size, size)
  // resizing is handled by CSS on the root div
  const center = size / 2;
  const radius = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate angle from value
  // Value 0 is at top (-90 deg), so we map 0..max to 0..360
  const normalizedValue = Math.min(Math.max(0, value), max);
  const angle = (normalizedValue / max) * 360;

  // Progress calculations
  const progressOffset = circumference - (angle / 360) * circumference;

  // Thumb position
  const thumbAngleRad = (angle - 90) * (Math.PI / 180);
  const thumbX = center + radius * Math.cos(thumbAngleRad);
  const thumbY = center + radius * Math.sin(thumbAngleRad);

  const calculateValueFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);

      // Calculate angle in degrees, offset by 90 (so 0 is top)
      let theta = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (theta < 0) theta += 360;

      // Calculate value based on angle
      const newValue = Math.round((theta / 360) * max);

      // Handle the wraparound case near 0/60
      return Math.min(Math.max(0, newValue), max);
    },
    [max],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const newVal = calculateValueFromPointer(e.clientX, e.clientY);
    if (newVal !== undefined) onChange(newVal);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || readOnly) return;
    const newVal = calculateValueFromPointer(e.clientX, e.clientY);
    if (newVal !== undefined) onChange(newVal);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={cn(
        "relative flex items-center justify-center select-none touch-none aspect-square w-full h-auto",
        className,
      )}
      style={{ maxWidth: size }} // Optional max-width constraint if provided
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(
          "w-full h-full block",
          readOnly ? "cursor-default" : "cursor-pointer",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />

        {/* Progress */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#06b6d4" // Cyan-500
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          transform={`rotate(-90 ${center} ${center})`}
          className="transition-all duration-75 ease-out"
        />

        {/* Thumb */}
        {!readOnly && (
          <>
            <circle
              cx={thumbX}
              cy={thumbY}
              r={strokeWidth * 1.5}
              fill="#fff"
              className="shadow-lg filter drop-shadow-md cursor-grab active:cursor-grabbing transition-transform"
            />
            <circle
              cx={thumbX}
              cy={thumbY}
              r={strokeWidth * 3}
              fill="transparent"
              className="cursor-grab active:cursor-grabbing"
            />
          </>
        )}
      </svg>
      {/* Centered Children Container with responsive text sizing hack or absolute positioning */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
  );
}
