import React from 'react';
import styled from 'styled-components';
import {
  Package, FileText, CheckCircle, ShoppingBag, Truck, Clock,
  MessageSquare, CreditCard, Ticket, MapPin, Calendar, ChevronRight
} from 'lucide-react';
import dayjs from 'dayjs';

const SentFlowCard = styled.div`
  background: #FFFFFF;
  border: 1px solid #e0e0e0;
  border-left: 4px solid #25D366;
  border-radius: 12px;
  padding: 16px;
  max-width: 380px;
  margin: 8px 0;
  box-shadow: 0 2px 5px rgba(0,0,0,0.05);
  color: #333;
  position: relative;
`;

const ReceivedDetailsCard = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 16px;
  max-width: 400px;
  margin: 8px 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
`;

const PaymentCard = styled(SentFlowCard)`
  border-left: 4px solid #25D366;
  background: #F0FFF4;
`;

const TicketCard = styled.div`
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  max-width: 300px;
  overflow: hidden;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  margin-bottom: 10px;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  padding-bottom: ${props => props.noBorder ? '0' : '12px'};
  border-bottom: ${props => props.noBorder ? 'none' : '1px solid #eee'};
  margin-bottom: ${props => props.noBorder ? '0' : '12px'};
`;

const IconBox = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e8f5e9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #25D366;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 15px;
  color: #111;
`;

const Badge = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  padding: 3px 8px;
  background: #f0f0f0;
  color: #666;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
`;

const CardBody = styled.div`
  font-size: 14px;
  line-height: 1.5;
  color: #555;
  margin-bottom: 12px;
`;

const CardButton = styled.button`
  width: 100%;
  padding: 10px;
  background: #f0f2f5;
  color: #25D366;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: default;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:hover { background: #e8f5e9; }
`;

const TimeStamp = styled.div`
  font-size: 11px;
  color: #999;
  text-align: right;
  margin-top: 8px;
`;

const TicketHeader = styled.div`
  background: #075E54;
  color: white;
  padding: 15px;
  text-align: center;
  font-weight: bold;
  letter-spacing: 1px;
  border-bottom: 2px dashed white;
  position: relative;
`;

const TicketQR = styled.div`
  padding: 20px;
  background: white;
  display: flex;
  justify-content: center;
  align-items: center;
`;

const TicketFooter = styled.div`
  background: #f9f9f9;
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: #666;
  border-top: 1px solid #eee;
`;

// Helper: resolve image src — proxy only truly external URLs
function resolveImageSrc(imageUrl) {
  if (!imageUrl) return null;
  // Already a relative path (e.g. /uploads/...) — use directly, no proxy needed
  if (imageUrl.startsWith('/')) return imageUrl;
  // External URL — route through proxy to avoid CORS
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return `/api/inventory/proxy-image?url=${encodeURIComponent(imageUrl)}`;
  }
  // Bare filename fallback
  return `/uploads/${imageUrl}`;
}

export const FlowSendingMessage = ({ message, flowType = 'order' }) => {
  const isRegistration = flowType === 'registration';
  const displayText = (message.text && message.text.length > 25)
    ? message.text
    : (isRegistration
        ? 'Please complete the registration form to proceed.'
        : 'Please provide your details to complete the order.');

  return (
    <SentFlowCard>
      <CardHeader>
        <IconBox>{isRegistration ? <FileText size={20}/> : <ShoppingBag size={20}/>}</IconBox>
        <Title>{isRegistration ? 'Business Registration' : 'Complete Your Order'}</Title>
        <Badge>BOT</Badge>
      </CardHeader>
      <CardBody>{displayText}</CardBody>
      <CardButton>
        {isRegistration ? <FileText size={16} /> : <ShoppingBag size={16}/>}
        {isRegistration ? 'Start Registration' : 'View Details'}
      </CardButton>
      <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
    </SentFlowCard>
  );
};

export const PaymentMessageComponent = ({ message }) => {
  const orderData = message.orderData || {};
  const amount = parseFloat(orderData.amount || orderData.total || 0).toFixed(2);
  const currency = orderData.currency || 'INR';

  return (
    <PaymentCard>
      <CardHeader>
        <IconBox style={{ color: '#25D366', background: '#e8f5e9' }}><CreditCard size={20}/></IconBox>
        <Title>Payment Request</Title>
        <Badge style={{ background: '#e8f5e9', color: '#25D366', border: '1px solid #25D366' }}>UNPAID</Badge>
      </CardHeader>
      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
        <p style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '4px' }}>TOTAL AMOUNT</p>
        <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#111', margin: '0' }}>
          {currency === 'INR' ? '₹' : currency} {amount}
        </h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '8px' }}>
          {message.text || "Tap below to pay securely."}
        </p>
      </div>
      <CardButton style={{ background: '#25D366', color: 'white', border: 'none' }}>Review and Pay</CardButton>
      <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
    </PaymentCard>
  );
};

export const TicketMessage = ({ message }) => {
  const ticketIdMatch = message.text?.match(/ID: \*?([A-Z0-9]+)\*?/i);
  const ticketId = ticketIdMatch ? ticketIdMatch[1] : 'TICKET';
  const displayText = message.text ? message.text.replace(/ID: \*?[A-Z0-9]+\*?/i, '').trim() : 'Booking Confirmed';

  return (
    <div className="flex justify-end w-full">
      <TicketCard>
        <TicketHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <Ticket size={16} />
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>EVENT TICKET</span>
          </div>
        </TicketHeader>
        <TicketQR>
          {message.mediaUrl ? (
            <img src={message.mediaUrl} alt="QR Code" style={{ width: '180px', height: '180px', objectFit: 'contain', borderRadius: '8px' }} />
          ) : (
            <div style={{ width: '180px', height: '180px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ticket size={40} color="#ccc" />
            </div>
          )}
        </TicketQR>
        <TicketFooter>
          <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#333', marginBottom: '4px', letterSpacing: '1px' }}>{ticketId}</div>
          <div style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{displayText}</div>
          <div style={{ marginTop: '8px', fontSize: '10px', color: '#999' }}>
            {dayjs(message.timestamp).format('DD MMM YYYY, hh:mm A')}
          </div>
        </TicketFooter>
      </TicketCard>
    </div>
  );
};

export const FlowCompletionMessage = ({ message }) => {
  const data = message.flowResponseData || {};
  const isRegistrationFlow = !!(
    data.business_name || data.business_activity || data.biggest_struggle ||
    (data.name && !data.customer_details)
  );

  if (isRegistrationFlow) {
    return (
      <ReceivedDetailsCard>
        <CardHeader>
          <IconBox><CheckCircle size={20} /></IconBox>
          <Title>Registration Submitted</Title>
        </CardHeader>
        <div style={{ marginTop: '12px' }}>
          {Object.entries(data).map(([key, value]) => {
            if (key === 'flow_token' || key === 'screen') return null;
            return (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '13px', borderBottom: '1px dashed #eee' }}>
                <span style={{ color: '#888', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                <span style={{ fontWeight: '600', color: '#333', textAlign: 'right' }}>{String(value)}</span>
              </div>
            );
          })}
        </div>
        <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
      </ReceivedDetailsCard>
    );
  }

  const customerDetails = data.customer_details || {};
  return (
    <ReceivedDetailsCard>
      <CardHeader>
        <IconBox><ShoppingBag size={20} /></IconBox>
        <Title>Order Details Submitted</Title>
      </CardHeader>
      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
          <span style={{ color: '#888' }}>Customer</span>
          <span style={{ fontWeight: '600' }}>{customerDetails.name || 'N/A'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
          <span style={{ color: '#888' }}>Phone</span>
          <span style={{ fontWeight: '600' }}>{customerDetails.phone_number || 'N/A'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
          <span style={{ color: '#888' }}>Location</span>
          <span style={{ fontWeight: '600' }}>{customerDetails.city || 'N/A'}</span>
        </div>
      </div>
      <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
    </ReceivedDetailsCard>
  );
};

/**
 * 5. Catalog Message — FIXED:
 *   - useEffect now depends on message._id (stable) instead of message.orderData (new ref each render)
 *   - API response correctly reads data.items (map) and data.products (array)
 *   - Images: relative paths used directly, external URLs proxied
 */
export const CatalogMessageComponent = ({ message }) => {
  const [productDetails, setProductDetails] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // FIX 1: Stable dependency — derive retailer IDs string once from message._id scope
  const retailerIdsKey = React.useMemo(() => {
    if (!message.orderData?.items?.length) return '';
    return message.orderData.items
      .map(item => item.retailer_id || item.id)
      .filter(Boolean)
      .sort()
      .join(',');
  }, [message._id]); // ✅ only re-compute when the message itself changes

  React.useEffect(() => {
    if (!retailerIdsKey) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProductDetails = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('token');
        const response = await fetch(
          `/api/inventory/by-retailer-ids?retailerIds=${encodeURIComponent(retailerIdsKey)}`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        if (cancelled) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();

        // FIX 2: Support both response shapes from the backend
        // data.items  → object map  { retailer_id: product }
        // data.products → array    [ product, ... ]
        const productsMap  = (data.items && typeof data.items === 'object' && !Array.isArray(data.items))
          ? data.items : {};
        const productsArr  = Array.isArray(data.products) ? data.products
          : Array.isArray(data.items) ? data.items : [];

        const enrichedItems = message.orderData.items.map(item => {
          const rid = item.retailer_id || item.id;
          const product = productsMap[rid] || productsArr.find(p => p.retailer_id === rid) || null;

          return {
            ...item,
            image_url: product?.image_url || item.image_url || null,
            additional_images: product?.additional_images || [],
            product_name: product?.name || item.name || 'Product',
            currency: product?.currency || item.currency || message.orderData?.currency || 'INR'
          };
        });

        if (!cancelled) setProductDetails(enrichedItems);

      } catch (err) {
        console.error('❌ CatalogMessageComponent fetch error:', err.message);
        if (!cancelled) {
          setError(err.message);
          setProductDetails(message.orderData?.items || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProductDetails();
    return () => { cancelled = true; };
  }, [retailerIdsKey]); // ✅ stable — won't loop

  if (!message.orderData?.items) {
    return (
      <SentFlowCard>
        <CardHeader>
          <IconBox><ShoppingBag size={20} /></IconBox>
          <Title>Browse Collection</Title>
          <Badge>BOT</Badge>
        </CardHeader>
        <CardBody>{message.text || 'Explore our products!'}</CardBody>
        <CardButton><ShoppingBag size={16}/> View Catalog</CardButton>
        <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
      </SentFlowCard>
    );
  }

  const itemsToDisplay = productDetails.length > 0 ? productDetails : message.orderData.items;

  return (
    <div style={{
      background: 'white', border: '1px solid #e0e0e0', borderLeft: '4px solid #25D366',
      borderRadius: '12px', padding: '16px', maxWidth: '400px', margin: '8px 0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #eee' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}>
          <ShoppingBag size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#111' }}>Order from Catalog</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{itemsToDisplay.length} item(s)</div>
        </div>
      </div>

      {/* Product List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '30px 20px', color: '#999', fontSize: '13px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📦</div>
          <div>Loading product details...</div>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          {itemsToDisplay.map((item, index) => (
            <div key={index} style={{
              display: 'flex', gap: '12px', padding: '12px', background: '#f9f9f9',
              borderRadius: '8px', marginBottom: index < itemsToDisplay.length - 1 ? '10px' : '0',
              alignItems: 'center', border: '1px solid #f0f0f0'
            }}>
              {/* Product Image */}
              <div style={{
                width: '70px', height: '70px', borderRadius: '10px', overflow: 'hidden',
                background: '#fff', flexShrink: 0, position: 'relative',
                border: '2px solid #e8f5e9', boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}>
                {item.image_url ? (
                  <>
                    {/* FIX 3: resolveImageSrc handles relative vs external correctly */}
                    <img
                      src={resolveImageSrc(item.image_url)}
                      alt={item.product_name || 'Product'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={(e) => {
                        // If proxy failed, try direct URL as fallback
                        if (e.target.src.includes('/api/inventory/proxy-image') && item.image_url.startsWith('http')) {
                          e.target.src = item.image_url;
                        } else {
                          e.target.parentElement.innerHTML = `
                            <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;
                              justify-content:center;background:linear-gradient(135deg,#f5f5f5,#e8e8e8);color:#999;">
                              <div style="font-size:28px;margin-bottom:2px">📦</div>
                              <div style="font-size:9px;font-weight:600">NO IMAGE</div>
                            </div>`;
                        }
                      }}
                    />
                    {item.additional_images?.length > 0 && (
                      <div style={{
                        position: 'absolute', bottom: '3px', right: '3px',
                        background: 'rgba(0,0,0,0.8)', color: 'white', fontSize: '9px',
                        padding: '3px 6px', borderRadius: '4px', fontWeight: '700'
                      }}>
                        📷 +{item.additional_images.length}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(135deg, #f5f5f5, #e8e8e8)', color: '#999'
                  }}>
                    <div style={{ fontSize: '28px', marginBottom: '2px' }}>📦</div>
                    <div style={{ fontSize: '9px', fontWeight: '600' }}>NO IMAGE</div>
                  </div>
                )}
              </div>

              {/* Product Details */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: '600', fontSize: '14px', color: '#1a1a1a', marginBottom: '5px',
                  lineHeight: '1.3', display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden'
                }}>
                  {item.product_name || item.name || 'Product'}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Qty: <span style={{ fontWeight: '600', color: '#333' }}>{item.quantity || 1}</span></span>
                  {(item.retailer_id || item.id) && (
                    <><span style={{ color: '#ddd' }}>•</span><span style={{ fontSize: '11px', color: '#999' }}>{item.retailer_id || item.id}</span></>
                  )}
                </div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#25D366' }}>
                  {item.currency || message.orderData.currency || 'INR'} {parseFloat(item.price || item.item_price || 0).toFixed(2)}
                </div>
              </div>
            </div>
          ))}

          {error && (
            <div style={{
              fontSize: '11px', color: '#f59e0b', padding: '10px 12px',
              background: '#fffbeb', borderRadius: '6px', marginTop: '10px',
              border: '1px solid #fef3c7', display: 'flex', alignItems: 'start', gap: '8px'
            }}>
              <span style={{ fontSize: '14px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>Could not load product images</div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>{error}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px', background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
        borderRadius: '10px', marginBottom: '12px', border: '1px solid #a7f3d0'
      }}>
        <span style={{ fontWeight: '700', fontSize: '13px', color: '#047857', textTransform: 'uppercase' }}>TOTAL</span>
        <span style={{ fontWeight: '800', fontSize: '22px', color: '#059669' }}>
          {message.orderData.currency || 'INR'} {parseFloat(message.orderData.total || 0).toFixed(2)}
        </span>
      </div>

      <div style={{ fontSize: '11px', color: '#999', textAlign: 'right' }}>
        {dayjs(message.timestamp).format('hh:mm A')}
      </div>
    </div>
  );
};

export const ShippingOptionsMessage = ({ message }) => (
  <SentFlowCard>
    <CardHeader>
      <IconBox><Truck size={20} /></IconBox>
      <Title>Choose Courier</Title>
      <Badge>BOT</Badge>
    </CardHeader>
    <CardBody>{message.text || `Please select a courier.`}</CardBody>
    <CardButton><Truck size={16}/> View Options</CardButton>
    <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
  </SentFlowCard>
);

export const ShippingSelectionMessage = ({ message }) => {
  const shippingData = message.shippingSelection || {};
  return (
    <ReceivedDetailsCard>
      <CardHeader>
        <IconBox><CheckCircle size={20}/></IconBox>
        <Title>Shipping Confirmed</Title>
      </CardHeader>
      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
          <span style={{ color: '#888' }}>Courier:</span>
          <span style={{ fontWeight: '600' }}>{shippingData.methodName || 'N/A'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
          <span style={{ color: '#888' }}>Cost:</span>
          <span style={{ fontWeight: '600', color: '#25D366' }}>
            {shippingData.shippingCost === 0 ? 'FREE' : `₹${parseFloat(shippingData.shippingCost || 0).toFixed(2)}`}
          </span>
        </div>
      </div>
      <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
    </ReceivedDetailsCard>
  );
};

export default {
  FlowSendingMessage,
  FlowCompletionMessage,
  CatalogMessageComponent,
  ShippingOptionsMessage,
  ShippingSelectionMessage,
  PaymentMessageComponent,
  TicketMessage
};
