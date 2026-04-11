import React, { useState } from 'react';
import api from '../utils/axios';
import { Loader } from 'lucide-react';

const OrderStatusDropdown = ({ order, onStatusChange }) => {
  const [currentStatus, setCurrentStatus] = useState(order.status || 'pending');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMessage, setShowMessage] = useState('');

  // ✅ UPDATED: Only showing the requested 5 statuses
  const statusOptions = [
    { value: 'pending', label: 'PENDING', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    { value: 'printed', label: 'PRINTED', color: 'bg-purple-100 text-purple-800 border-purple-300' },
    { value: 'packed', label: 'PACKED', color: 'bg-blue-100 text-blue-800 border-blue-300' },
    { value: 'tracked', label: 'TRACKED', color: 'bg-green-100 text-green-800 border-green-300' },
    { value: 'on_hold', label: 'HOLD', color: 'bg-orange-100 text-orange-800 border-orange-300' }
  ];

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    if (newStatus === currentStatus) return;

    setIsUpdating(true);
    setShowMessage('');

    try {
      // Get Tenant ID
      const tenantId = localStorage.getItem('tenantId') || localStorage.getItem('tenant_id');

      // API Call
      const response = await api.patch(`/api/order-status/${order.orderId}`, {
        newStatus: newStatus,
        tenantId: tenantId
      });

      if (response.data.success) {
        setCurrentStatus(newStatus);
        setShowMessage('✅ Updated');
        if (onStatusChange) onStatusChange(order.orderId, newStatus);
        setTimeout(() => setShowMessage(''), 2000);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      setShowMessage('❌ Failed');
      setTimeout(() => setShowMessage(''), 3000);
    } finally {
      setIsUpdating(false);
    }
  };

  const getCurrentStatusColor = () => {
    const status = statusOptions.find(s => s.value === currentStatus);
    return status ? status.color : 'bg-gray-100 text-gray-800 border-gray-300';
  };

  return (
    <div className="relative inline-block">
      <select
        value={currentStatus}
        onChange={handleStatusChange}
        disabled={isUpdating}
        className={`
          px-3 py-1.5 rounded-lg font-bold text-[10px] sm:text-xs uppercase
          border-2
          focus:outline-none focus:ring-2 focus:ring-opacity-50
          cursor-pointer transition-all duration-200
          ${getCurrentStatusColor()}
          ${isUpdating ? 'opacity-50 cursor-wait' : 'hover:shadow-sm'}
        `}
      >
        {statusOptions.map(option => (
          <option key={option.value} value={option.value} className="bg-white text-gray-800">
            {option.label}
          </option>
        ))}
      </select>

      {isUpdating && (
        <div className="absolute -right-4 top-2">
          <Loader className="w-4 h-4 animate-spin text-gray-500" />
        </div>
      )}

      {showMessage && (
        <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-gray-800 text-white rounded shadow-lg text-[10px] whitespace-nowrap z-50">
          {showMessage}
        </div>
      )}
    </div>
  );
};

export default OrderStatusDropdown;
