import { useEffect, useMemo, useState } from 'react';

interface DeferredPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY = 'enara-pwa-install-dismissed';

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<DeferredPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isIos = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }, []);

  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setDismissed(window.localStorage.getItem(STORAGE_KEY) === 'true');

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as DeferredPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallEvent(null);
      window.localStorage.removeItem(STORAGE_KEY);
      setDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const closePrompt = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'true');
    }
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallEvent(null);
      closePrompt();
    }
  };

  const showIosHint = isIos && !isStandalone && !dismissed;
  const showInstallButton = Boolean(installEvent) && !dismissed && !isStandalone;

  if (!showIosHint && !showInstallButton) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-[90] md:bottom-6 md:left-6 md:right-auto md:max-w-sm" dir="rtl">
      <div className="pointer-events-auto dashboard-panel rounded-3xl border border-white/70 p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#004d40_0%,#00bfa5_100%)] text-sm font-black text-white">
            PWA
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-black text-[#004d40]">تثبيت التطبيق</h3>
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {showInstallButton
                ? 'يمكنك تثبيت التطبيق الآن ليعمل كتطبيق مستقل على الجهاز مع فتح أسرع وتجربة أقرب للتطبيقات الأصلية.'
                : 'على iPhone افتح قائمة المشاركة في Safari ثم اختر "إضافة إلى الشاشة الرئيسية" لتثبيت التطبيق.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {showInstallButton && (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="rounded-2xl bg-[#004d40] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#00695c]"
                >
                  تثبيت الآن
                </button>
              )}
              <button
                type="button"
                onClick={closePrompt}
                className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                لاحقاً
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
