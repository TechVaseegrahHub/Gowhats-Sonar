// components/AbandonedCartMessage.jsx
import React from 'react';
import { ShoppingCart, Clock, Phone, ExternalLink } from 'lucide-react';

const AbandonedCartMessage = ({ message }) => {
  const { cartDetails, customerName } = message;

  if (!cartDetails) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-2">
        <div className="flex items-center space-x-2">
          <ShoppingCart className="text-orange-600" size={20} />
          <span className="text-orange-800 font-medium">Cart Reminder Sent</span>
        </div>
        <p className="text-sm text-orange-700 mt-1">{message.text}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-2 max-w-md overflow-hidden">
      {/* Header - Business Name */}
      <div className="bg-green-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
            <ShoppingCart className="text-white" size={20} />
          </div>
          <div>
            <div className="font-semibold text-gray-800">SR Food Products</div>
            <div className="text-xs text-gray-500">From SR Food Products</div>
          </div>
        </div>
      </div>

      {/* Message Body - Matching Template */}
      <div className="p-4 space-y-3">
        {/* Greeting with customer name */}
        <div className="text-gray-800">
          <span className="font-medium">Hi {customerName || 'Customer'}</span>, அன்பு வணக்கம்!
        </div>

        {/* From line */}
        <div className="text-sm text-gray-700">
          From SR Food Products
        </div>

        {/* Main message */}
        <div className="text-sm text-gray-800 bg-orange-50 border-l-4 border-orange-400 p-3 rounded">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={16} className="text-orange-600" />
            <span className="font-medium text-orange-800">We noticed you haven't completed your order yet. 🛒</span>
          </div>
        </div>

        {/* Click instruction with emoji */}
        <div className="text-sm text-gray-800 flex items-start gap-2">
          <span>👉</span>
          <span>Click the button below to finish your purchase</span>
        </div>

        {/* Support info */}
        <div className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Phone size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <span>If you have any questions, feel free to call us at </span>
              <span className="font-semibold text-blue-800">8925350444</span>
              <span>. We're happy to help! 😊</span>
            </div>
          </div>
        </div>

        {/* Closing */}
        <div className="text-sm text-gray-700 pt-2">
          <div>Warm regards,</div>
          <div className="font-medium text-gray-800">SR Food Products</div>
        </div>

        {/* Complete Purchase Button - Matching Template */}
        {cartDetails.checkoutUrl && (
          <a
            href={cartDetails.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full"
          >
            <button className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 shadow-sm">
              <ExternalLink size={18} />
              Complete Purchase
            </button>
          </a>
        )}

        {/* Cart Summary (Optional - for display) */}
        {cartDetails.items && cartDetails.items.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">
                {cartDetails.items.length} {cartDetails.items.length === 1 ? 'item' : 'items'} in cart
              </span>
              <span className="font-semibold text-gray-800">
                {cartDetails.currency} {cartDetails.total}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Powered by and Status */}
      <div className="bg-gray-50 px-4 py-2 border-t border-gray-200 flex items-center justify-between">
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Clock size={12} />
          <span>
            {new Date(message.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            message.status === 'sent' ? 'bg-yellow-100 text-yellow-700' :
            message.status === 'delivered' ? 'bg-blue-100 text-blue-700' :
            message.status === 'read' ? 'bg-green-100 text-green-700' :
            message.status === 'failed' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {message.status}
          </span>
          <span className="text-xs text-gray-400">
            Powered by GoWhats!
          </span>
        </div>
      </div>
    </div>
  );
};

export default AbandonedCartMessage;
