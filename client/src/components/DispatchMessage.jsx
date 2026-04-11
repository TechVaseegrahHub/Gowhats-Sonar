import React from 'react';
import { Package, Truck, MapPin, Clock, ExternalLink, CheckCircle, Box, Navigation } from 'lucide-react';

const DispatchMessage = ({ message }) => {
  const dispatchDetails = message.orderDetails || message.metadata || {};
  
  const {
    customerName = 'Customer',
    orderId = 'N/A',
    orderNumber = 'N/A',
    trackingNumber = 'Not available',
    trackingCompany = 'Standard Shipping',
    trackingUrl,
    products = 'Your order items',
    total = 'N/A',
    platform = 'shopify'
  } = dispatchDetails;

  const displayOrderNumber = orderNumber !== 'N/A' ? orderNumber : orderId;

  return (
    <div className="bg-gradient-to-br from-blue-50 via-cyan-50 to-teal-50 border border-blue-200 rounded-xl p-4 max-w-md shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-2.5 rounded-full">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-1">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>
          <div>
            <span className="font-bold text-blue-900 text-lg block">Order Shipped</span>
            <span className="text-xs text-blue-600">On the way</span>
          </div>
        </div>
        <span className="text-xs px-3 py-1.5 rounded-full font-semibold bg-green-100 text-green-700 border border-green-200">
          In Transit
        </span>
      </div>

      <div className="mb-4 bg-white bg-opacity-70 rounded-lg p-3">
        <div className="flex items-center mb-2">
          <span className="text-2xl mr-2">🎉</span>
          <span className="font-semibold text-gray-800">Hi {customerName}</span>
        </div>
        <p className="text-sm text-gray-700">
          Your order has been dispatched and is on its way to you.
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 space-y-3 mb-4 border border-blue-100">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Order</span>
          </div>
          <span className="text-sm font-bold text-blue-700">#{displayOrderNumber}</span>
        </div>

        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <Box className="w-4 h-4 text-cyan-600" />
            <span className="text-sm font-medium text-gray-700">Courier</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">{trackingCompany}</span>
        </div>

        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Tracking</span>
          </div>
          <span className="text-xs font-mono font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded">
            {trackingNumber}
          </span>
        </div>

        {total !== 'N/A' && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-sm font-bold text-green-700">{total}</span>
          </div>
        )}
      </div>

      {trackingUrl && (
        <button
          onClick={() => window.open(trackingUrl, '_blank')}
          className="flex items-center justify-center w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3 rounded-lg mb-3"
        >
          <Navigation className="w-4 h-4 mr-2" />
          <span className="font-semibold">Track Order</span>
          <ExternalLink className="w-3 h-3 ml-2" />
        </button>
      )}

      <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 mb-3">
        <div className="flex items-start space-x-3">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-900 mb-1">Delivery Timeline</p>
            <p className="text-xs text-gray-700">
              Arrives within 5-7 business days
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-blue-200">
        <p className="text-xs text-center text-gray-600">
          Please attend courier call for delivery
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center">
          <CheckCircle className="w-3 h-3 mr-1 text-green-500" />
          Delivered
        </span>
        <span>
          {new Date(message.timestamp).toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </span>
      </div>
    </div>
  );
};

export default DispatchMessage;
