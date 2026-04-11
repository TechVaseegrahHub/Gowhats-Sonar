import React from 'react';
import {
  Lock,
  CheckCircle2,
  ArrowUpRight,
  Crown
} from 'lucide-react';
import UpgradeToProButton from './UpgradeToProButton';

function ProFeatureLockCard({
  featureName = 'This feature',
  description = 'This module is available only on Pro plan.',
  className = ''
}) {
  const highlights = [
    'Unlimited website order confirmations',
    'Access to all fulfillment modules',
    'Broadcast campaigns and advanced workflows'
  ];

  return (
    <div className={`w-full max-w-3xl rounded-2xl border border-[#22c55e]/25 bg-white shadow-sm ${className}`}>
      <div className="p-6 md:p-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[#15803d] text-xs font-bold uppercase tracking-wide mb-5">
          <Crown className="w-3.5 h-3.5 text-[#22c55e]" />
          Pro Plan Required
        </div>

        <div className="flex items-start gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-[#22c55e]/10 text-[#22c55e] flex items-center justify-center">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#15803d] mb-1">Feature Locked</p>
            <h2 className="text-2xl md:text-3xl leading-tight font-bold text-slate-900">{featureName}</h2>
          </div>
        </div>

        <p className="text-slate-600 text-base mb-6">{description}</p>

        <div className="rounded-xl border border-slate-200 p-4 mb-6 bg-white">
          <p className="text-sm font-semibold text-slate-900 mb-3">What you unlock with Pro</p>
          <div className="space-y-2">
            {highlights.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-slate-500">
            Upgrade now and activate instantly.
          </p>
          <UpgradeToProButton
            label="Upgrade to Pro"
            icon={<ArrowUpRight className="w-4 h-4" />}
            className="px-5 py-2.5 rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}

export default ProFeatureLockCard;
