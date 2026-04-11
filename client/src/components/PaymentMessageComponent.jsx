// src/components/PaymentMessageComponent.jsx

import React from 'react';
import { Wallet, CreditCard } from 'lucide-react';

// Assuming you have a MessageFooter component for timestamps, if not, you can simplify it.
const MessageFooter = ({ timestamp, status, isSent }) => {
  const time = new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  
  const getStatusIcon = () => {
    if (!isSent) return null;
    if (status === 'read') return '✓✓'; // Blue ticks
    if (status === 'delivered') return '✓✓'; // Grey ticks
    if (status === 'sent') return '✓'; // Single tick
    return '...'; // Sending
  };

  return (
    <div className="flex items-center justify-end text-xs text-gray-400 mt-2">
      <span>{time}</span>
      <span className={`ml-1 ${status === 'read' ? 'text-blue-500' : ''}`}>{getStatusIcon()}</span>
    </div>
  );
};

const PaymentMessageComponent = ({ message }) => {
  const orderData = message.orderData || {};
  const totalAmount = parseFloat(orderData.total || '0').toFixed(2);
  const currency = orderData.currency || 'INR';
  const orderId = orderData.orderId || 'N/A';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 max-w-xs w-full shadow-sm text-left">
      <div className="flex items-center mb-3">
        <div className="bg-yellow-100 p-2 rounded-full mr-3">
          <Wallet className="h-5 w-5 text-yellow-600" />
        </div>
        <div className="font-semibold text-gray-800">Complete Your Payment</div>
        <div className="ml-auto text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded">BOT</div>
      </div>

      <div className="text-sm text-gray-600 mb-4 pl-1">
        <p>Please review your order details and complete the payment.</p>
        <div className="mt-2 space-y-1 text-xs">
          <p><span className="font-medium">Order:</span> #{orderId}</p>
          <p><span className="font-medium">Total:</span> {currency} {totalAmount}</p>
          <p className="text-gray-500">Includes shipping charges</p>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-md p-3 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors">
        <div className="flex items-center gap-3 text-gray-700">
          <CreditCard className="h-5 w-5 text-green-600" />
          <span className="text-sm font-medium">Review and Pay</span>
        </div>
      </div>
      
      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={true}
      />
    </div>
  );
};

export default PaymentMessageComponent;
