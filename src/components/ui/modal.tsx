"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white border-2 border-black p-6 md:p-8 max-w-md w-full space-y-6 shadow-none animate-in fade-in zoom-in-95 duration-200">
        <div className="space-y-2 text-center">
          <h3 className="text-2xl font-serif font-bold">{title}</h3>
          <p className="text-muted-foreground font-sans">{description}</p>
        </div>
        <div className="flex gap-4 pt-2 justify-center">
          <Button variant="outline" onClick={onClose} className="w-full">
            {cancelText}
          </Button>
          <Button
            onClick={onConfirm}
            className="w-full bg-black text-white hover:bg-black/90"
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
