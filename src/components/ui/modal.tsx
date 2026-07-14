import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  secondaryText?: string;
  onSecondary?: () => void;
  children?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  onConfirm,
  confirmText,
  cancelText = "Cancel",
  secondaryText,
  onSecondary,
  children,
}: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {children ?? (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {cancelText}
            </Button>
            {onSecondary && secondaryText ? (
              <Button variant="destructive" onClick={onSecondary}>
                {secondaryText}
              </Button>
            ) : null}
            {onConfirm && confirmText ? (
              <Button onClick={onConfirm}>{confirmText}</Button>
            ) : null}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
