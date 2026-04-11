import React from 'react';
import styled from 'styled-components';
import { ShoppingCart } from 'lucide-react';
import dayjs from 'dayjs';

// ✅ New Green Theme for Incoming Orders

const OrderWrapper = styled.div`
  background: white;
  border: 1px solid #e0e0e0;
  border-left: 4px solid #4CAF50;
  border-radius: 12px;
  padding: 16px;
  max-width: 400px;
  color: #333;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #E8F5E9;
`;

const IconBox = styled.div`
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #4CAF50;
  display: flex;
  align-items: center;
  justify-content: center;
  
  svg {
    color: white;
  }
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 16px;
  color: #128C7E;
`;

const ItemList = styled.div`
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Item = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #F0F0F0;
  font-size: 14px;

  &:last-child {
    border-bottom: none;
  }
`;

const ItemDetails = styled.div`
  color: #555;
  font-weight: 500;
`;

const ItemPrice = styled.span`
  font-weight: 600;
  color: #333;
`;

const TotalSection = styled.div`
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #E8F5E9;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TotalLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #666;
`;

const TotalAmount = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: #4CAF50;
`;

const TimeStamp = styled.div`
  font-size: 11px;
  color: #999;
  text-align: right;
  margin-top: 8px;
`;

const OrderMessage = ({ message }) => {
  const { orderData } = message;
  
  if (!orderData || !Array.isArray(orderData.items)) {
    return <div>Order details unavailable.</div>;
  }

  return (
    <OrderWrapper>
      <Header>
        <IconBox>
          <ShoppingCart size={20} />
        </IconBox>
        <Title>Order from Catalog</Title>
      </Header>

      <ItemList>
        {orderData.items.map((item, index) => (
          <Item key={index}>
            <ItemDetails>
              {item.name || `Product ID: ${item.id}`} × {item.quantity}
            </ItemDetails>
            <ItemPrice>
              {item.currency} {parseFloat(item.price || 0).toFixed(2)}
            </ItemPrice>
          </Item>
        ))}
      </ItemList>

      <TotalSection>
        <TotalLabel>TOTAL:</TotalLabel>
        <TotalAmount>
          {orderData.currency} {parseFloat(orderData.total || 0).toFixed(2)}
        </TotalAmount>
      </TotalSection>

      <TimeStamp>{dayjs(message.timestamp).format('hh:mm A')}</TimeStamp>
    </OrderWrapper>
  );
};

export default OrderMessage;
