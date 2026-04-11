import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { publicApi } from "../utils/axios.js";

const UserTable = () => {
  // Existing states
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // New states for WhatsApp configurations and clipboard
  const [whatsappConfigs, setWhatsappConfigs] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const { user } = useAuth();
  
  // Fetch all user data and WhatsApp configurations
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        if (!token) {
          throw new Error('No authentication token found');
        }
        
        // Fetch users
        try {
          const response = await publicApi.get('/api/auth/users', {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const allUsers = response.data.map(userData => ({
            id: userData._id || userData.id,
            username: userData.name,
            tenantId: userData.tenant_id,
            email: userData.email,
            password: userData.password || '',
            companyName: userData.company_name,
            phoneNumber: userData.phone_number,
          }));
          
          setUsers(allUsers);
          
          // Extract unique tenant IDs
          const uniqueTenantIds = [...new Set(allUsers.map(user => user.tenantId))].filter(Boolean);
          
          // Fetch WhatsApp configuration for each tenant
          const configs = {};
          
          for (const tenantId of uniqueTenantIds) {
            try {
              const statusResponse = await publicApi.get(`/api/whatsapp/status/${tenantId}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              
              const isConnected = statusResponse.data.connected;
              const config = statusResponse.data.config || {};
              
              configs[tenantId] = {
                connected: isConnected,
                businessAccountId: config.businessAccountId || 'Not configured',
                phoneNumberId: config.phoneNumberId || 'Not configured',
                accessToken: config.accessToken || 'Not configured',
              };
            } catch (error) {
              console.log(`Error fetching WhatsApp config for tenant ${tenantId}:`, error);
              configs[tenantId] = {
                connected: false,
                businessAccountId: 'Error fetching',
                phoneNumberId: 'Error fetching',
                accessToken: 'Error fetching',
              };
            }
          }
          
          setWhatsappConfigs(configs);
          setLoading(false);
          
        } catch (allUsersError) {
          console.log("Couldn't fetch all users, falling back to single user:", allUsersError);
          
          // Fallback: Get current user profile only
          const response = await publicApi.get('/api/auth/user/profile', {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const userData = response.data;
          setUsers([{
            id: userData._id || '1',
            username: userData.name,
            tenantId: userData.tenant_id,
            email: userData.email,
            password: userData.password || '',
            companyName: userData.company_name,
            phoneNumber: userData.phone_number,
          }]);
          
          // Try to get WhatsApp configuration for the current tenant
          if (userData.tenant_id) {
            try {
              const statusResponse = await publicApi.get(`/api/whatsapp/status/${userData.tenant_id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              
              const isConnected = statusResponse.data.connected;
              const config = statusResponse.data.config || {};
              
              setWhatsappConfigs({
                [userData.tenant_id]: {
                  connected: isConnected,
                  businessAccountId: config.businessAccountId || 'Not configured',
                  phoneNumberId: config.phoneNumberId || 'Not configured',
                  accessToken: config.accessToken || 'Not configured',
                }
              });
            } catch (error) {
              console.log(`Error fetching WhatsApp config for tenant ${userData.tenant_id}:`, error);
              setWhatsappConfigs({
                [userData.tenant_id]: {
                  connected: false,
                  businessAccountId: 'Error fetching',
                  phoneNumberId: 'Error fetching',
                  accessToken: 'Error fetching',
                }
              });
            }
          }
          
          setLoading(false);
        }
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to fetch data');
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  // Handle search input change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  // Copy tenant ID to clipboard
  const copyToClipboard = (id) => {
    navigator.clipboard.writeText(id)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };
  
  // Copy access token to clipboard
  const copyTokenToClipboard = (tenantId, token) => {
    navigator.clipboard.writeText(token)
      .then(() => {
        setCopiedToken(tenantId);
        setTimeout(() => setCopiedToken(null), 2000);
      })
      .catch(err => {
        console.error('Failed to copy token: ', err);
      });
  };
  
  // Filter users based on search term
  const filteredUsers = users.filter(user => 
    (user.username?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.companyName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (user.tenantId?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
  
  if (error) return (
    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative my-4" role="alert">
      <strong className="font-bold">Error:</strong>
      <span className="block sm:inline"> {error}</span>
    </div>
  );

  return (
    <div className="container mx-auto p-4">
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">User Management</h1>
        
        {/* Welcome section */}
        <div className="mb-6 bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
          <p className="text-lg text-gray-800">
            Welcome back, <span className="font-semibold">{user?.name}</span>!
          </p>
          <p className="text-gray-600">
            Here's a list of all users in the system.
          </p>
        </div>
        
        {/* Search and Stats Row */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          {/* Search Bar */}
          <div className="relative flex-grow max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"></path>
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by username, email, company, or tenant ID..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          
          {/* User Count */}
          <div className="bg-gray-100 px-4 py-2 rounded-lg">
            <p className="text-sm text-gray-600">
              Showing <span className="font-semibold">{filteredUsers.length}</span> of <span className="font-semibold">{users.length}</span> users
            </p>
          </div>
        </div>
        
        {/* User Table */}
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Password</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WhatsApp Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business Account ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number ID</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Access Token</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.length > 0 ? (
                filteredUsers.map(userData => (
                  <tr key={userData.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{userData.username || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="text-sm text-gray-900">{userData.tenantId || 'N/A'}</div>
                        {userData.tenantId && (
                          <button 
                            onClick={() => copyToClipboard(userData.tenantId)}
                            className="text-blue-500 hover:text-blue-700 focus:outline-none"
                            title="Copy to clipboard"
                          >
                            {copiedId === userData.tenantId ? (
                              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.email || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.password || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.companyName || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.phoneNumber || 'N/A'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {whatsappConfigs[userData.tenantId]?.connected ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                          Not Connected
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.tenantId && whatsappConfigs[userData.tenantId]?.businessAccountId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{userData.tenantId && whatsappConfigs[userData.tenantId]?.phoneNumberId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {userData.tenantId && whatsappConfigs[userData.tenantId]?.accessToken}
                        </div>
                        {userData.tenantId && whatsappConfigs[userData.tenantId]?.accessToken && 
                         whatsappConfigs[userData.tenantId]?.accessToken !== 'Not configured' && 
                         whatsappConfigs[userData.tenantId]?.accessToken !== 'Error fetching' && (
                          <button 
                            onClick={() => copyTokenToClipboard(
                              userData.tenantId, 
                              whatsappConfigs[userData.tenantId]?.accessToken
                            )}
                            className="text-blue-500 hover:text-blue-700 focus:outline-none"
                            title="Copy access token to clipboard"
                          >
                            {copiedToken === userData.tenantId ? (
                              <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="10" className="px-6 py-10 text-center text-sm font-medium text-gray-500">
                    No users found matching your search criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserTable;
