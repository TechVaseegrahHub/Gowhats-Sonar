import api, { dashboardApi } from '../utils/axios';

export const getDashboardStats = async (params = {}) => {
  try {
    console.log('🔄 Fetching dashboard stats with params:', params);
    
    let url = '/api/dashboard/stats';
    if (params && Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams();
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      if (params.filtered) queryParams.append('filtered', 'true');
      
      url += `?${queryParams.toString()}`;
    }
    
    console.log('📡 API URL:', url);
    const response = await dashboardApi.get(url);
    console.log('✅ Dashboard stats received:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    console.error('Error details:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('Authentication failed - user might need to login');
    }
    
    throw error;
  }
};

export const getRealtimeDashboardStats = async (params = {}) => {
  try {
    let url = '/api/dashboard/stats/realtime';
    if (params && Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams();
      if (params.startDate) queryParams.append('startDate', params.startDate);
      if (params.endDate) queryParams.append('endDate', params.endDate);
      if (params.filtered) queryParams.append('filtered', 'true');
      
      url += `?${queryParams.toString()}`;
    }
    
    const response = await dashboardApi.get(url);
    console.log('✅ Real-time stats received:', response.data);
    return response.data;
  } catch (error) {
    console.error('Real-time dashboard stats error:', error);
    throw error;
  }
};

export const getDashboardStatsWithPolling = (callback, interval = 30000, params = {}) => {
  const fetchStats = async () => {
    try {
      const stats = await getRealtimeDashboardStats(params);
      callback(stats);
    } catch (error) {
      console.error('Polling error:', error);
      try {
        const fallbackStats = await getDashboardStats(params);
        callback(fallbackStats);
      } catch (fallbackError) {
        console.error('Fallback stats also failed:', fallbackError);
      }
    }
  };

  fetchStats();
  const intervalId = setInterval(fetchStats, interval);
  return () => clearInterval(intervalId);
};