import { useState, useEffect, useCallback } from 'react';
import { publicApi } from '../utils/axios';

export const useRealtimeData = () => {
  const [data, setData] = useState({
    orders: null,
    broadcasts: null,
    inventory: null,
    integrations: null,
    dashboard: null,
    loading: false,
    error: null,
    lastUpdated: null
  });

  const fetchAllData = useCallback(async () => {
    setData(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      // Fetch all module data in parallel
      const [
        ordersRes,
        broadcastsRes,
        inventoryRes,
        integrationsRes,
        dashboardRes
      ] = await Promise.allSettled([
        publicApi.get('/api/orders/realtime-stats', { headers }),
        publicApi.get('/api/broadcasts/realtime-stats', { headers }),
        publicApi.get('/api/inventory/realtime-stats', { headers }),
        publicApi.get('/api/integrations/realtime-stats', { headers }),
        publicApi.get('/api/dashboard/realtime-stats', { headers })
      ]);

      setData({
        orders: ordersRes.status === 'fulfilled' ? ordersRes.value.data : null,
        broadcasts: broadcastsRes.status === 'fulfilled' ? broadcastsRes.value.data : null,
        inventory: inventoryRes.status === 'fulfilled' ? inventoryRes.value.data : null,
        integrations: integrationsRes.status === 'fulfilled' ? integrationsRes.value.data : null,
        dashboard: dashboardRes.status === 'fulfilled' ? dashboardRes.value.data : null,
        loading: false,
        error: null,
        lastUpdated: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error fetching realtime data:', error);
      setData(prev => ({
        ...prev,
        loading: false,
        error: error.message || 'Failed to fetch data'
      }));
    }
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, [fetchAllData]);

  return {
    ...data,
    refreshData: fetchAllData
  };
};

