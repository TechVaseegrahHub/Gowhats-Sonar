import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useInstallPrompt } from "../context/InstallPromptContext";

export default function InstallPrompt() {
  const { canInstall, isIOS, isStandalone, isPwaInstalled, promptInstall, isInstalling } = useInstallPrompt();
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosStepsModal, setShowIosStepsModal] = useState(false);

  useEffect(() => {
    // If already installed/standalone, force-hide banner.
    if (isStandalone || isPwaInstalled) {
      setShowInstallBanner(false);
      return;
    }

    if (isIOS) {
       const userAgent = window.navigator.userAgent.toLowerCase();
       const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
       setShowInstallBanner(isSafari);
    } else {
      // Show install UI only when browser provides a valid install event.
      setShowInstallBanner(canInstall);
    }
  }, [canInstall, isIOS, isStandalone, isPwaInstalled]);

  useEffect(() => {
    if (!showIosStepsModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showIosStepsModal]);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIosStepsModal(true);
      return;
    }

    if (!canInstall || isInstalling) return;

    const installed = await promptInstall();
    if (installed) {
      setShowInstallBanner(false);
    }
  };

  const handleCloseBanner = () => {
    setShowInstallBanner(false);
    setShowIosStepsModal(false);
  };


  return (
    <AnimatePresence>
      {showInstallBanner && !showIosStepsModal && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-3 left-3 right-3 z-[210] rounded-xl border border-white/20 bg-black/75 p-3 text-white shadow-lg backdrop-blur-lg md:bottom-4 md:left-auto md:right-4 md:w-[360px]"
        >
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <motion.div
                animate={{
                  scale: [1, 1.12, 1],
                  y: [0, -2, 0]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
                className="text-2xl"
              >
                📱
              </motion.div>
              <div className="max-w-[190px]">
                <h2 className="text-sm font-semibold">Install GoWhats</h2>
                <p className="text-xs opacity-80 leading-tight">
                  {isIOS
                    ? "Open iPhone Add to Home Screen steps."
                    : "Install app for faster access and notifications."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleInstallClick}
                disabled={!isIOS && (!canInstall || isInstalling)}
                className="rounded-lg bg-green-500/90 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-green-400 disabled:cursor-not-allowed disabled:bg-green-300"
              >
                {isInstalling ? "Opening..." : "Install"}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleCloseBanner}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm transition-colors hover:bg-white/20"
              >
                ✕
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {isIOS && showIosStepsModal && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-semibold">Install GoWhats</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Get quick access by installing it on your home screen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIosStepsModal(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm leading-6 text-gray-700">
              <p className="font-semibold">For iPhone/iPad:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Tap the <b>Share</b> button (square with arrow) in Safari.</li>
                <li>Scroll and tap <b>Add to Home Screen</b>.</li>
                <li>Tap <b>Add</b> in the top-right corner.</li>
                <li>The GoWhats app icon will appear on your home screen.</li>
              </ol>
              <div className="rounded-lg bg-gray-100 p-3 text-sm">
                <b>Benefits:</b> Faster access, offline capability, and app-like experience.
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowIosStepsModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Maybe Later
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIosStepsModal(false);
                  setShowInstallBanner(false);
                }}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Got It
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

