// components/StatCard.jsx
import React from 'react';

const StatCard = ({ icon, label, value }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-2xl font-semibold mt-1">{value}</p>
      </div>
      <div className="text-green-600">{icon}</div>
    </div>
  </div>
);

export default StatCard;
