import React from 'react';
import { useNavigate } from 'react-router-dom';

const WhatsAppConnected = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg text-center">
        <h2 className="text-2xl font-bold mb-6">WhatsApp Already Connected</h2>
        <p className="mb-4 text-green-600">Your WhatsApp Business account is already configured.</p>
        <button 
          onClick={() => navigate('/admin/chats')}
          className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700"
        >
          Go to Chats
        </button>
      </div>
    </div>
  );
};

export default WhatsAppConnected;