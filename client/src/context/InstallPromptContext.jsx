import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const PWA_INSTALLED_STORAGE_KEY = 'gowhats_pwa_installed';

// ✅ CRITICAL FIX: Capture the event at module load time (before React mounts).
// Chrome fires `beforeinstallprompt` very early — listening only inside useEffect misses it.
let _earlyDeferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _earlyDeferredPrompt = e;
});

const defaultInstallPromptContextValue = {
  deferredPrompt: null,
  isIOS: false,
  isStandalone: false,
  isPwaInstalled: false,
  promptInstall: async () => false,
  platform: 'App',
  isInstalling: false,
  canInstall: false,
};

const InstallPromptContext = createContext(defaultInstallPromptContextValue);

export const useInstallPrompt = () => useContext(InstallPromptContext) || defaultInstallPromptContextValue;

const detectStandaloneMode = () => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true ||
    (typeof document.referrer === 'string' && document.referrer.startsWith('android-app://'))
  );
};

export const InstallPromptProvider = ({ children }) => {
  const isCurrentlyStandalone = detectStandaloneMode();

  // ✅ If running in standalone → definitely installed
  // If NOT standalone → clear any stale flag so banner can show
  const [isPwaInstalled, setIsPwaInstalled] = useState(() => {
    if (isCurrentlyStandalone) return true;
    localStorage.removeItem(PWA_INSTALLED_STORAGE_KEY);
    return false;
  });

  const [isStandalone, setIsStandalone] = useState(isCurrentlyStandalone);

  // ✅ Pick up the early-captured prompt immediately on mount
  const [deferredPrompt, setDeferredPrompt] = useState(() => {
    if (isCurrentlyStandalone) return null;
    return _earlyDeferredPrompt;
  });

  const [isIOS, setIsIOS] = useState(false);
  const [platform, setPlatform] = useState('App');
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua);
    setIsIOS(ios);

    if (ios) setPlatform('iOS');
    else if (ua.includes('android')) setPlatform('Android');
    else if (ua.includes('mac')) setPlatform('Mac');
    else if (ua.includes('linux')) setPlatform('Linux');
    else if (ua.includes('win')) setPlatform('Windows');
    else setPlatform('App');

    // Listen for any future beforeinstallprompt (e.g. after user dismisses and reopens)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      if (detectStandaloneMode()) return;
      _earlyDeferredPrompt = e;
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsStandalone(true);
      setIsPwaInstalled(true);
      localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1');
      setDeferredPrompt(null);
      _earlyDeferredPrompt = null;
      setIsInstalling(false);
    };

    const displayModeMedia = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => {
      const standalone = detectStandaloneMode();
      setIsStandalone(standalone);
      if (standalone) {
        setIsPwaInstalled(true);
        localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1');
        setDeferredPrompt(null);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (typeof displayModeMedia.addEventListener === 'function') {
      displayModeMedia.addEventListener('change', handleDisplayModeChange);
    } else {
      displayModeMedia.addListener(handleDisplayModeChange);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      if (typeof displayModeMedia.removeEventListener === 'function') {
        displayModeMedia.removeEventListener('change', handleDisplayModeChange);
      } else {
        displayModeMedia.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt || isInstalling) return false;
    setIsInstalling(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsPwaInstalled(true);
        localStorage.setItem(PWA_INSTALLED_STORAGE_KEY, '1');
        setDeferredPrompt(null);
        _earlyDeferredPrompt = null;
        return true;
      }
      return false;
    } catch (err) {
      console.error('Install prompt error:', err);
      return false;
    } finally {
      setDeferredPrompt(null);
      _earlyDeferredPrompt = null;
      setIsInstalling(false);
    }
  }, [deferredPrompt, isInstalling]);

  const contextValue = useMemo(() => ({
    deferredPrompt,
    isIOS,
    isStandalone,
    isPwaInstalled,
    promptInstall,
    platform,
    isInstalling,
    // ✅ canInstall only true when browser gave us a real install event AND not installed
    canInstall: Boolean(deferredPrompt) && !isStandalone && !isPwaInstalled,
  }), [deferredPrompt, isIOS, isStandalone, isPwaInstalled, promptInstall, platform, isInstalling]);

  return (
    <InstallPromptContext.Provider value={contextValue}>
      {children}
    </InstallPromptContext.Provider>
  );
};
