import React from 'react';
import { AlertTriangle, Trash2, RotateCcw, AlertCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150 relative">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute right-3.5 top-3.5 p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl border shrink-0 ${
              isDanger
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : isWarning
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-500'
            }`}
          >
            {isDanger ? (
              <Trash2 className="w-5 h-5" />
            ) : isWarning ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <RotateCcw className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-1 pr-4">
            <h3 className="text-sm font-bold text-foreground leading-snug">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-1.5 bg-card border border-border hover:bg-accent text-foreground text-xs font-medium rounded-md transition-colors"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-1.5 text-white text-xs font-semibold rounded-md shadow-sm transition-colors flex items-center gap-1.5 ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                : isWarning
                ? 'bg-amber-600 hover:bg-amber-700 disabled:opacity-50'
                : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
            }`}
          >
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
