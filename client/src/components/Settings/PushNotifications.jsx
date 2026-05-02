import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Download, Loader2, Send, ShieldAlert, Smartphone, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../utils/axios';
import {
  isIosDevice,
  isPushNotificationsSupported,
  isStandaloneMode,
  serializePushSubscription,
  urlBase64ToUint8Array
} from '../../utils/pushNotifications';

const statusConfig = {
  success: {
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2
  },
  warning: {
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: ShieldAlert
  },
  neutral: {
    className: 'bg-gray-50 text-gray-700 border-gray-200',
    icon: Smartphone
  }
};

const StatusBadge = ({ tone = 'neutral', label }) => {
  const config = statusConfig[tone] || statusConfig.neutral;
  const Icon = config.icon;

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
};

const PushNotificationsSettings = () => {
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [permission, setPermission] = useState(
    typeof window !== 'undefined' && window.Notification ? window.Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [lastError, setLastError] = useState('');

  const pushSupported = useMemo(() => isPushNotificationsSupported(), []);
  const iosDevice = useMemo(() => isIosDevice(), []);
  const standaloneMode = useMemo(() => isStandaloneMode(), []);
  const installRequired = iosDevice && !standaloneMode;

  const syncSubscriptionWithServer = useCallback(async (subscription) => {
    const serialized = serializePushSubscription(subscription);
    if (!serialized) {
      return;
    }

    await api.post('/api/push/subscribe', {
      subscription: serialized,
      permission: window.Notification.permission,
      deviceLabel: standaloneMode ? 'PWA device' : 'Browser device'
    });
  }, [standaloneMode]);

  const refreshState = useCallback(async () => {
    if (!pushSupported) {
      setLoading(false);
      setPermission('default');
      setIsSubscribed(false);
      setEndpoint('');
      return;
    }

    try {
      setLoading(true);
      setLastError('');
      setPermission(window.Notification.permission);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      setIsSubscribed(Boolean(subscription));
      setEndpoint(subscription?.endpoint || '');

      if (subscription && window.Notification.permission === 'granted') {
        await syncSubscriptionWithServer(subscription);
      }
    } catch (error) {
      console.error('Failed to refresh push notification state:', error);
      setLastError(error.message || 'Failed to inspect push notification state');
    } finally {
      setLoading(false);
    }
  }, [pushSupported, syncSubscriptionWithServer]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const enableNotifications = useCallback(async () => {
    if (!pushSupported) {
      toast.error('This browser does not support push notifications.');
      return;
    }

    if (installRequired) {
      toast.error('Install GoWhats on your home screen first to enable push on iPhone or iPad.');
      return;
    }

    try {
      setWorking(true);
      setLastError('');

      const requestedPermission = await window.Notification.requestPermission();
      setPermission(requestedPermission);

      if (requestedPermission !== 'granted') {
        toast.error('Notification permission was not granted.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      let subscription = existingSubscription;

      if (!subscription) {
        const response = await api.get('/api/push/public-key');
        const applicationServerKey = urlBase64ToUint8Array(response.data.publicKey);

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        });
      }

      await syncSubscriptionWithServer(subscription);

      setIsSubscribed(true);
      setEndpoint(subscription?.endpoint || '');
      toast.success('GoWhats push notifications are enabled.');
    } catch (error) {
      console.error('Failed to enable push notifications:', error);
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to enable push notifications';
      setLastError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }, [installRequired, pushSupported, syncSubscriptionWithServer]);

  const disableNotifications = useCallback(async () => {
    if (!pushSupported) {
      return;
    }

    try {
      setWorking(true);
      setLastError('');

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const currentEndpoint = subscription?.endpoint || endpoint;

      if (subscription) {
        await subscription.unsubscribe();
      }

      if (currentEndpoint) {
        await api.post('/api/push/unsubscribe', { endpoint: currentEndpoint });
      }

      setIsSubscribed(false);
      setEndpoint('');
      toast.success('GoWhats push notifications are disabled.');
    } catch (error) {
      console.error('Failed to disable push notifications:', error);
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to disable push notifications';
      setLastError(message);
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }, [endpoint, pushSupported]);

  const sendTestNotification = useCallback(async () => {
    try {
      setSendingTest(true);
      setLastError('');

      const response = await api.post('/api/push/test');
      const sentCount = Number(response.data?.result?.sent || 0);

      if (sentCount > 0) {
        toast.success('Test notification sent from GoWhats.');
      } else {
        toast.error('No subscribed device was available for a test notification.');
      }
    } catch (error) {
      console.error('Failed to send test push notification:', error);
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to send test notification';
      setLastError(message);
      toast.error(message);
    } finally {
      setSendingTest(false);
    }
  }, []);

  const permissionTone = permission === 'granted'
    ? 'success'
    : permission === 'denied'
      ? 'warning'
      : 'neutral';

  const subscriptionTone = isSubscribed ? 'success' : 'neutral';
  const installTone = installRequired ? 'warning' : 'success';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 lg:px-8 lg:py-6 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white flex items-center justify-center shadow-md">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg lg:text-xl font-bold text-gray-900">Push Notifications</h2>
            <p className="text-sm text-gray-600 mt-1">
              Enable branded GoWhats alerts for new incoming messages and send a test push to this device.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatusBadge
            tone={pushSupported ? 'success' : 'warning'}
            label={pushSupported ? 'Browser Supports Push' : 'Push Unsupported'}
          />
          <StatusBadge
            tone={installTone}
            label={installRequired ? 'Install Required on iPhone/iPad' : 'Install Status OK'}
          />
          <StatusBadge
            tone={permissionTone}
            label={`Permission: ${permission}`}
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <StatusBadge
                  tone={subscriptionTone}
                  label={isSubscribed ? 'Device Subscribed' : 'Device Not Subscribed'}
                />
              </div>
              <p className="text-sm text-gray-600">
                Notifications use your GoWhats name and app icon so alerts feel like part of the PWA, not a generic browser popup.
              </p>
              {endpoint && (
                <p className="text-xs text-gray-400 break-all">
                  Endpoint: {endpoint}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {isSubscribed ? (
                <button
                  type="button"
                  onClick={disableNotifications}
                  disabled={working}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Disable
                </button>
              ) : (
                <button
                  type="button"
                  onClick={enableNotifications}
                  disabled={working || !pushSupported}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-700 hover:to-green-700 disabled:opacity-60"
                >
                  {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Enable Push
                </button>
              )}

              <button
                type="button"
                onClick={sendTestNotification}
                disabled={sendingTest || !isSubscribed}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
              >
                {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Test
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 p-5 bg-white">
            <h3 className="text-sm font-bold text-gray-900 mb-2">How it works</h3>
            <p className="text-sm text-gray-600 leading-6">
              When a new customer message arrives in GoWhats, the server sends a branded push through your PWA service worker. Tapping the alert opens the matching chat.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 p-5 bg-white">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Best experience</h3>
            <p className="text-sm text-gray-600 leading-6">
              On Android and desktop browsers this works directly after permission. On iPhone and iPad, install the GoWhats app to the home screen first, then enable push.
            </p>
          </div>
        </div>

        {lastError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {lastError}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking your current notification status...
          </div>
        )}
      </div>
    </div>
  );
};

export default PushNotificationsSettings;

