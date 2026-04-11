import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { Reply, Copy, ChevronDown, X } from 'lucide-react';

const ActionWrapper = styled.div`
  position: absolute;
  top: 2px;
  right: 2px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
  /* Show when the parent bubble is hovered */
  .message-bubble-container:hover & { opacity: 1; }
`;

const Dropdown = styled.div`
  position: absolute;
  top: 25px;
  right: 0;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-radius: 8px;
  width: 130px;
  padding: 5px 0;
  z-index: 100;
`;

const MenuItem = styled.div`
  padding: 10px 15px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  cursor: pointer;
  color: #3b4a54;
  &:hover { background: #f5f6f6; }
`;

const ReplyBar = styled.div`
  background: #f0f2f5;
  border-left: 4px solid #00a884;
  padding: 10px 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-radius: 8px;
  margin: 0 10px 10px 10px;
`;

export const MessageDropdown = ({ message, onReply, onCopy }) => {
  const [show, setShow] = useState(false);
  const menuRef = useRef();

  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShow(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <ActionWrapper>
      <button onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-600">
        <ChevronDown size={18} />
      </button>
      {show && (
        <Dropdown ref={menuRef}>
          <MenuItem onClick={() => { onReply(message); setShow(false); }}><Reply size={16}/> Reply</MenuItem>
          <MenuItem onClick={() => { onCopy(message); setShow(false); }}><Copy size={16}/> Copy</MenuItem>
        </Dropdown>
      )}
    </ActionWrapper>
  );
};

export const ReplyPreview = ({ replyingTo, onCancel }) => (
  <ReplyBar>
    <div className="overflow-hidden">
      <div className="text-green-600 font-bold text-xs">Replying to {replyingTo.from === 'me' ? 'You' : 'Contact'}</div>
      <div className="text-sm text-gray-500 truncate">{replyingTo.text || 'Media'}</div>
    </div>
    <button onClick={onCancel} className="text-gray-400"><X size={18}/></button>
  </ReplyBar>
);

export const QuotedMessage = ({ quote }) => (
  <div className="bg-black bg-opacity-5 border-l-4 border-green-500 p-2 rounded mb-2 text-sm">
    <div className="text-green-700 font-bold text-xs">{quote.senderName}</div>
    <div className="text-gray-600 truncate">{quote.text || 'Media Message'}</div>
  </div>
);
