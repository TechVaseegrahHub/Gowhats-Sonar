const generateApiDocs = (tenantId) => {
  return {
    version: '1.0.0',
    baseUrl: `${process.env.API_BASE_URL || 'https://api.gowhats.in'}/api/v1`,
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer YOUR_API_KEY',
      example: 'curl -H "Authorization: Bearer gw_abc123..." https://api.gowhats.in/api/v1/orders'
    },
    endpoints: {
      orders: {
        list: {
          method: 'GET',
          path: '/orders',
          description: 'Get all orders',
          permissions: ['orders.read'],
          parameters: {
            page: 'Page number (default: 1)',
            limit: 'Results per page (default: 50)',
            status: 'Filter by order status',
            startDate: 'Filter by start date (ISO format)',
            endDate: 'Filter by end date (ISO format)',
            customerPhone: 'Filter by customer phone number'
          },
          example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${process.env.API_BASE_URL}/api/v1/orders?page=1&limit=10"`
        },
        get: {
          method: 'GET',
          path: '/orders/:orderId',
          description: 'Get single order',
          permissions: ['orders.read'],
          example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${process.env.API_BASE_URL}/api/v1/orders/ORD123"`
        },
        create: {
          method: 'POST',
          path: '/orders',
          description: 'Create new order',
          permissions: ['orders.write'],
          body: {
            customerPhone: 'Customer phone number',
            customerDetails: {
              name: 'Customer name',
              email: 'Customer email'
            },
            items: 'Array of order items',
            totalAmount: 'Order total amount',
            shippingAddress: 'Shipping address object'
          },
          example: `curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"customerPhone": "+919876543210", "items": [...]}' \\
  "${process.env.API_BASE_URL}/api/v1/orders"`
        },
        updateStatus: {
          method: 'PATCH',
          path: '/orders/:orderId/status',
          description: 'Update order status',
          permissions: ['orders.update'],
          body: {
            status: 'New status (pending/confirmed/shipped/delivered/cancelled)',
            notes: 'Optional status update notes'
          },
          example: `curl -X PATCH -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "shipped"}' \\
  "${process.env.API_BASE_URL}/api/v1/orders/ORD123/status"`
        }
      },
      messages: {
        send: {
          method: 'POST',
          path: '/messages/send',
          description: 'Send WhatsApp message',
          permissions: ['messages.send'],
          body: {
            to: 'Recipient phone number',
            text: 'Message text',
            type: 'Message type (default: text)'
          },
          example: `curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to": "+919876543210", "text": "Hello!"}' \\
  "${process.env.API_BASE_URL}/api/v1/messages/send"`
        },
        list: {
          method: 'GET',
          path: '/messages',
          description: 'Get messages for a contact',
          permissions: ['messages.read'],
          parameters: {
            phoneNumber: 'Contact phone number (required)',
            page: 'Page number',
            limit: 'Results per page'
          },
          example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${process.env.API_BASE_URL}/api/v1/messages?phoneNumber=%2B919876543210"`
        }
      },
      contacts: {
        list: {
          method: 'GET',
          path: '/contacts',
          description: 'Get all contacts',
          permissions: ['contacts.read'],
          parameters: {
            page: 'Page number',
            limit: 'Results per page',
            search: 'Search by name or phone'
          },
          example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${process.env.API_BASE_URL}/api/v1/contacts"`
        },
        get: {
          method: 'GET',
          path: '/contacts/:phoneNumber',
          description: 'Get single contact',
          permissions: ['contacts.read'],
          example: `curl -H "Authorization: Bearer YOUR_API_KEY" \\
  "${process.env.API_BASE_URL}/api/v1/contacts/%2B919876543210"`
        }
      }
    },
    rateLimits: {
      default: '60 requests per minute',
      daily: '10,000 requests per day',
      note: 'Rate limits can be customized per API key'
    },
    webhooks: {
      description: 'Configure webhook URL in your API key settings to receive real-time events',
      events: [
        'order.created',
        'order.updated',
        'message.received',
        'message.sent',
        'contact.created'
      ],
      signature: 'X-GoWhats-Signature header contains HMAC-SHA256 signature'
    }
  };
};

module.exports = { generateApiDocs };
