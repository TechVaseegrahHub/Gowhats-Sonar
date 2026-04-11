// services/stripeService.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class StripeService {
  constructor() {
    this.stripe = stripe;
  }

  /**
   * Create a Stripe Payment Link
   * @param {Object} params - Payment parameters
   * @returns {Promise<Object>} Stripe Payment Link object
   */
  async createPaymentLink(params) {
    try {
      const {
        amount,
        currency = 'sgd',
        orderId,
        customerName,
        customerEmail,
        customerPhone,
        description,
        metadata = {}
      } = params;

      console.log('💳 Creating Stripe Payment Link:', {
        orderId,
        amount: amount / 100,
        currency,
        participantCount: metadata.participantCount
      });

      // Create product
      const product = await this.stripe.products.create({
        name: description || `Event Registration - ${orderId}`,
        metadata: {
          orderId: orderId,
          customerName: customerName,
          participantCount: metadata.participantCount || '1'
        }
      });

      // Create price
      const price = await this.stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(amount),
        currency: currency.toLowerCase(),
        metadata: {
          orderId: orderId,
          participantCount: metadata.participantCount || '1'
        }
      });

      // ✅ FIX: Use the correct redirect URL that matches your publicRoutes.js
      const baseUrl = process.env.APP_URL || 'https://bot.gowhats.in';

      const paymentLink = await this.stripe.paymentLinks.create({
        line_items: [{
          price: price.id,
          quantity: 1
        }],
        after_completion: {
          type: 'redirect',
          redirect: {
            // ✅ Use payment-success route (matches publicRoutes.js)
            url: `${baseUrl}/payment-success?order=${orderId}`
          }
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        phone_number_collection: {
          enabled: false
        },
        metadata: {
          orderId: orderId,
          customerName: customerName,
          customerPhone: customerPhone,
          tenantId: metadata.tenantId || '',
          registrationConfigId: metadata.registrationConfigId || '',
          participantCount: metadata.participantCount || '1',
          isRegistrationOrder: 'true',
          feePerPerson: metadata.feePerPerson || '0',
          ...metadata
        }
      });

      console.log('✅ Stripe Payment Link Created:', {
        url: paymentLink.url,
        orderId: orderId,
        currency: currency.toUpperCase(),
        amount: `${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`,
        participantCount: metadata.participantCount || '1'
      });

      return paymentLink;

    } catch (error) {
      console.error('❌ Stripe Payment Link Creation Failed:', {
        error: error.message,
        orderId: params.orderId,
        amount: params.amount
      });
      throw error;
    }
  }

  /**
   * Create a Checkout Session (Alternative to Payment Links)
   * @param {Object} params - Session parameters
   * @returns {Promise<Object>} Stripe Checkout Session
   */
  async createCheckoutSession(params) {
    try {
      const {
        amount,
        currency = 'sgd',
        orderId,
        customerName,
        customerEmail,
        customerPhone,
        description,
        successUrl,
        cancelUrl,
        metadata = {}
      } = params;

      console.log('💳 Creating Stripe Checkout Session:', {
        orderId,
        amount: amount / 100,
        currency,
        participantCount: metadata.participantCount
      });

      // Determine payment methods based on currency
      let paymentMethods = ['card'];
      if (currency.toLowerCase() === 'sgd') {
        paymentMethods = ['card', 'paynow', 'grabpay'];
      }

      const baseUrl = process.env.APP_URL || 'https://bot.gowhats.in';

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: paymentMethods,
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: description || `Event Registration - ${orderId}`,
              metadata: {
                orderId: orderId,
                participantCount: metadata.participantCount || '1'
              }
            },
            unit_amount: Math.round(amount)
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: successUrl || `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&order=${orderId}`,
        cancel_url: cancelUrl || `${baseUrl}/booking-cancel?order=${orderId}`,
        customer_email: customerEmail,
        phone_number_collection: {
          enabled: true
        },
        billing_address_collection: 'required',
        metadata: {
          orderId: orderId,
          customerName: customerName,
          customerPhone: customerPhone,
          tenantId: metadata.tenantId || '',
          registrationConfigId: metadata.registrationConfigId || '',
          participantCount: metadata.participantCount || '1',
          isRegistrationOrder: 'true',
          feePerPerson: metadata.feePerPerson || '0',
          ...metadata
        }
      });

      console.log('✅ Stripe Checkout Session Created:', {
        url: session.url,
        id: session.id,
        orderId: orderId,
        currency: currency,
        participantCount: metadata.participantCount || '1'
      });

      return session;

    } catch (error) {
      console.error('❌ Stripe Checkout Session Creation Failed:', {
        error: error.message,
        orderId: params.orderId
      });
      throw error;
    }
  }

  /**
   * Retrieve Payment Intent details
   * @param {string} paymentIntentId - Payment Intent ID
   * @returns {Promise<Object>} Payment Intent object
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      console.error('❌ Error retrieving Payment Intent:', error);
      throw error;
    }
  }

  /**
   * Retrieve Checkout Session details
   * @param {string} sessionId - Checkout Session ID
   * @returns {Promise<Object>} Checkout Session object
   */
  async getCheckoutSession(sessionId) {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return session;
    } catch (error) {
      console.error('❌ Error retrieving Checkout Session:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * @param {string} payload - Raw request body
   * @param {string} signature - Stripe signature header
   * @returns {Object} Verified event object
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return event;
    } catch (error) {
      console.error('❌ Webhook signature verification failed:', error);
      throw error;
    }
  }

  /**
   * Convert Amount to cents
   * @param {number} amount - Amount
   * @returns {number} Amount in cents
   */
  toCents(amount) {
    return Math.round(amount * 100);
  }

  /**
   * Convert cents to Amount
   * @param {number} cents - Amount in cents
   * @returns {number} Amount
   */
  toAmount(cents) {
    return cents / 100;
  }
}

module.exports = new StripeService();
