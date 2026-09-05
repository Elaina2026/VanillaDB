import React, { useState, useEffect } from 'react';
import { RefreshCw, ArrowLeft, Home, WifiOff, AlertTriangle, Compass, ShieldAlert, Terminal } from 'lucide-react';
import { LogoIcon } from '../components/LogoIcon.js';
import { useI18n } from '../hooks/useI18n.js';

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
  const { t } = useI18n();
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
    ? t('error.offlineTitle', 'Mất kết nối máy chủ (503 Server Offline)')
    : is404
    ? t('error.404Title', '404 - Không tìm thấy trang')
    : t('error.generalTitle', 'Đã xảy ra lỗi hệ thống');

  const defaultMessage = isOffline
    ? t('error.offlineDesc', 'Không thể kết nối đến máy chủ VanillaDatabase. Máy chủ có thể đang tắt, đang khởi động lại hoặc mạng của bạn bị gián đoạn.')
    : is404
    ? t('error.404Desc', 'Trang hoặc tài nguyên dữ liệu bạn đang tìm kiếm không tồn tại, đã bị đổi tên hoặc bạn không có quyền truy cập.')
    : t('error.generalDesc', 'Hệ thống gặp sự cố không mong muốn trong quá trình xử lý. Vui lòng thử lại sau giây lát.');

  const handleHomeClick = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      window.location.hash = '/overview';
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden bg-background text-foreground">
      {/* Background Decorative Gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-md w-full space-y-6 z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Status Illustration / Badge */}
        <div className="flex flex-col items-center justify-center gap-3">
          {/* Big Error Number / Graphic */}
          <div className="relative">
            <span className="text-7xl sm:text-8xl font-black tracking-tighter text-muted-foreground/15 font-mono select-none">
              {isOffline ? '503' : is404 ? '404' : '500'}
            </span>

            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`p-4 rounded-2xl border shadow-lg backdrop-blur-sm ${
                isOffline
                  ? 'bg-red-500/10 border-red-500/30 text-red-500 shadow-red-500/5'
                  : is404
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-500 shadow-blue-500/5'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-500 shadow-amber-500/5'
              }`}>
                {isOffline ? (
                  <WifiOff className="w-10 h-10 stroke-[2]" />
                ) : is404 ? (
                  <Compass className="w-10 h-10 stroke-[2] animate-spin-slow" />
                ) : (
                  <AlertTriangle className="w-10 h-10 stroke-[2]" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Text Heading & Details */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-muted border border-border text-muted-foreground shadow-sm">
            {isOffline ? 'Server Unreachable' : is404 ? 'Page Not Found' : 'Internal Error'}
          </div>

          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {title || defaultTitle}
          </h1>

          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {message || defaultMessage}
          </p>
        </div>

        {/* Offline Auto-reconnect Ticker */}
        {isOffline && (
          <div className="p-3 bg-card border border-border rounded-xl text-xs font-mono flex items-center justify-between text-muted-foreground shadow-sm max-w-xs mx-auto">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              {t('error.autoRetryIn', 'Tự động thử lại sau:')}
            </span>
            <span className="font-bold text-foreground bg-muted px-2.5 py-0.5 rounded-md border border-border">
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
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? t('error.checking', 'Đang kiểm tra kết nối...') : t('error.retryNow', 'Thử kết nối lại ngay')}
            </button>
          ) : (
            <>
              <button
                onClick={handleHomeClick}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" />
                {t('error.goHome', 'Về Trang Tổng quan')}
              </button>

              <button
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back();
                  } else {
                    window.location.hash = '/overview';
                  }
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-card border border-border hover:bg-accent text-foreground rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('error.goBack', 'Quay lại trang trước')}
              </button>
            </>
          )}
        </div>

        {/* Helpful quick links */}
        {is404 && (
          <div className="pt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground border-t border-border/60">
            <button
              onClick={() => { window.location.hash = '/databases'; }}
              className="hover:text-blue-500 transition-colors underline underline-offset-2"
            >
              {t('error.listDatabases', 'Danh sách Databases')}
            </button>
            <span>•</span>
            <button
              onClick={() => { window.location.hash = '/telemetry'; }}
              className="hover:text-blue-500 transition-colors underline underline-offset-2"
            >
              {t('error.liveTelemetry', 'Live Telemetry')}
            </button>
            <span>•</span>
            <button
              onClick={() => { window.location.hash = '/activity'; }}
              className="hover:text-blue-500 transition-colors underline underline-offset-2"
            >
              {t('error.activityLogs', 'Activity Logs')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
