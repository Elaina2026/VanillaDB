import React, { useState, useEffect } from 'react';
import { RefreshCw, ArrowLeft, Home, WifiOff, AlertTriangle, HelpCircle } from 'lucide-react';
import { LogoIcon } from '../components/LogoIcon.js';

interface ErrorPageProps {
  type?: '404' | 'offline' | 'error';
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}

export const ErrorPage: React.FC<ErrorPageProps> = ({
  type = '404',
  title,
  message,
  onRetry,
  onGoHome,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [countdown, setCountdown] = useState(10);

  // Auto retry ping if offline
  useEffect(() => {
    if (type !== 'offline') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handlePingServer();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [type]);

  const handlePingServer = async () => {
    setIsChecking(true);
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      if (res.ok) {
        if (onRetry) onRetry();
        else window.location.reload();
      }
    } catch {
      // still offline
    } finally {
      setIsChecking(false);
    }
  };

  const is404 = type === '404';
  const isOffline = type === 'offline';

  const defaultTitle = isOffline
    ? 'Máy chủ mất kết nối (Server Offline)'
    : is404
    ? '404 - Không tìm thấy trang'
    : 'Đã xảy ra sự cố hệ thống';

  const defaultMessage = isOffline
    ? 'Không thể kết nối đến máy chủ VanillaDatabase. Máy chủ có thể đang tắt, đang khởi động lại hoặc mạng của bạn bị gián đoạn.'
    : is404
    ? 'Đường dẫn hoặc trang dữ liệu bạn yêu cầu không tồn tại hoặc đã bị xóa.'
    : 'Gặp lỗi không mong muốn khi xử lý yêu cầu. Vui lòng thử lại sau giây lát.';

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground p-6 select-none relative overflow-hidden">
      {/* Subtle Background Glow */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full text-center space-y-6 z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Brand & Status Icon */}
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-card border border-border p-2">
            <LogoIcon className="w-10 h-10" />
          </div>

          <div className="relative mt-2">
            <div className={`p-4 rounded-2xl border shadow-inner ${
              isOffline
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : is404
                ? 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
            }`}>
              {isOffline ? (
                <WifiOff className="w-12 h-12 stroke-[1.75]" />
              ) : is404 ? (
                <HelpCircle className="w-12 h-12 stroke-[1.75]" />
              ) : (
                <AlertTriangle className="w-12 h-12 stroke-[1.75]" />
              )}
            </div>

            {/* Pulsing indicator */}
            {isOffline && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
              </span>
            )}
          </div>
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-muted border border-border text-muted-foreground">
            {isOffline ? '503 Host Disconnected' : is404 ? '404 Page Not Found' : 'Internal System Error'}
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {title || defaultTitle}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {message || defaultMessage}
          </p>
        </div>

        {/* Auto reconnect countdown ticker (for offline) */}
        {isOffline && (
          <div className="p-3 bg-card border border-border rounded-lg text-xs font-mono flex items-center justify-between text-muted-foreground shadow-sm">
            <span>Tự động kết nối lại sau:</span>
            <span className="font-bold text-foreground bg-muted px-2 py-0.5 rounded">
              {countdown}s
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {isOffline ? (
            <button
              onClick={handlePingServer}
              disabled={isChecking}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Đang kiểm tra kết nối...' : 'Thử kết nối lại ngay'}
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  if (onGoHome) onGoHome();
                  else {
                    window.location.hash = '/overview';
                  }
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
              >
                <Home className="w-4 h-4" />
                Về Trang Tổng quan
              </button>

              <button
                onClick={() => window.history.back()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-card border border-border hover:bg-accent text-foreground rounded-lg text-xs font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Quay lại trang trước
              </button>
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="pt-4 text-[11px] text-muted-foreground flex items-center justify-center gap-2">
          <span>VanillaDatabase Cloud Engine</span>
          <span>•</span>
          <a
            href="/health"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline underline-offset-2"
          >
            Health Check API
          </a>
        </div>
      </div>
    </div>
  );
};
