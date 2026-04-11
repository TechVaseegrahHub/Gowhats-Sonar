const https = require('https');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const secret = process.env.SHOPIFY_API_SECRET || process.env.SHOPIFY_CLIENT_SECRET;
const baseWebhookUrl = process.argv[2] || process.env.COMPLIANCE_WEBHOOK_BASE_URL || 'https://bot.gowhats.in/webhooks';

if (!secret) {
  console.error('Missing SHOPIFY_API_SECRET or SHOPIFY_CLIENT_SECRET in server/.env');
  process.exit(1);
}

function sendSignedRequest(urlString, topic, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const parsedUrl = new URL(urlString);
    const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');

    const req = https.request({
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Shopify-Hmac-SHA256': hmac,
        'X-Shopify-Topic': topic,
        'X-Shopify-Shop-Domain': 'compliance-test.myshopify.com'
      }
    }, (res) => {
      let responseBody = '';

      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve({
          url: urlString,
          topic,
          status: res.statusCode,
          body: responseBody
        });
      });
    });

    req.on('error', (error) => {
      resolve({
        url: urlString,
        topic,
        error: error.message
      });
    });

    req.write(body);
    req.end();
  });
}

async function main() {
  const rootUrl = new URL(baseWebhookUrl);
  const rootUrlString = rootUrl.toString().replace(/\/$/, '');
  const payloads = {
    'customers/data_request': {
      shop_id: 1,
      shop_domain: 'compliance-test.myshopify.com',
      customer: {
        id: 123,
        email: 'privacy-test@example.com',
        phone: '+919999999999'
      },
      orders_requested: ['1001']
    },
    'customers/redact': {
      shop_id: 1,
      shop_domain: 'compliance-test.myshopify.com',
      customer: {
        id: 123,
        email: 'privacy-test@example.com',
        phone: '+919999999999'
      },
      orders_to_redact: ['1001']
    },
    'shop/redact': {
      shop_id: 1,
      shop_domain: 'compliance-test.myshopify.com'
    }
  };

  const tests = [
    {
      label: 'root-customers-data-request',
      url: rootUrlString,
      topic: 'customers/data_request',
      payload: payloads['customers/data_request']
    },
    {
      label: 'root-customers-redact',
      url: rootUrlString,
      topic: 'customers/redact',
      payload: payloads['customers/redact']
    },
    {
      label: 'root-shop-redact',
      url: rootUrlString,
      topic: 'shop/redact',
      payload: payloads['shop/redact']
    },
    {
      label: 'path-customers-data-request',
      url: `${rootUrlString}/customers/data_request`,
      topic: 'customers/data_request',
      payload: payloads['customers/data_request']
    },
    {
      label: 'path-customers-redact',
      url: `${rootUrlString}/customers/redact`,
      topic: 'customers/redact',
      payload: payloads['customers/redact']
    },
    {
      label: 'path-shop-redact',
      url: `${rootUrlString}/shop/redact`,
      topic: 'shop/redact',
      payload: payloads['shop/redact']
    }
  ];

  for (const test of tests) {
    const result = await sendSignedRequest(test.url, test.topic, test.payload);
    const statusLabel = result.error
      ? 'ERROR'
      : result.status === 200
        ? 'PASS'
        : 'FAIL';

    console.log(`[${statusLabel}] ${test.label}`);
    console.log(`  URL: ${result.url}`);
    console.log(`  Topic: ${result.topic}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else {
      console.log(`  Status: ${result.status}`);
      console.log(`  Body: ${result.body}`);
    }
  }
}

main().catch((error) => {
  console.error('Compliance webhook test runner failed:', error);
  process.exit(1);
});

