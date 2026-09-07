import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  UploadCloud,
  X,
  Minus,
  Maximize2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  Plus,
  Trash2,
  StopCircle,
  RotateCcw
} from 'lucide-react';
import { useI18n } from '../hooks/useI18n.js';
import { formatBytes } from '../lib/utils.js';

export interface UploadQueueItem {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: 'queued' | 'uploading' | 'completed' | 'error' | 'aborted';
  errorMessage?: string;
  xhr?: XMLHttpRequest;
}

interface StorageUploadManagerProps {
  databaseId: string;
  onUploadSuccess?: () => void;
  incomingFiles?: FileList | File[] | null;
  onClearIncomingFiles?: () => void;
}

const MAX_CONCURRENT_UPLOADS = 3;

export const StorageUploadManager: React.FC<StorageUploadManagerProps> = ({
  databaseId,
  onUploadSuccess,
  incomingFiles,
  onClearIncomingFiles,
}) => {
  const { t } = useI18n();
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<UploadQueueItem[]>([]);
  queueRef.current = queue;

  // Cleanup object URLs on unmount to avoid RAM leaks
  useEffect(() => {
    return () => {
      queueRef.current.forEach((item) => {
        if (item.previewUrl) {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch {}
        }
        if (item.status === 'uploading' && item.xhr) {
          try {
            item.xhr.abort();
          } catch {}
        }
      });
    };
  }, []);

  // Enqueue new files
  const enqueueFiles = useCallback((files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const newItems: UploadQueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let previewUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {}
      }

      newItems.push({
        id: `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${i}`,
        file,
        previewUrl,
        progress: 0,
        status: 'queued',
      });
    }

    setQueue((prev) => [...prev, ...newItems]);
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  // Handle incoming files from global drag & drop
  useEffect(() => {
    if (incomingFiles && incomingFiles.length > 0) {
      enqueueFiles(incomingFiles);
      if (onClearIncomingFiles) {
        onClearIncomingFiles();
      }
    }
  }, [incomingFiles, enqueueFiles, onClearIncomingFiles]);

  // Upload runner with concurrency limit
  useEffect(() => {
    const activeUploads = queue.filter((item) => item.status === 'uploading');
    if (activeUploads.length >= MAX_CONCURRENT_UPLOADS) return;

    const nextItem = queue.find((item) => item.status === 'queued');
    if (!nextItem) return;

    // Start uploading nextItem
    const xhr = new XMLHttpRequest();

    setQueue((prev) =>
      prev.map((item) =>
        item.id === nextItem.id
          ? { ...item, status: 'uploading', xhr }
          : item
      )
    );

    const formData = new FormData();
    formData.append('file', nextItem.file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.min(99, Math.round((e.loaded / e.total) * 100));
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id ? { ...item, progress: percent } : item
          )
        );
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        setQueue((prev) =>
          prev.map((item) => {
            if (item.id === nextItem.id) {
              if (item.previewUrl) {
                try {
                  URL.revokeObjectURL(item.previewUrl);
                } catch {}
              }
              return { ...item, status: 'completed', progress: 100, xhr: undefined };
            }
            return item;
          })
        );
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        let errMsg = xhr.statusText || 'Upload failed';
        try {
          const res = JSON.parse(xhr.responseText);
          if (res?.error?.message) errMsg = res.error.message;
        } catch {}
        setQueue((prev) =>
          prev.map((item) =>
            item.id === nextItem.id
              ? { ...item, status: 'error', errorMessage: errMsg, xhr: undefined }
              : item
          )
        );
      }
    };

    xhr.onerror = () => {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === nextItem.id
            ? { ...item, status: 'error', errorMessage: 'Network error', xhr: undefined }
            : item
        )
      );
    };

    xhr.onabort = () => {
      setQueue((prev) =>
        prev.map((item) =>
          item.id === nextItem.id
            ? { ...item, status: 'aborted', errorMessage: 'Upload cancelled', xhr: undefined }
            : item
        )
      );
    };

    xhr.open('POST', `/api/admin/databases/${databaseId}/files`);
    xhr.withCredentials = true;
    xhr.send(formData);
  }, [queue, databaseId, onUploadSuccess]);

  const cancelUpload = (id: string) => {
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          if (item.xhr) {
            try {
              item.xhr.abort();
            } catch {}
          }
          if (item.previewUrl) {
            try {
              URL.revokeObjectURL(item.previewUrl);
            } catch {}
          }
          return { ...item, status: 'aborted', xhr: undefined };
        }
        return item;
      })
    );
  };

  const retryUpload = (id: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: 'queued', progress: 0, errorMessage: undefined } : item
      )
    );
  };

  const removeQueueItem = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        if (target.xhr) {
          try {
            target.xhr.abort();
          } catch {}
        }
        if (target.previewUrl) {
          try {
            URL.revokeObjectURL(target.previewUrl);
          } catch {}
        }
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const cancelAll = () => {
    queue.forEach((item) => {
      if (item.xhr && (item.status === 'uploading' || item.status === 'queued')) {
        try {
          item.xhr.abort();
        } catch {}
      }
      if (item.previewUrl) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {}
      }
    });
    setQueue((prev) =>
      prev.map((item) =>
        item.status === 'uploading' || item.status === 'queued'
          ? { ...item, status: 'aborted', xhr: undefined }
          : item
      )
    );
  };

  const clearCompleted = () => {
    setQueue((prev) => {
      prev.forEach((item) => {
        if ((item.status === 'completed' || item.status === 'aborted') && item.previewUrl) {
          try {
            URL.revokeObjectURL(item.previewUrl);
          } catch {}
        }
      });
      return prev.filter((item) => item.status !== 'completed' && item.status !== 'aborted');
    });
  };

  const closeWidget = () => {
    const hasUploading = queue.some((i) => i.status === 'uploading' || i.status === 'queued');
    if (hasUploading) {
      if (window.confirm(t('storage.confirmCancelUploads', 'Cancel ongoing uploads?'))) {
        cancelAll();
        setIsOpen(false);
      }
    } else {
      setIsOpen(false);
    }
  };

  if (!isOpen && queue.length === 0) {
    return null;
  }

  const uploadingCount = queue.filter((i) => i.status === 'uploading' || i.status === 'queued').length;
  const completedCount = queue.filter((i) => i.status === 'completed').length;
  const errorCount = queue.filter((i) => i.status === 'error').length;
  const totalCount = queue.length;

  const totalBytes = queue.reduce((acc, cur) => acc + cur.file.size, 0);
  const loadedBytes = queue.reduce((acc, cur) => {
    if (cur.status === 'completed') return acc + cur.file.size;
    if (cur.status === 'uploading') return acc + (cur.file.size * cur.progress) / 100;
    return acc;
  }, 0);
  const totalPercent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 transition-all duration-200">
      {/* Hidden Multi-file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.json,*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            enqueueFiles(e.target.files);
          }
          e.target.value = ''; // Reset to allow re-selecting same files
        }}
      />

      {/* MINIMIZED VIEW */}
      {isMinimized ? (
        <div className="flex items-center gap-2 bg-card border border-border rounded-full shadow-2xl px-3.5 py-2 text-xs backdrop-blur-md">
          {uploadingCount > 0 ? (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="font-medium text-foreground">
                {t('storage.uploadingCount', `Uploading {count} file(s)...`).replace('{count}', String(uploadingCount))}
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">({totalPercent}%)</span>
            </div>
          ) : errorCount > 0 ? (
            <div className="flex items-center gap-1.5 text-amber-500">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">
                {t('storage.uploadFailedCount', `{count} upload(s) failed`).replace('{count}', String(errorCount))}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              <span className="font-medium">
                {t('storage.uploadCompleted', `{count} file(s) uploaded`).replace('{count}', String(completedCount))}
              </span>
            </div>
          )}

          <div className="h-4 w-px bg-border mx-1" />

          {/* Expand Button */}
          <button
            onClick={() => setIsMinimized(false)}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            title={t('storage.expand', 'Expand')}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close Button */}
          <button
            onClick={closeWidget}
            className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
            title={t('storage.close', 'Close')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* EXPANDED VIEW */
        <div className="w-80 sm:w-96 bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-md animate-in slide-in-from-bottom-2 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-muted/60 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-foreground">
                {uploadingCount > 0
                  ? t('storage.uploadProgress', `Uploading {current} of {total}...`)
                      .replace('{current}', String(completedCount + 1))
                      .replace('{total}', String(totalCount))
                  : t('storage.uploadManager', 'Uploads')}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* Select more files button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
                title={t('storage.selectMultipleImages', 'Select multiple images / files')}
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Minimize (nút ẩn) */}
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                title={t('storage.minimize', 'Minimize')}
              >
                <Minus className="w-4 h-4" />
              </button>

              {/* Close (nút tắt) */}
              <button
                onClick={closeWidget}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                title={t('storage.close', 'Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Overall Progress Bar */}
          {uploadingCount > 0 && (
            <div className="px-4 py-2 border-b border-border/50 bg-card">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground mb-1">
                <span>{totalPercent}%</span>
                <span>
                  {formatBytes(loadedBytes)} / {formatBytes(totalBytes)}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${totalPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* File Items List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-border/40 p-1">
            {queue.map((item) => {
              const isImage = item.file.type.startsWith('image/');
              return (
                <div key={item.id} className="p-2 flex items-center gap-2.5 hover:bg-accent/40 rounded transition-colors text-xs">
                  {/* Thumbnail / Icon */}
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/60">
                    {isImage && item.previewUrl ? (
                      <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info & Progress */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium text-foreground truncate text-[11px]" title={item.file.name}>
                        {item.file.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {formatBytes(item.file.size)}
                      </span>
                    </div>

                    {item.status === 'uploading' && (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="w-full bg-muted rounded-full h-1 overflow-hidden flex-1">
                          <div
                            className="bg-blue-500 h-full transition-all duration-200"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-blue-500 font-mono">{item.progress}%</span>
                      </div>
                    )}

                    {item.status === 'queued' && (
                      <span className="text-[10px] text-muted-foreground">
                        {t('storage.statusQueued', 'Queued')}
                      </span>
                    )}

                    {item.status === 'completed' && (
                      <span className="text-[10px] text-emerald-500 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {t('storage.statusCompleted', 'Completed')}
                      </span>
                    )}

                    {item.status === 'error' && (
                      <span className="text-[10px] text-red-500 truncate block" title={item.errorMessage}>
                        {item.errorMessage || t('storage.statusError', 'Error')}
                      </span>
                    )}

                    {item.status === 'aborted' && (
                      <span className="text-[10px] text-muted-foreground">
                        {t('storage.statusAborted', 'Cancelled')}
                      </span>
                    )}
                  </div>

                  {/* Item Actions */}
                  <div className="shrink-0 flex items-center">
                    {item.status === 'uploading' && (
                      <button
                        onClick={() => cancelUpload(item.id)}
                        className="p-1 text-muted-foreground hover:text-red-500 rounded"
                        title={t('storage.cancelUpload', 'Cancel')}
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {item.status === 'error' && (
                      <button
                        onClick={() => retryUpload(item.id)}
                        className="p-1 text-muted-foreground hover:text-blue-500 rounded"
                        title={t('storage.retry', 'Retry')}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(item.status === 'completed' || item.status === 'aborted' || item.status === 'error') && (
                      <button
                        onClick={() => removeQueueItem(item.id)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded"
                        title={t('common.delete', 'Delete')}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="px-3 py-2 bg-muted/40 border-t border-border flex items-center justify-between text-[11px]">
            {/* Button to select multiple images */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('storage.selectMultipleImages', 'Select multiple images / files')}
            </button>

            <div className="flex items-center gap-2">
              {uploadingCount > 0 && (
                <button
                  onClick={cancelAll}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                >
                  {t('storage.cancelAll', 'Cancel All')}
                </button>
              )}

              {completedCount > 0 && (
                <button
                  onClick={clearCompleted}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t('storage.clearCompleted', 'Clear Completed')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
