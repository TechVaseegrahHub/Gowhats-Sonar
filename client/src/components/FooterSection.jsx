import React from 'react';

const FooterSection = ({ footer, onChange }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Footer <span className="text-gray-400">(optional)</span>
        </label>
        <span className="text-xs text-gray-500">
          ({footer.text?.length || 0} / 60)
        </span>
      </div>
      
      <p className="text-sm text-gray-500">
        Add a short line of text to the bottom of your message template.
      </p>
      
      <input
        type="text"
        value={footer.text || ''}
        onChange={(e) => onChange({ ...footer, text: e.target.value })}
        placeholder="Add footer text"
        maxLength={60}
        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-teal-600"
      />

      {/* ✅ Animated Footer using Tailwind classes */}
      <div className="relative overflow-hidden bg-gradient-to-r from-orange-100 via-white to-green-100 rounded-lg py-3 mt-4 shadow-sm">
        <div className="animate-slide-loop whitespace-nowrap inline-block">
          <span className="inline-flex items-center text-base font-medium space-x-2">
            <span>🧡🤍💚</span>
            <span className="text-gray-800">Freedom for business owners starts with automation</span>
            <span className="mx-4">🧡🤍💚</span>
            <span className="text-gray-800">Freedom for business owners starts with automation</span>
            <span className="mx-4">🧡🤍💚</span>
            <span className="text-gray-800">Freedom for business owners starts with automation</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default FooterSection;
