// services/dashboardService.js 
const Contact = require('../models/Contact');
const Message = require('../models/Message');
const Template = require('../models/Template');
const Broadcast = require('../models/Broadcast');

class DashboardService {
  async getDashboardStats(tenantId, dateFilter = {}) {
    try {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      console.log(`Fetching dashboard stats for tenant: ${tenantId}`, dateFilter);

      const baseContactQuery = { tenantId: tenantId };
      const baseMessageQuery = { tenantId: tenantId };

      
      if (dateFilter.startDate && dateFilter.endDate) {
        const startDate = new Date(dateFilter.startDate);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999); 

        baseContactQuery.createdAt = {
          $gte: startDate,
          $lte: endDate
        };

        baseMessageQuery.timestamp = {
          $gte: startDate,
          $lte: endDate
        };
      }

      const [
        unreadChats,
        templatesSent,
        newContacts,
        totalContacts,
        deliveredMessages,
        failedMessages,
        readMessages,
        totalMessages
      ] = await Promise.all([
        Contact.countDocuments({
          ...baseContactQuery,
          unreadCount: { $gt: 0 }
        }),

        Message.countDocuments({
          ...baseMessageQuery,
          type: 'template',
          status: { $in: ['sent', 'delivered', 'read'] }
        }),

        this.getNewContactsCount(tenantId, dateFilter),

        Contact.countDocuments({ tenantId: tenantId }),

        Message.countDocuments({
          ...baseMessageQuery,
          status: 'delivered'
        }),

        Message.countDocuments({
          ...baseMessageQuery,
          status: 'failed'
        }),

        Message.countDocuments({
          ...baseMessageQuery,
          status: 'read'
        }),

        Message.countDocuments(baseMessageQuery)
      ]);

      const result = {
        unreadChats: unreadChats || 0,
        templatesSent: templatesSent || 0,
        newContacts: newContacts || 0,
        totalContacts: totalContacts || 0,
        deliveredMessages: deliveredMessages || 0,
        failedMessages: failedMessages || 0,
        readMessages: readMessages || 0,
        totalMessages: totalMessages || 0,
        tenantId,
        dateFilter: dateFilter.startDate ? {
          startDate: dateFilter.startDate,
          endDate: dateFilter.endDate
        } : null,
        timestamp: new Date().toISOString()
      };

      console.log(`Dashboard stats for tenant ${tenantId}:`, result);
      return result;

    } catch (error) {
      console.error('Dashboard service error:', {
        message: error.message,
        stack: error.stack,
        tenantId,
        dateFilter
      });
      throw error;
    }
  }

  async getNewContactsCount(tenantId, dateFilter) {
    try {
      let newContactsQuery;
      
      if (dateFilter.startDate && dateFilter.endDate) {
        // If date filter is applied, count contacts in that range
        const startDate = new Date(dateFilter.startDate);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);

        newContactsQuery = {
          tenantId: tenantId,
          createdAt: {
            $gte: startDate,
            $lte: endDate
          }
        };
      } else {
        // If no date filter, count today's contacts only
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        newContactsQuery = {
          tenantId: tenantId,
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        };
      }

      return await Contact.countDocuments(newContactsQuery);
    } catch (error) {
      console.error('Error counting new contacts:', error);
      return 0;
    }
  }

  async getDetailedStats(tenantId, dateFilter = {}) {
    try {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      // Build base query
      const baseContactQuery = { tenantId: tenantId };
      const baseMessageQuery = { tenantId: tenantId };

      // Use provided date filter or default to last 30 days for trends
      let timeFilter;
      if (dateFilter.startDate && dateFilter.endDate) {
        const startDate = new Date(dateFilter.startDate);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);

        timeFilter = {
          $gte: startDate,
          $lte: endDate
        };
      } else {
        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        timeFilter = { $gte: last30Days };
      }

      // Enhanced parallel queries for detailed analytics
      const [
        messageStatusBreakdown,
        contactGrowthTrend,
        templateUsageStats,
        broadcastStats,
        hourlyMessageTrends,
        topPerformingTemplates
      ] = await Promise.all([
        // 1. Message status breakdown
        Message.aggregate([
          {
            $match: {
              tenantId: tenantId,
              timestamp: timeFilter
            }
          },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),

        // 2. Contact growth trend (last 6 months)
        Contact.aggregate([
          {
            $match: {
              tenantId: tenantId,
              createdAt: {
                $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) // 6 months
              }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$createdAt' },
                month: { $month: '$createdAt' }
              },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id.year': 1, '_id.month': 1 }
          },
          {
            $project: {
              _id: 0,
              month: {
                $concat: [
                  { $toString: '$_id.year' },
                  '-',
                  {
                    $cond: {
                      if: { $lt: ['$_id.month', 10] },
                      then: { $concat: ['0', { $toString: '$_id.month' }] },
                      else: { $toString: '$_id.month' }
                    }
                  }
                ]
              },
              count: 1
            }
          }
        ]),

        // 3. Template usage statistics
        Message.aggregate([
          {
            $match: {
              tenantId: tenantId,
              type: 'template',
              timestamp: timeFilter
            }
          },
          {
            $group: {
              _id: '$templateName',
              count: { $sum: 1 },
              successRate: {
                $avg: {
                  $cond: [
                    { $in: ['$status', ['delivered', 'read']] },
                    1,
                    0
                  ]
                }
              }
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 10
          }
        ]),

        // 4. Broadcast statistics
        this.getBroadcastStats(tenantId, timeFilter),

        // 5. Hourly message trends (last 24 hours)
        Message.aggregate([
          {
            $match: {
              tenantId: tenantId,
              timestamp: {
                $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24 hours
              }
            }
          },
          {
            $group: {
              _id: { $hour: '$timestamp' },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id': 1 }
          }
        ]),

        // 6. Top performing templates by read rate
        Message.aggregate([
          {
            $match: {
              tenantId: tenantId,
              type: 'template',
              timestamp: timeFilter
            }
          },
          {
            $group: {
              _id: '$templateName',
              totalSent: { $sum: 1 },
              readCount: {
                $sum: {
                  $cond: [{ $eq: ['$status', 'read'] }, 1, 0]
                }
              },
              deliveredCount: {
                $sum: {
                  $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
                }
              }
            }
          },
          {
            $project: {
              templateName: '$_id',
              totalSent: 1,
              readCount: 1,
              deliveredCount: 1,
              readRate: {
                $cond: [
                  { $gt: ['$totalSent', 0] },
                  { $multiply: [{ $divide: ['$readCount', '$totalSent'] }, 100] },
                  0
                ]
              },
              deliveryRate: {
                $cond: [
                  { $gt: ['$totalSent', 0] },
                  { $multiply: [{ $divide: ['$deliveredCount', '$totalSent'] }, 100] },
                  0
                ]
              }
            }
          },
          {
            $sort: { readRate: -1 }
          },
          {
            $limit: 5
          }
        ])
      ]);

      return {
        messageStatusBreakdown: messageStatusBreakdown || [],
        contactGrowthTrend: contactGrowthTrend || [],
        templateUsageStats: templateUsageStats || [],
        broadcastStats: broadcastStats || {},
        hourlyMessageTrends: hourlyMessageTrends || [],
        topPerformingTemplates: topPerformingTemplates || [],
        tenantId,
        generatedAt: new Date().toISOString(),
        dateFilter: dateFilter.startDate ? dateFilter : null
      };

    } catch (error) {
      console.error('Detailed dashboard stats error:', {
        message: error.message,
        stack: error.stack,
        tenantId,
        dateFilter
      });
      throw error;
    }
  }

  async getBroadcastStats(tenantId, timeFilter) {
    try {
      // Check if Broadcast model exists
      if (!Broadcast) {
        return {
          totalBroadcasts: 0,
          completedBroadcasts: 0,
          activeBroadcasts: 0,
          totalRecipients: 0
        };
      }
 
      const broadcastStats = await Broadcast.aggregate([
        {
          $match: {
            tenantId: tenantId,
            createdAt: timeFilter
          }
        },
        {
          $group: {
            _id: null,
            totalBroadcasts: { $sum: 1 },
            completedBroadcasts: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
              }
            },
            activeBroadcasts: {
              $sum: {
                $cond: [{ $in: ['$status', ['pending', 'sending']] }, 1, 0]
              }
            },
            totalRecipients: {
              $sum: { $size: { $ifNull: ['$recipients', []] } }
            }
          }
        }
      ]);

      return broadcastStats[0] || {
        totalBroadcasts: 0,
        completedBroadcasts: 0,
        activeBroadcasts: 0,
        totalRecipients: 0
      };

    } catch (error) {
      console.error('Error fetching broadcast stats:', error);
      return {
        totalBroadcasts: 0,
        completedBroadcasts: 0,
        activeBroadcasts: 0,
        totalRecipients: 0
      };
    }
  }

  // New method for real-time stats
  async getRealTimeStats(tenantId) {
    try {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const thisHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

      const [
        todayMessages,
        thisHourMessages,
        activeChats,
        pendingMessages
      ] = await Promise.all([
        // Messages sent today
        Message.countDocuments({
          tenantId: tenantId,
          timestamp: { $gte: today }
        }),

        // Messages sent this hour
        Message.countDocuments({
          tenantId: tenantId,
          timestamp: { $gte: thisHour }
        }),

        // Active chats (contacts with recent activity)
        Contact.countDocuments({
          tenantId: tenantId,
          lastMessageAt: { $gte: new Date(now - 24 * 60 * 60 * 1000) } // last 24 hours
        }),

        // Pending messages
        Message.countDocuments({
          tenantId: tenantId,
          status: 'pending'
        })
      ]);

      return {
        todayMessages: todayMessages || 0,
        thisHourMessages: thisHourMessages || 0,
        activeChats: activeChats || 0,
        pendingMessages: pendingMessages || 0,
        tenantId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Real-time stats error:', error);
      throw error;
    }
  }

  // Helper method to get performance metrics
  async getPerformanceMetrics(tenantId, dateFilter = {}) {
    try {
      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      let timeFilter = { tenantId: tenantId };
      
      if (dateFilter.startDate && dateFilter.endDate) {
        const startDate = new Date(dateFilter.startDate);
        const endDate = new Date(dateFilter.endDate);
        endDate.setHours(23, 59, 59, 999);

        timeFilter.timestamp = {
          $gte: startDate,
          $lte: endDate
        };
      }

      const performanceStats = await Message.aggregate([
        {
          $match: timeFilter
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            deliveredMessages: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            readMessages: {
              $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] }
            },
            failedMessages: {
              $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
            }
          }
        },
        {
          $project: {
            totalMessages: 1,
            deliveredMessages: 1,
            readMessages: 1,
            failedMessages: 1,
            deliveryRate: {
              $cond: [
                { $gt: ['$totalMessages', 0] },
                { $multiply: [{ $divide: ['$deliveredMessages', '$totalMessages'] }, 100] },
                0
              ]
            },
            readRate: {
              $cond: [
                { $gt: ['$totalMessages', 0] },
                { $multiply: [{ $divide: ['$readMessages', '$totalMessages'] }, 100] },
                0
              ]
            },
            failureRate: {
              $cond: [
                { $gt: ['$totalMessages', 0] },
                { $multiply: [{ $divide: ['$failedMessages', '$totalMessages'] }, 100] },
                0
              ]
            }
          }
        }
      ]);

      return performanceStats[0] || {
        totalMessages: 0,
        deliveredMessages: 0,
        readMessages: 0,
        failedMessages: 0,
        deliveryRate: 0,
        readRate: 0,
        failureRate: 0
      };

    } catch (error) {
      console.error('Performance metrics error:', error);
      throw error;
    }
  }
}

module.exports = new DashboardService();
