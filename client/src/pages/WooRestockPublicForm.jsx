import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, MessageCircle, PackageOpen, Send } from 'lucide-react';
import { publicApi } from '../utils/axios';

function WooRestockPublicForm() {
  const { integrationId } = useParams();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const productId = searchParams.get('productId') || '';
  const variationId = searchParams.get('variationId') || '';
  const productTitle = searchParams.get('productTitle') || 'Out of stock product';
  const variationTitle = searchParams.get('variationTitle') || '';
  const productUrl = searchParams.get('productUrl') || '';
  const productImageUrl = searchParams.get('productImageUrl') || '';
  const siteUrl = searchParams.get('siteUrl') || '';

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      try {
        const response = await publicApi.get(`/api/woocommerce-restock/public/${integrationId}/config`);
        if (!active) return;
        setConfig(response.data || null);
      } catch (error) {
        if (!active) return;
        setFeedback({
          type: 'error',
          message: error.response?.data?.error || 'Unable to load the restock form right now.'
        });
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadConfig();

    return () => {
      active = false;
    };
  }, [integrationId]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!phoneNumber.trim()) {
      setFeedback({
        type: 'error',
        message: config?.phonePlaceholder || 'Enter your WhatsApp number'
      });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: '', message: '' });

    try {
      const response = await publicApi.post(`/api/woocommerce-restock/public/${integrationId}/subscribe`, {
        phoneNumber: phoneNumber.trim(),
        customerName: customerName.trim(),
        productId,
        variationId,
        productTitle,
        variationTitle,
        productUrl,
        productImageUrl,
        siteUrl,
        pluginVersion: 'gowhats-hosted-page'
      });

      const alreadySubscribed = Boolean(response.data?.alreadySubscribed);
      setFeedback({
        type: alreadySubscribed ? 'info' : 'success',
        message: response.data?.message || (alreadySubscribed
          ? 'This number is already waiting for a restock alert.'
          : 'Stock request saved successfully.')
      });

      if (!alreadySubscribed) {
        setPhoneNumber('');
        setCustomerName('');
      }
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.response?.data?.error || 'Unable to submit the stock request right now.'
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(22,163,74,0.12),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#ffffff_48%,#f0fdf4_100%)] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <a
            href={productUrl || siteUrl || '/'}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </a>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            <MessageCircle className="h-3.5 w-3.5" />
            Restock Alert
          </div>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-lime-500 px-5 py-6 text-white">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/20">
              <PackageOpen className="h-7 w-7" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-100">
              {config?.brandName || 'GoWhats'}
            </p>
            <h1 className="mt-2 text-2xl font-semibold leading-tight">
              Get WhatsApp alert when this product is back
            </h1>
            <p className="mt-2 text-sm leading-6 text-emerald-50">
              Automatic restock sending stays the same. This page only collects the customer number cleanly on mobile.
            </p>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                  {productImageUrl ? (
                    <img src={productImageUrl} alt={productTitle} className="h-full w-full object-cover" />
                  ) : (
                    <PackageOpen className="h-8 w-8 text-slate-300" />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected product</p>
                  <h2 className="mt-2 text-base font-semibold text-slate-900">{productTitle}</h2>
                  {variationTitle && (
                    <p className="mt-1 text-sm text-slate-600">{variationTitle}</p>
                  )}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 px-4 py-10 text-slate-600">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading form...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">WhatsApp number</label>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    placeholder={config?.phonePlaceholder || 'Enter your WhatsApp number'}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-800">Name (optional)</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Customer name"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-base text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>

                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
                  {config?.helperText || 'Get notified on WhatsApp when the product comes back in stock.'}
                </div>

                {feedback.message && (
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm font-medium ${
                      feedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800'
                        : feedback.type === 'info'
                          ? 'bg-blue-50 text-blue-800'
                          : 'bg-rose-50 text-rose-800'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {feedback.type === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                      <span>{feedback.message}</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || submitting || !config?.enabled}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-200 transition hover:from-emerald-700 hover:to-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  {submitting ? 'Submitting...' : (config?.ctaLabel || 'Request stock')}
                </button>

                {!config?.enabled && (
                  <p className="text-center text-sm text-rose-600">
                    Restock alerts are currently disabled for this store.
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {productUrl && (
          <div className="mt-4 text-center text-sm text-slate-500">
            Prefer the product page?
            {' '}
            <a href={productUrl} className="font-semibold text-emerald-700 underline underline-offset-2">
              Go back to product
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default WooRestockPublicForm;

