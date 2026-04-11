import React, { useState, useEffect } from 'react';
import { publicApi } from "../utils/axios.js";
import { LineChart, BarChart, Printer, Package, ShoppingCart, Megaphone, Wrench, Zap, TrendingUp, Activity, Users, DollarSign } from 'lucide-react';
import StatCard from '../components/StatCard';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

const Analytics = () => {
  const [analyticsData, setAnalyticsData] = useState({
    marketing: { totalSent: 0, totalAmount: 0 },
    utility: { totalSent: 0, totalAmount: 0 },
    services: { totalSent: 0, totalAmount: 0 },
    printed: { count: 0, value: 0 },
    packing: { count: 0, value: 0 },
    ordered: { count: 0, value: 0 },
    ultraPremium: { products: 0, revenue: 0 },
    budgetFriendly: { products: 0, revenue: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('month');
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, [timeFilter]);

  const fetchAnalyticsData = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await publicApi.get(`/api/analytics?period=${timeFilter}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      setAnalyticsData(response.data);
      generateChartData(response.data);
    } catch (error) {
      console.error("Failed to fetch analytics data:", error);
      // Set mock data for demonstration
      const mockData = generateMockData();
      setAnalyticsData(mockData);
      generateChartData(mockData);
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockData = () => {
    return {
      marketing: { totalSent: 2451, totalAmount: 45600 },
      utility: { totalSent: 1823, totalAmount: 32450 },
      services: { totalSent: 3124, totalAmount: 58700 },
      printed: { count: 1245, value: 22800 },
      packing: { count: 987, value: 18650 },
      ordered: { count: 1532, value: 29800 },
      ultraPremium: { products: 24, revenue: 189500 },
      budgetFriendly: { products: 78, revenue: 92750 }
    };
  };

  const generateChartData = (data) => {
    const categoryData = {
      labels: ['Marketing', 'Utility', 'Services'],
      datasets: [
        {
          label: 'Total Sent',
          data: [data.marketing.totalSent, data.utility.totalSent, data.services.totalSent],
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 2,
        },
        {
          label: 'Total Amount (thousands)',
          data: [
            data.marketing.totalAmount/1000, 
            data.utility.totalAmount/1000, 
            data.services.totalAmount/1000
          ],
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 2,
        }
      ]
    };

    const processData = {
      labels: ['Printed', 'Packing', 'Ordered'],
      datasets: [
        {
          label: 'Count',
          data: [data.printed.count, data.packing.count, data.ordered.count],
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderColor: 'rgb(34, 197, 94)',
          borderWidth: 2,
        },
        {
          label: 'Value (thousands)',
          data: [
            data.printed.value/1000, 
            data.packing.value/1000, 
            data.ordered.value/1000
          ],
          backgroundColor: 'rgba(16, 185, 129, 0.6)',
          borderColor: 'rgb(16, 185, 129)',
          borderWidth: 2,
        }
      ]
    };

    setChartData({ categoryData, processData });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          font: {
            size: 12,
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 11,
          }
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: 11,
          }
        }
      }
    },
  };

  const totalRevenue = analyticsData.ultraPremium.revenue + analyticsData.budgetFriendly.revenue;
  const totalProducts = analyticsData.ultraPremium.products + analyticsData.budgetFriendly.products;
  const totalTransactions = analyticsData.marketing.totalSent + analyticsData.utility.totalSent + analyticsData.services.totalSent;
  const totalAmount = analyticsData.marketing.totalAmount + analyticsData.utility.totalAmount + analyticsData.services.totalAmount;

  const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-64">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-green-100 rounded-full animate-spin"></div>
        <div className="w-16 h-16 border-4 border-green-500 rounded-full animate-spin absolute top-0 left-0" 
             style={{ clipPath: 'polygon(0% 0%, 50% 0%, 50% 100%, 0% 100%)' }}></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      {/* Header Section */}
      <div className="bg-white shadow-sm border-b border-green-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <Activity className="h-8 w-8 text-green-600 mr-3" />
                Analytics Dashboard
              </h1>
              <p className="mt-1 text-sm sm:text-base text-gray-600">
                Real-time insights into your business performance
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="bg-white border border-green-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            {/* Key Metrics Overview */}
            <div className="mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <DollarSign className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(totalAmount)}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <TrendingUp className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Transactions</p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalTransactions.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Package className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Total Products</p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalProducts}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Users className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-500">Avg. Order Value</p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatCurrency(totalAmount / totalTransactions)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Template Usage Section */}
            <div className="mb-8">
              <div className="flex items-center mb-6">
                <div className="w-1 h-6 bg-green-500 rounded-full mr-3"></div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Template Usage Analytics</h2>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Megaphone className="h-5 w-5 text-orange-600" />
                      </div>
                      <h3 className="ml-3 font-semibold text-gray-900">Marketing</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Sent</span>
                      <span className="text-lg font-bold text-gray-900">{analyticsData.marketing.totalSent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Revenue</span>
                      <span className="text-lg font-bold text-green-600">{formatCurrency(analyticsData.marketing.totalAmount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-orange-500 h-2 rounded-full" style={{width: `${(analyticsData.marketing.totalSent / totalTransactions) * 100}%`}}></div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Zap className="h-5 w-5 text-blue-600" />
                      </div>
                      <h3 className="ml-3 font-semibold text-gray-900">Utility</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Sent</span>
                      <span className="text-lg font-bold text-gray-900">{analyticsData.utility.totalSent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Revenue</span>
                      <span className="text-lg font-bold text-green-600">{formatCurrency(analyticsData.utility.totalAmount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{width: `${(analyticsData.utility.totalSent / totalTransactions) * 100}%`}}></div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Wrench className="h-5 w-5 text-purple-600" />
                      </div>
                      <h3 className="ml-3 font-semibold text-gray-900">Services</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Total Sent</span>
                      <span className="text-lg font-bold text-gray-900">{analyticsData.services.totalSent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">Revenue</span>
                      <span className="text-lg font-bold text-green-600">{formatCurrency(analyticsData.services.totalAmount)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{width: `${(analyticsData.services.totalSent / totalTransactions) * 100}%`}}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Process Status Section */}
            <div className="mb-8">
              <div className="flex items-center mb-6">
                <div className="w-1 h-6 bg-green-500 rounded-full mr-3"></div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Order Processing Status</h2>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                        <Printer className="h-6 w-6 text-green-600" />
                      </div>
                      <div className="ml-3">
                        <h3 className="font-semibold text-gray-900">Printing</h3>
                        <p className="text-xs text-gray-500">Orders in queue</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 mb-2">{analyticsData.printed.count.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Remaining orders</p>
                    <div className="mt-3 flex items-center justify-center">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
                      <span className="text-xs text-green-600 font-medium">Active</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                        <Package className="h-6 w-6 text-pink-600" />
                      </div>
                      <div className="ml-3">
                        <h3 className="font-semibold text-gray-900">Packing</h3>
                        <p className="text-xs text-gray-500">Ready to pack</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 mb-2">{analyticsData.packing.count.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Remaining orders</p>
                    <div className="mt-3 flex items-center justify-center">
                      <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse mr-2"></div>
                      <span className="text-xs text-pink-600 font-medium">In Progress</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                        <ShoppingCart className="h-6 w-6 text-amber-600" />
                      </div>
                      <div className="ml-3">
                        <h3 className="font-semibold text-gray-900">Tracking</h3>
                        <p className="text-xs text-gray-500">In transit</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900 mb-2">{analyticsData.ordered.count.toLocaleString()}</p>
                    <p className="text-sm text-gray-500">Remaining orders</p>
                    <div className="mt-3 flex items-center justify-center">
                      <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse mr-2"></div>
                      <span className="text-xs text-amber-600 font-medium">Shipping</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Categories Section */}
            <div className="mb-8">
              <div className="flex items-center mb-6">
                <div className="w-1 h-6 bg-green-500 rounded-full mr-3"></div>
                <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Product Performance</h2>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-semibold text-gray-900">Ultra Premium</h3>
                        <p className="text-sm text-gray-500">High-value products</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        Premium
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">24</p>
                      <p className="text-sm text-gray-500 mt-1">Products</p>
                      <div className="w-full bg-indigo-100 rounded-full h-2 mt-2">
                        <div className="bg-indigo-600 h-2 rounded-full w-3/4"></div>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xl sm:text-2xl font-bold text-green-600">₹189,500</p>
                      <p className="text-sm text-gray-500 mt-1">Revenue</p>
                      <p className="text-xs text-gray-400 mt-1">₹7,896 avg</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl shadow-sm border border-green-100 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-semibold text-gray-900">Budget Friendly</h3>
                        <p className="text-sm text-gray-500">Affordable options</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        Value
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center">
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900">78</p>
                      <p className="text-sm text-gray-500 mt-1">Products</p>
                      <div className="w-full bg-emerald-100 rounded-full h-2 mt-2">
                        <div className="bg-emerald-600 h-2 rounded-full w-full"></div>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-xl sm:text-2xl font-bold text-green-600">₹92,750</p>
                      <p className="text-sm text-gray-500 mt-1">Revenue</p>
                      <p className="text-xs text-gray-400 mt-1">₹1,189 avg</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            {/* {chartData && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 sm:gap-8">
                <div className="bg-white rounded-xl shadow-sm border border-green-100 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <LineChart className="h-5 w-5 text-green-600 mr-2" />
                      Processing Analytics
                    </h3>
                  </div>
                  <div className="h-64 sm:h-80">
                    <Bar data={chartData.processData} options={chartOptions} />
                  </div>
                </div>
              </div>
            )} */}
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;
