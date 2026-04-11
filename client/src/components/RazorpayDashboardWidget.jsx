import React, { useState, useEffect } from 'react';
import axios from '../utils/axios';
import { useNavigate } from 'react-router-dom';
import { 
  DollarSign, 
  CreditCard, 
  CheckCircle, 
  XCircle,
  TrendingUp,
  Clock,
  Settings,
  ArrowUpRight
} from 'lucide-react';

const RazorpayDashboardWidget = ({ tenantId }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const navigate = useNavigate();

  const fetchStats = async () => {
    try {
      const [statusRes, statsRes] = await Promise.all([
        axios.get('/api/razorpay/status'),
        axios.get('/api/razorpay/stats')
      ]);
      
      setConnected(statusRes.data?.connected || false);
      setStats(statsRes.data || {});
    } catch (error) {
      console.error('Error fetching Razorpay stats:', error);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Only refresh if connected
    if (connected) {
      const interval = setInterval(fetchStats, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [connected]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm h-full">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
          <p className="mt-3 text-gray-500 text-sm">Loading payment data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 rounded-lg">
              <CreditCard className="h-5 w-5 text-green-600" />
            </div>
            <span className="font-semibold text-gray-800">Payment Status</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {connected ? 'Active' : 'Inactive'}
            </span>
            <button 
              onClick={() => navigate('/admin/razorpay')}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1"
            >
              {connected ? 'Manage' : 'Setup'}
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {connected ? (
          <div className="space-y-4">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Today</p>
                    <p className="text-lg font-bold text-green-700">₹{stats?.todayRevenue || 0}</p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </div>
              </div>
              
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-600">Pending</p>
                    <p className="text-lg font-bold text-blue-700">{stats?.pendingPayments || 0}</p>
                  </div>
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Success Rate */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Success Rate</span>
                <span className="font-semibold text-gray-800">{stats?.successRate || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full" 
                  style={{ width: `${stats?.successRate || 0}%` }}
                ></div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-2">Recent Activity</p>
              <div className="space-y-2">
                {stats?.recentPayments?.length > 0 ? (
                  stats.recentPayments.slice(0, 3).map((payment, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {payment.status === 'captured' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="truncate max-w-[120px] text-gray-700">
                          {payment.notes?.customer_name || 'Customer'}
                        </span>
                      </div>
                      <span className="font-semibold text-gray-900">
                        ₹{(payment.amount / 100).toFixed(0)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400 text-sm text-center">No recent payments</p>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-3">
              <button 
                onClick={() => navigate('/admin/razorpay?action=create_link')}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-2 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all"
              >
                <DollarSign className="h-4 w-4" />
                Create Payment Link
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="inline-block p-4 bg-gray-100 rounded-full mb-3">
              <CreditCard className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-gray-700 font-medium mb-2">Connect Razorpay</h3>
            <p className="text-gray-500 text-sm mb-4">Enable payments in WhatsApp</p>
            <button 
              onClick={() => navigate('/admin/razorpay')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-2 px-4 rounded-lg font-medium text-sm transition-all"
            >
              Setup Now
            </button>
            
            <div className="mt-4 text-xs text-gray-400 space-y-1">
              <p>✓ Accept payments via WhatsApp</p>
              <p>✓ Track transactions in real-time</p>
              <p>✓ Get detailed analytics</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RazorpayDashboardWidget;
