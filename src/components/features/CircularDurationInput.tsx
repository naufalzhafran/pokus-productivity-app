import React, { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CircularDurationInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  size: number;
  strokeWidth: number;
  className?: string;
  children?: React.ReactNode;
  readOnly?: boolean;
  ariaLabel?: string;
  ariaValueText?: string;
}

export function CircularDurationInput({
  value,
  onChange,
  min = 0,
  max,
  size,
  strokeWidth,
  className,
  readOnly = false,
  ariaLabel = "Timer duration",
  ariaValueText,
  children,
}: CircularDurationInputProps) {
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const center = size / 2;
  const radius = center - strokeWidth * 2;
  const circumference = 2 * Math.PI * radius;

  const normalizedValue = Math.min(Math.max(min, value), max);
  const range = max - min;
  const angle = range === 0 ? 0 : ((normalizedValue - min) / range) * 360;

  const progressOffset = circumference - (angle / 360) * circumference;

  const thumbAngleRad = (angle - 90) * (Math.PI / 180);
  const thumbX = center + radius * Math.cos(thumbAngleRad);
  const thumbY = center + radius * Math.sin(thumbAngleRad);

  const calculateValueFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);

      let theta = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (theta < 0) theta += 360;

      const newValue = Math.round((theta / 360) * (max - min) + min);
      return Math.min(Math.max(min, newValue), max);
    },
    [max, min],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    svgRef.current?.setPointerCapture(e.pointerId);
    const newVal = calculateValueFromPointer(e.clientX, e.clientY);
    if (newVal !== undefined) onChange(newVal);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || readOnly) return;
    const newVal = calculateValueFromPointer(e.clientX, e.clientY);
    if (newVal !== undefined) onChange(newVal);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (readOnly) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const handlePointerCancel = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (readOnly) return;

    let nextValue = value;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowRight":
        nextValue += 1;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nextValue -= 1;
        break;
      case "PageUp":
        nextValue += 5;
        break;
      case "PageDown":
        nextValue -= 5;
        break;
      case "Home":
        nextValue = min;
        break;
      case "End":
        nextValue = max;
        break;
      default:
        return;
    }

    e.preventDefault();
    onChange(Math.min(Math.max(min, nextValue), max));
  };

  return (
    <div
      className={cn(
        "relative flex aspect-square h-auto w-full select-none items-center justify-center",
        isDragging && "is-dragging",
        className,
      )}
      style={{ maxWidth: size }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size} ${size}`}
        className={cn(
          "block size-full",
          readOnly
            ? "cursor-default"
            : "cursor-pointer focus-visible:outline-none",
        )}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
        onKeyDown={handleKeyDown}
        role={readOnly ? undefined : "slider"}
        aria-label={readOnly ? undefined : ariaLabel}
        aria-valuemin={readOnly ? undefined : min}
        aria-valuemax={readOnly ? undefined : max}
        aria-valuenow={readOnly ? undefined : normalizedValue}
        aria-valuetext={readOnly ? undefined : ariaValueText}
        tabIndex={readOnly ? undefined : 0}
      >
        {!readOnly && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(72, strokeWidth * 4)}
            className="bezel-hit-area"
            onPointerDown={handlePointerDown}
          />
        )}

        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
          className="circular-track pointer-events-none"
        />

        {/* Progress */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          transform={`rotate(-90 ${center} ${center})`}
          className="circular-progress pointer-events-none transition-[stroke-dashoffset] duration-75 ease-out"
        />

        {/* Thumb */}
        {!readOnly && (
          <>
            <circle
              cx={thumbX}
              cy={thumbY}
              r={strokeWidth * 1.15}
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth={strokeWidth * 0.45}
              className="circular-thumb pointer-events-none bezel-thumb"
            />
            <circle
              cx={thumbX}
              cy={thumbY}
              r={strokeWidth * 0.5}
              fill="var(--primary-foreground)"
              className="pointer-events-none"
            />
          </>
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {children}
      </div>
    </div>
  );
}
