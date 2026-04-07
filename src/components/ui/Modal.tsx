import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/src/lib/utils"

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className={cn("dashboard-panel max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] p-6 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]", className)}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
