import styled from "styled-components";
import BackgroundImage from '../images/background2.png';

export const Container = styled.div`
  display: flex;
  height: 100vh;
  max-height: 100vh;
  background-color: #f8f9fa;
  overflow: hidden;
  position: relative;
  width: 100%;
  padding-bottom: 0; /* ❌ removed footer space */

  /* Mobile Responsive Styles */
  @media (max-width: 768px) {
    padding-bottom: 0; /* ❌ remove mobile footer space */

    &.mobile-view {
      height: calc(100vh - 64px);
      height: calc(100dvh - 64px);
      min-height: calc(100vh - 64px);
      min-height: calc(100dvh - 64px);
      max-height: calc(100vh - 64px);
      max-height: calc(100dvh - 64px);
      flex-direction: column;
    }

    .mobile-back-button {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 1000;
    }
  }
`;


export const Sidebar = styled.div`
  width: 25%;
  min-width: 260px;
  background: #ffffff;
  border-right: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  transition: width 0.3s ease;

  /* Mobile Styles */
  @media (max-width: 768px) {
    width: 35%;

    &.mobile-sidebar {
      width: 100% !important;
      min-width: 0 !important;
      border-right: none;
      display: flex;
      position: relative;
      z-index: 1;
      height: 100%;
    }
  }
`;

export const SearchBar = styled.input`
  margin: 10px;
  margin-right: 5px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 20px;
  outline: none;
  font-size: 14px;
  width: calc(100% - 40px);

  @media (max-width: 768px) {
    padding: 12px 15px;
    font-size: 16px;
  }
`;

export const ContactList = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  height: 100%;
  min-height: 0; /* ✅ CRITICAL: Allows flex child to shrink */

  /* ✅ Better scrollbar styling */
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 0, 0, 0.2) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;

    &:hover {
      background-color: rgba(0, 0, 0, 0.3);
    }
  }

  /* ✅ Ensure scrolling works on mobile */
  -webkit-overflow-scrolling: touch;

  @media (max-width: 768px) {
    max-height: none;
  }
`;

export const ContactItem = styled.div`
  position: relative;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  background-color: ${(props) => (props.selected ? "#f0f2f5" : "#ffffff")};
  border-bottom: 1px solid #f0f0f0;

  &:hover {
    background-color: #f5f5f5;
  }

  .avatar {
    width: 49px;
    height: 49px;
    background: white;
    color: #4caf50;
    border: 1px solid #4caf50;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 50%;
    font-size: 18px;
    margin-right: 15px;
    flex-shrink: 0;

    @media (max-width: 768px) {
      width: 45px;
      height: 45px;
      font-size: 16px;
      margin-right: 12px;
    }
  }

  .contact-details {
    flex: 1;
    min-width: 0;
    max-width: 65%;

    .contact-name {
      font-weight: 500;
      font-size: 17px;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #111b21;
      margin-bottom: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      @media (max-width: 768px) {
        font-size: 16px;
      }
    }

    .last-message {
      font-size: 14px;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #667781;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
      display: block;
      height: 20px;

      @media (max-width: 768px) {
        font-size: 13px;
      }
    }
  }

  .timestamp-notification {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
    min-width: 45px;

    .timestamp {
      font-size: 12px;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #667781;
      margin-bottom: 3px;
    }
  }
`;

export const ChatArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #f0f0f0;
  position: relative;
  height: 100%;
  overflow: hidden !important;

  /* Mobile Styles */
  @media (max-width: 768px) {
    &.mobile-chat-area {
      width: 100%;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 100;
      background: #f0f0f0;
      z-index: 100;
    }
  }
`;

export const ChatHeader = styled.div`
  padding: 10px 16px;
  background: #ffffff;
  color: #111b21;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e7eb; /* ✅ Now matches sidebar border */
  min-height: 59px;

  /* Mobile responsive */
  @media (max-width: 768px) {
    padding: 10px 12px;

    .chat-info {
      margin-left: 10px;

      .chat-name {
        font-size: 16px;
      }

      .status {
        font-size: 12px;
        flex-wrap: wrap;

        span {
          margin-right: 4px;
        }
      }
    }
  }

  .header-details {
    display: flex;
    align-items: center;

    .avatar-header {
      width: 40px;
      height: 40px;
      background: #dfe5e7;
      color: #54656f;
      border: none;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 16px;
      font-weight: 500;
      margin-right: 12px;

      @media (max-width: 768px) {
        width: 36px;
        height: 36px;
        font-size: 14px;
      }
    }
  }

  .chat-info {
    display: flex;
    flex-direction: column;
    margin-left: 10px;
    flex: 1;
  }

  .chat-name {
    font-size: 16px;
    font-weight: 500;
    color: #111b21;
    line-height: 21px;
  }

  .status {
    font-size: 13px;
    color: #667781;
    line-height: 20px;
    margin-top: 2px;
  }

  button {
    background: transparent;
    border: none;
    color: #54656f;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: background-color 0.2s;

    &:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }

    svg {
      color: #54656f;
    }
  }

  @media (max-width: 768px) {
    button {
      &:first-child {
        margin-right: 8px;
        padding: 8px;

        &:hover {
          background-color: rgba(0, 0, 0, 0.05);
          color: #111b21;
        }
      }
    }
  }
`;

/* ============================================
   ✅ WHATSAPP WEB STYLE TABS - UPDATED
   ============================================ */
export const WhatsAppTabs = styled.div`
  display: flex;
  background: #f0f2f5;
  padding: 0;
  border-bottom: 1px solid #e0e0e0;
  position: relative;

  button {
    flex: 1;
    padding: 16px 20px;
    background: transparent;
    border: none;
    font-size: 14px;
    font-weight: 500;
    color: #54656f;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:hover {
      background: rgba(11, 20, 26, 0.05);
    }

    /* Active state with green bottom border */
    &.active {
      color: #00a884;

      &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: #00a884;
        border-radius: 3px 3px 0 0;
      }
    }

    /* Badge styling */
    .count-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 10px;
      background-color: #e5e7eb;
      color: #667781;
      transition: all 0.2s ease;
    }

    &.active .count-badge {
      background-color: #00a884;
      color: white;
    }
  }

  @media (max-width: 768px) {
    button {
      padding: 12px 16px;
      font-size: 13px;

      .count-badge {
        min-width: 18px;
        height: 18px;
        font-size: 10px;
      }
    }
  }
`;

export const Messages = styled.div`
  flex: 1;
  padding: 8px 20px;
  overflow-y: auto;
  overflow-x: hidden;
  background-color: #e5ddd5;
  background-image: url(${BackgroundImage});
  background-repeat: repeat;
  background-size: 700px;
  background-attachment: fixed;
  background-position: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #dadada;
    border-radius: 2px;
  }

  .date-separator {
    display: flex;
    justify-content: center;
    margin: 12px 0;

    span {
      background: rgba(255, 255, 255, 0.9);
      color: #667781;
      padding: 5px 12px;
      border-radius: 7.5px;
      font-size: 12.5px;
      font-weight: 400;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);

      @media (max-width: 768px) {
        font-size: 11px;
        padding: 4px 10px;
      }
    }
  }

  @media (max-width: 768px) {
    padding: 8px 12px;
    background-size: 400px;
  }
`;


export const MessageBubble = styled.div`
  max-width: 65%;
  padding: 6px 7px 18px;
  border-radius: 7.5px;
  word-wrap: break-word;
  font-size: 14px;
  margin: 1px 8px;
  align-self: ${props => props.$sent ? 'flex-end' : 'flex-start'};
  background: ${props => props.$sent ? '#d9fdd3' : '#ffffff'};
  box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
  position: relative;

  @media (max-width: 768px) {
    max-width: 85%;
    font-size: 13px;
    margin: 1px 12px;
    padding: 6px 7px 16px;
  }

  .message-content {
    margin-right: 30px;
    font-weight: normal;
    min-height: 16px;
  }

  .message-footer {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding-top: 2px;
    padding-right: 4px;
    height: 18px;
  }

  .timestamp {
    font-size: 11px;
    color: rgba(0, 0, 0, 0.45);
    margin-right: 4px;

    @media (max-width: 768px) {
      font-size: 10px;
    }
  }

  /* WhatsApp Style Status Icons */
.message-status {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  position: relative;
  width: 16px;
  height: 16px;
}

/* Single tick (sent) */
.status-sent::before {
  content: '';
  position: absolute;
  right: 6px;
  top: 2px;
  width: 6px;
  height: 10px;
  border: solid rgba(0, 0, 0, 0.45);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

/* Double tick (delivered) */
.status-delivered::before {
  content: '';
  position: absolute;
  right: 6px;
  top: 2px;
  width: 6px;
  height: 10px;
  border: solid rgba(0, 0, 0, 0.45);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

.status-delivered::after {
  content: '';
  position: absolute;
  right: 2px;
  top: 2px;
  width: 6px;
  height: 10px;
  border: solid rgba(0, 0, 0, 0.45);
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

/* Double tick blue (read) */
.status-read::before {
  content: '';
  position: absolute;
  right: 6px;
  top: 2px;
  width: 6px;
  height: 10px;
  border: solid #3b82f6;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

.status-read::after {
  content: '';
  position: absolute;
  right: 2px;
  top: 2px;
  width: 6px;
  height: 10px;
  border: solid #3b82f6;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}

  /* Pending/sending state */
  .status-pending::before {
    content: '';
    position: absolute;
    right: 5px;
    top: 4px;
    width: 8px;
    height: 8px;
    border: 1.5px solid rgba(0, 0, 0, 0.45);
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* Failed state */
  .status-failed::before {
    content: '!';
    position: absolute;
    right: 4px;
    top: 2px;
    width: 10px;
    height: 10px;
    background: #ef4444;
    color: white;
    border-radius: 50%;
    font-size: 8px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  /* Hide status for received messages */
  ${props => !props.$sent && `
    .message-status {
      display: none;
    }
  `}
`;

// Interactive Message Components
export const InteractiveMessage = styled.div`
  background-color: ${props => props.$sent ? '#d9fdd3' : '#ffffff'};
  border-radius: 7.5px;
  box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
  margin: 1px 8px 2px;
  max-width: 300px;
  align-self: ${props => props.$sent ? 'flex-end' : 'flex-start'};
  overflow: hidden;
  transition: none !important;
  animation: none !important;

  @media (max-width: 768px) {
    max-width: 85%;
  }
`;

export const ListMessage = styled(InteractiveMessage)`
  .list-header {
    padding: 12px 16px 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);

    .list-title {
      font-weight: 600;
      font-size: 14px;
      color: #111b21;
      margin-bottom: 2px;
    }

    .list-description {
      font-size: 13px;
      color: #667781;
      line-height: 1.3;
    }
  }

  .list-button {
    padding: 12px 16px;
    background: ${props => props.$sent ? '#d1f4cc' : '#f0f2f5'};
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    color: #111b21;
    transition: background-color 0.2s ease;

    &:hover {
      background: ${props => props.$sent ? '#c6efbf' : '#e8eaed'};
    }

    .chevron-down {
      color: #667781;
      transition: transform 0.2s ease;
    }
  }

  .list-options {
    border-top: 1px solid rgba(0, 0, 0, 0.1);
  }

  .section-title {
    padding: 8px 16px 4px;
    font-size: 12px;
    color: #667781;
    font-weight: 500;
    background: rgba(0, 0, 0, 0.03);
  }

  .list-option {
    padding: 12px 16px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .option-title {
      font-weight: 500;
      font-size: 14px;
      margin-bottom: 2px;
      color: #111b21;
    }

    .option-description {
      font-size: 13px;
      color: #667781;
    }
  }
`;

export const ButtonMessage = styled(InteractiveMessage)`
  .button-header {
    padding: 12px 16px 8px;

    .button-title {
      font-weight: 600;
      font-size: 14px;
      color: #111b21;
      margin-bottom: 2px;
    }

    .button-body {
      font-size: 13px;
      color: #111b21;
      line-height: 1.4;
    }
  }

  .button-actions {
    padding: 8px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .action-button {
      padding: 10px 12px;
      background: transparent;
      border: 1px solid rgba(0, 0, 0, 0.15);
      border-radius: 6px;
      font-size: 13px;
      color: #111b21;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      &.reply-button {
        border-color: #00a884;
        color: #00a884;

        &:hover {
          background: rgba(0, 168, 132, 0.1);
        }
      }

      &.call-button {
        border-color: #128c7e;
        color: #128c7e;

        &:hover {
          background: rgba(18, 140, 126, 0.1);
        }
      }

      &.url-button {
        border-color: #1976d2;
        color: #1976d2;

        &:hover {
          background: rgba(25, 118, 210, 0.1);
        }
      }
    }
  }
`;

export const WelcomeMessage = styled(InteractiveMessage)`
  .welcome-content {
    padding: 12px 16px;
    text-align: left;

    .welcome-icon {
      display: none;
    }

    .welcome-title {
      font-weight: 600;
      font-size: 14px;
      color: #111b21;
      margin-bottom: 4px;
    }

    .welcome-text {
      font-size: 13px;
      color: #111b21;
      line-height: 1.4;
      margin-bottom: 12px;
    }

    .welcome-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .welcome-button {
        padding: 10px 12px;
        background: transparent;
        color: #00a884;
        border: 1px solid rgba(0, 168, 132, 0.3);
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
        transition: all 0.2s ease;

        &:hover {
          background: rgba(0, 168, 132, 0.1);
          border-color: #00a884;
        }

        &.secondary {
          background: transparent;
          color: #667781;
          border-color: rgba(102, 119, 129, 0.3);

          &:hover {
            background: rgba(102, 119, 129, 0.1);
            border-color: #667781;
          }
        }
      }
    }
  }
`;

// Optimized Order Container
export const OrderContainer = styled.div`
  padding: 8px 12px 22px;
  background-color: ${props => props.$sent ? '#d9fdd3' : '#ffffff'};
  border-radius: 7.5px;
  box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
  position: relative;
  max-width: 300px;
  width: 280px;
  transition: none !important;
  animation: none !important;
  transform: none !important;

  @media (max-width: 768px) {
    max-width: 85%;
    width: auto;
  }

  .catalog-header {
    display: flex;
    align-items: center;
    font-size: 13px;
    color: #128c7e;
    margin-bottom: 8px;
    font-weight: 500;
  }

  .catalog-content {
    display: flex;
    background: rgba(0, 0, 0, 0.04);
    padding: 8px;
    border-radius: 6px;
    margin-bottom: 8px;
    min-height: 80px;

    .catalog-image {
      width: 80px;
      height: 80px;
      margin-right: 12px;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 4px;
        transition: none !important;
        animation: none !important;
        transform: none !important;
      }
    }

    .catalog-info {
      display: flex;
      flex-direction: column;
      justify-content: center;

      .product-name {
        min-height: 20px;
        font-weight: 500;
        margin-bottom: 4px;
      }

      .catalog-price {
        font-weight: 600;
        font-size: 16px;
        color: #128c7e;
        margin-bottom: 2px;
      }

      .catalog-subtitle {
        font-size: 12px;
        color: #667781;
      }
    }
  }
`;

export const VideoContainer = styled.div`
  position: relative;

  &:hover .absolute {
    opacity: 1 !important;
  }

  .absolute {
    z-index: 30;
  }
`;

export const AudioControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const PlayButton = styled.div`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
`;

export const Waveform = styled.div`
  flex: 1;
  height: 26px;
  position: relative;

  .waveform-track {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 100%;
    height: 4px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 2px;
  }

  .waveform-progress {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    border-radius: 2px;
    transition: width 0.2s ease;
  }
`;

export const TemplateContainer = styled.div`
  display: flex;
  flex-direction: column;
  background-color: ${props => props.$sent ? '#d9fdd3' : '#ffffff'};
  padding: 12px;
  padding-bottom: 22px;
  border-radius: 7.5px;
  position: relative;
  margin-bottom: 2px;
  box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
  max-width: 300px;
  width: 280px;
  align-self: ${props => props.$sent ? 'flex-end' : 'flex-start'};

  @media (max-width: 768px) {
    max-width: 85%;
    width: auto;
  }

  .template-header {
    font-weight: 600;
    margin-bottom: 6px;
    font-size: 14px;
    color: #111b21;
  }

  .template-body {
    font-size: 14px;
    color: #111b21;
    line-height: 1.4;
    margin-bottom: 6px;
  }

  .template-footer {
    font-size: 12px;
    color: #667781;
    margin-bottom: 6px;
  }

  .template-buttons {
    margin-top: 6px;

    button {
      background-color: transparent;
      color: #0093d8;
      border: none;
      padding: 2px 0;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      text-align: left;
      width: 100%;
      position: relative;
      display: flex;
      align-items: center;

      &:before {
        content: '';
        display: inline-block;
        width: 14px;
        height: 14px;
        background-image: none;
        background-size: contain;
        margin-right: 6px;
      }
    }
  }
`;

export const MessageInput = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 10px;
  background: #f5f5f5;
  border-top: 1px solid #e5e7eb; /* ✅ UPDATED: Consistent border color */

  @media (max-width: 768px) {
    padding: 6px 8px;
  }

  .emoji-button, .attach-button, .autocorrect-button {
    color: #666;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 1px;
    width: 36px;
    height: 36px;
    flex-shrink: 0;

    @media (max-width: 768px) {
      width: 32px;
      height: 32px;
      padding: 6px;
      margin: 0;
    }

    &:hover {
      background-color: #e0e0e0;
    }

    &.active {
      background-color: #e0e0e0;
    }

    svg {
      width: 20px;
      height: 20px;

      @media (max-width: 768px) {
        width: 18px;
        height: 18px;
      }
    }
  }

  .autocorrect-button {
    color: #0f893e;

    &:hover {
      background-color: rgba(15, 137, 62, 0.1);
    }
  }

  .spinner-border {
    display: inline-block;
    width: 20px;
    height: 20px;
    vertical-align: text-bottom;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spinner-border .75s linear infinite;
  }

  @keyframes spinner-border {
    to { transform: rotate(360deg); }
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    padding: 9px 12px;
    border-radius: 2px;
    background: #ffffff;
    font-size: 15px;
    line-height: 20px;
    height: 40px;
    margin: 0 4px;

    @media (max-width: 768px) {
      padding: 8px 10px;
      font-size: 14px;
      height: 38px;
      margin: 0 2px;
    }

    &:focus {
      outline: none;
    }
  }

  .recording-interface {
    flex: 1;
    display: flex;
    align-items: center;
    background: #ffffff;
    border-radius: 8px;
    padding: 0 12px;
    height: 40px;

    @media (max-width: 768px) {
      height: 38px;
      padding: 0 10px;
    }

    .recording-waveform {
      flex: 1;
      height: 24px;
      position: relative;
      overflow: hidden;

      .recording-animation {
        height: 100%;
        background: linear-gradient(90deg, #f44336 0%, transparent 50%, #f44336 100%);
        width: 100%;
        position: absolute;
        animation: wave 2s infinite linear;
        opacity: 0.5;
      }
    }

    .recording-time {
      margin-left: 10px;
      font-size: 14px;
      color: #f44336;
      font-weight: 500;

      @media (max-width: 768px) {
        font-size: 13px;
        margin-left: 8px;
      }
    }

    .cancel-recording-btn {
      background: transparent;
      border: none;
      color: #f44336;
      margin-left: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  @keyframes wave {
    0% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.5;
    }
    100% {
      opacity: 0.2;
    }
  }

  .send-button {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #00a884;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    margin-left: 4px;
    .send-button {

    @media (max-width: 768px) {
      width: 36px;
      height: 36px;
      margin-left: 2px;

      svg {
        width: 18px;
        height: 18px;
      }
    }

    &:hover {
      background: #008f72;
    }

    &.recording {
      background-color: #f44336;

      .recording-stop {
        width: 12px;
        height: 12px;
        background-color: white;
        border-radius: 2px;
      }
    }
  }
`;

export const AudioMessageContainer = styled.div`
  display: flex;
  flex-direction: column;
  background-color: ${props => props.$sent ? '#d9fdd3' : '#ffffff'};
  border-radius: 7.5px;
  position: relative;
  padding: 8px 12px 22px;
  margin-bottom: 2px;
  box-shadow: 0 1px 0.5px rgba(11, 20, 26, 0.13);
  width: 280px;
  max-width: 300px;
  align-self: ${props => props.$sent ? 'flex-end' : 'flex-start'};

  @media (max-width: 768px) {
    max-width: 85%;
    width: auto;
  }

  .audio-controls {
    display: flex;
    align-items: center;
    gap: 8px;

    .play-button {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: ${props => props.$sent ? '#d1f4cc' : '#e9edef'};
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;

      svg {
        color: ${props => props.$sent ? '#1fa855' : '#54656f'};
      }

      .pause-icon {
        color: ${props => props.$sent ? '#1fa855' : '#54656f'};
        font-size: 12px;
        font-weight: bold;
      }
    }

    .waveform {
      flex: 1;
      height: 26px;
      position: relative;

      .waveform-track {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 100%;
        height: 4px;
        background: ${props => props.$sent ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.15)'};
        border-radius: 2px;
      }

      .waveform-progress {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: ${props => props.$sent ? '#1fa855' : '#54656f'};
        border-radius: 2px;
        transition: width 0.2s ease;
      }
    }

    .duration {
      font-size: 11px;
      color: rgba(0, 0, 0, 0.6);
      min-width: 60px;
      text-align: right;
    }
  }
`;

export const ChatProfile = styled.div`
  width: 450px;
  min-width: 450px;
  background: #ffffff;
  border-left: 1px solid #ddd;
  overflow-y: auto;
  height: 100%;

  @media (max-width: 768px) {
    width: 100%;
    min-width: 100%;
  }
`;

export const ProfileContainer = styled.div`
  padding: 20px;
  height: 100%;
  overflow-y: auto;
`;

export const ProfileHeader = styled.div`
  margin-bottom: 24px;
  padding: 16px;
  border-radius: 8px;
  background-color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .profile-info {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 16px;
  }

  .avatar {
    width: 64px;
    height: 64px;
    background-color: white;
    color: #4caf50;
    border: 1px solid #4caf50;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
  }

  .contact-name {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .contact-phone {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .block-button {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    background-color: #ef4444;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.3s ease;

    &:hover {
      background-color: #dc2626;
    }
  }
`;

export const NotificationBubble = styled.div`
  background-color: #25D366;
  color: white;
  border-radius: 50%;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 20px;
  text-align: center;
  margin-bottom: 4px;
`;

export const Tabs = styled.div`
  display: flex;
  width: 100%;
  border-bottom: 1px solid #e5e7eb;
`;

export const Tab = styled.div`
  width: 50%;
  padding: 12px;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background-color: #f3f4f6;
  }
`;

export const OrderSummary = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  margin-bottom: 24px;
`;

export const OrderSummaryCard = styled.div`
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

export const OrderSummaryTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 8px;
`;

export const OrderSummaryValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
`;

export const LastOrder = styled.div`
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

export const LastOrderHeader = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
`;

export const LastOrderId = styled.div`
  font-size: 1.25rem;
  font-weight: 700;
`;

export const SearchButton = styled.div`
  padding: 4px;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    color: black;
  }
`;

export const LastOrderStatus = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
`;

export const StatusTag = styled.div`
  background-color: #10b981;
  color: #064e3b;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 12px;
`;

export const OrderDate = styled.div`
  color: #6b7280;
  font-size: 0.875rem;
`;

export const LastOrderFooter = styled.div`
  display: flex;
  justify-content: space-between;
`;

export const OrderTotal = styled.div`
  font-weight: 700;
`;

export const DetailsButton = styled.div`
  display: flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    background-color: #f3f4f6;
  }
`;

export const WooCommerceNotes = styled.div`
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

export const NotesTabs = styled.div`
  display: flex;
  width: 100%;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 16px;
`;

export const NotesTab = styled.div`
  width: 50%;
  padding: 12px;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background-color: #f3f4f6;
  }
`;

export const NotesContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const Note = styled.div`
  display: flex;
  justify-content: space-between;
`;

export const NoteLabel = styled.div`
  font-weight: 500;
`;

export const NoteInfo = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

export const NoteValue = styled.div`
  color: #6b7280;
  font-size: 0.875rem;
`;

export const EditNote = styled.div`
  padding: 4px;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    color: black;
  }
`;

export const ExpiryBanner = styled.div`
  padding: 12px 16px;
  background-color: #f0f0f0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-bottom: 1px solid #ddd;
  margin-bottom: 8px;

  .expired-conversation {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: 100%;

    span {
      font-size: 14px;
      color: #333;
    }

    .send-template-btn {
      padding: 8px 16px;
      background-color: #25D366;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;

      &:hover {
        background-color: #1CB358;
      }
    }
  }
`;

export const InteractionResponse = styled.div`
  .interaction-indicator {
    display: inline-flex;
    align-items: center;
    margin-left: 8px;

    small {
      color: #666;
      font-style: italic;
    }
  }
`;

// WhatsApp-Style Message Components
export const CatalogMessage = styled.div`
  background: ${props => props.$sent ? '#dcf8c6' : '#ffffff'};
  border-radius: 7.5px;
  padding: 8px 12px;
  margin: 4px 0;
  max-width: 400px;
  box-shadow: 0 1px 0.5px rgba(0,0,0,.13);
  border: 1px solid #e1f5fe;

  @media (max-width: 768px) {
    max-width: 85%;
  }

  .catalog-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: #00bcd4;

    svg {
      margin-right: 8px;
    }

    span {
      font-weight: 600;
      font-size: 14px;
    }
  }

  .catalog-body {
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 8px;
    color: #111b21;
  }

  .catalog-action {
    display: flex;
    align-items: center;
    padding: 8px;
    background: rgba(0, 188, 212, 0.1);
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s;

    span {
      font-size: 13px;
      color: #00bcd4;
      font-weight: 500;
      flex: 1;
    }

    svg {
      color: #00bcd4;
    }
  }
`;

export const InteractiveMessageContainer = styled.div`
  background: ${props => props.$sent ? '#dcf8c6' : '#ffffff'};
  border-radius: 7.5px;
  padding: 8px 12px;
  margin: 4px 0;
  max-width: 350px;
  box-shadow: 0 1px 0.5px rgba(0,0,0,.13);
  border: 1px solid #e3f2fd;

  @media (max-width: 768px) {
    max-width: 85%;
  }

  .interactive-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: #2196f3;

    svg {
      margin-right: 8px;
    }

    span {
      font-weight: 600;
      font-size: 14px;
    }
  }

  .interactive-body {
    font-size: 14px;
    line-height: 1.4;
    color: #111b21;
  }
`;

export const FlowMessage = styled.div`
  background: ${props => props.$sent ? '#dcf8c6' : '#ffffff'};
  border-radius: 7.5px;
  padding: 8px 12px;
  margin: 4px 0;
  max-width: 400px;
  box-shadow: 0 1px 0.5px rgba(0,0,0,.13);
  border: 1px solid #f3e5f5;

  @media (max-width: 768px) {
    max-width: 85%;
  }

  .flow-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: #9c27b0;

    svg {
      margin-right: 8px;
    }

    span {
      font-weight: 600;
      font-size: 14px;
    }
  }

  .flow-body {
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 8px;
    color: #111b21;
  }

  .flow-status {
    display: flex;
    align-items: center;
    padding: 6px 8px;
    background: rgba(156, 39, 176, 0.1);
    border-radius: 4px;
    font-size: 12px;
    color: #9c27b0;

    svg {
      margin-right: 6px;
    }
  }
`;

export const ShippingMessage = styled.div`
  background: ${props => props.$sent ? '#dcf8c6' : '#ffffff'};
  border-radius: 7.5px;
  padding: 8px 12px;
  margin: 4px 0;
  max-width: 380px;
  box-shadow: 0 1px 0.5px rgba(0,0,0,.13);
  border: 1px solid #fff3e0;

  @media (max-width: 768px) {
    max-width: 85%;
  }

  .shipping-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: #ff9800;

    svg {
      margin-right: 8px;
    }

    span {
      font-weight: 600;
      font-size: 14px;
    }
  }

  .shipping-body {
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 8px;
    color: #111b21;
  }

  .shipping-options {
    margin-top: 8px;

    .option-item {
      padding: 6px 8px;
      margin-bottom: 4px;
      background: rgba(255, 152, 0, 0.1);
      border-radius: 4px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
      align-items: center;

      span:last-child {
        font-weight: 600;
      }
    }
  }

  .shipping-action {
    display: flex;
    align-items: center;
    padding: 8px;
    background: rgba(255, 152, 0, 0.1);
    border-radius: 4px;
    cursor: pointer;
    margin-top: 8px;

    span {
      font-size: 13px;
      color: #ff9800;
      font-weight: 500;
      flex: 1;
    }

    svg {
      color: #ff9800;
    }
  }
`;

export const OrderConfirmationMessage = styled.div`
  background: ${props => props.$sent ? '#dcf8c6' : '#ffffff'};
  border-radius: 7.5px;
  padding: 8px 12px;
  margin: 4px 0;
  max-width: 400px;
  box-shadow: 0 1px 0.5px rgba(0,0,0,.13);
  border: 1px solid #e8f5e8;

  @media (max-width: 768px) {
    max-width: 85%;
  }

  .order-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    color: #4caf50;

    svg {
      margin-right: 8px;
    }

    span {
      font-weight: 600;
      font-size: 14px;
    }
  }

  .order-body {
    font-size: 14px;
    line-height: 1.4;
    margin-bottom: 8px;
    color: #111b21;
  }

  .order-status {
    padding: 8px;
    background: rgba(76, 175, 80, 0.1);
    border-radius: 6px;
    font-size: 13px;
    color: #2e7d32;
  }
`;

// Global styles for responsive design
export const GlobalMessageStyles = `
  @media (max-width: 768px) {
    .catalog-message,
    .interactive-message,
    .flow-message,
    .shipping-message,
    .order-confirmation-message {
      max-width: 85% !important;
      font-size: 13px;
    }

    .catalog-header,
    .interactive-header,
    .flow-header,
    .shipping-header,
    .order-header {
      padding: 6px 8px !important;
    }

    .catalog-action,
    .shipping-action {
      padding: 6px !important;
      font-size: 12px !important;
    }
  }
`;

export const SearchContainer = styled.div`
  position: relative;
  flex-grow: 1;
`;

export const SearchClearButton = styled.button`
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  border: none;
  background: rgba(107, 114, 128, 0.15);
  color: #6B7280;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  transition: all 0.2s ease;
  z-index: 10;

  &:hover {
    background: rgba(107, 114, 128, 0.25);
    color: #374151;
    transform: translateY(-50%) scale(1.1);
  }

  &:active {
    background: rgba(107, 114, 128, 0.35);
    transform: translateY(-50%) scale(0.95);
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
  }

  @media (max-width: 480px) {
    width: 20px;
    height: 20px;
    right: 4px;
  }
`;

export const TeamAssistTab = styled.div`
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  background: white;

  button {
    flex: 1;
    padding: 12px 16px;
    text-align: center;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    background: none;
    color: #6b7280;

    &:hover {
      color: #374151;
      background-color: #f9fafb;
    }

    &.active {
      font-weight: 600;
      border-bottom: 2px solid;
    }

    &.all-chats.active {
      color: #16a34a;
      border-bottom-color: #16a34a;
      background-color: #f0fdf4;
    }

    &.team-assist.active {
      color: #ea580c;
      border-bottom-color: #ea580c;
      background-color: #fff7ed;
    }
  }
`;

export const TeamBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  margin-left: 8px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 12px;
  background-color: #fed7aa;
  color: #9a3412;
  border: 1px solid #fdba74;
`;

export const ResolveButton = styled.button`
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  background-color: #00a884;
  border: none;
  border-radius: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 4px;

  &:hover {
    background-color: #06cf9c;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: scale(0.98);
  }

  &:focus {
    outline: none;
  }
`;

export const HumanAgentMessage = styled.div`
  background-color: #fff7ed;
  border-left: 3px solid #ea580c;
  padding: 8px 12px;
  border-radius: 6px;
  margin: 4px 8px;
  max-width: 65%;
  align-self: flex-start;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);

  @media (max-width: 768px) {
    max-width: 85%;
  }

  .agent-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #9a3412;
  }

  .agent-content {
    font-size: 14px;
    color: #111b21;
    line-height: 1.4;
  }

  .agent-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 4px;
    font-size: 11px;
    color: #78716c;
  }
`;

export const TabCounter = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  margin-left: 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 10px;
  background-color: ${props => props.$isActive ? 'currentColor' : '#e5e7eb'};
  color: ${props => props.$isActive ? 'white' : '#6b7280'};
`;

export const ContactItemWithTeam = styled(ContactItem)`
  ${props => props.$needsAssist && `
    background-color: ${props.selected ? '#fff7ed' : '#fffbeb'};
    border-left: 3px solid #ea580c;

    &:hover {
      background-color: #fff7ed;
    }

    .contact-name {
      color: #9a3412;
      font-weight: 600;
    }

    .last-message {
      color: #ea580c;
    }
  `}
`;

const SendButton = styled.button`
  padding: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background-color: #25d366;
  color: white;

  &:hover {
    background-color: #22c55e;
    transform: scale(1.05);
  }

  &.recording {
    background-color: #ef4444;
  }

  &.recording:hover {
    background-color: #dc2626;
  }

  @keyframes wave {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
`;

const RecordingStop = styled.div`
  width: 16px;
  height: 16px;
  background-color: white;
  border-radius: 2px;
`;

// Additional responsive styles
export const MobileHeader = styled.div`
  display: none;

  @media (max-width: 768px) {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: #4caf50;
    color: white;

    .mobile-menu-button {
      background: none;
      border: none;
      color: white;
      padding: 8px;
      margin-right: 12px;
      cursor: pointer;

      &:hover {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 50%;
      }
    }

    .mobile-title {
      font-size: 18px;
      font-weight: 600;
      flex: 1;
    }
  }
`;

// Responsive utility classes
export const ResponsiveContainer = styled.div`
  @media (max-width: 768px) {
    .desktop-only {
      display: none !important;
    }
  }

  @media (min-width: 769px) {
    .mobile-only {
      display: none !important;
    }
  }
`;


export const StickerContainer = styled.div`
  display: flex;
  justify-content: ${props => props.$sent ? 'flex-end' : 'flex-start'};
  margin-bottom: 8px;
  padding: 0 20px;

  img {
    width: 160px;
    height: 160px;
    object-fit: contain;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
  }
`;

export const ReactionBadge = styled.div`
  position: absolute;
  bottom: -10px;
  right: ${props => props.$sent ? 'auto' : '-5px'};
  left: ${props => props.$sent ? '-5px' : 'auto'};
  background: white;
  border-radius: 12px;
  padding: 2px 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  font-size: 16px;
  z-index: 10;
  border: 1px solid #e5e7eb;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
`;

export const MessageWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-bottom: 4px;

  &:hover .message-actions {
    opacity: 1;
  }
`;

export const MessageActions = styled.div`
  position: absolute;
  top: 0;
  ${props => props.$sent ? 'left: -60px;' : 'right: -60px;'}
  top: 5px;
  right: ${props => props.$sent ? 'auto' : '5px'};
  left: ${props => props.$sent ? '5px' : 'auto'};

  background: linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 100%);

  opacity: 0;
  transition: opacity 0.2s;
  z-index: 20;

  display: flex;
  gap: 5px;
  background: rgba(240, 242, 245, 0.9);
  padding: 4px;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
`;

export const ActionButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: #54656f;
  padding: 2px;
  display: flex;
  align-items: center;

  &:hover {
    color: #000;
  }
`;

export const ReactionPickerContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border-radius: 24px;
  padding: 6px;
  display: flex;
  gap: 8px;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  z-index: 100;
  margin-bottom: 5px;
  border: 1px solid #e0e0e0;

  span {
    font-size: 24px;
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.3);
    }
  }
`;

export const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, #fff7ed 0%, #ffffff 50%, #f0fdf4 100%);
  padding: 40px 20px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 20px;
  }
`;

export const ScrollingFooter = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40px; /* ✅ Reduced from 60px to 40px */
  background: linear-gradient(90deg, #fff7ed 0%, #ffffff 50%, #f0fdf4 100%);
  border-top: 2px solid #e5e7eb;
  overflow: hidden;
  z-index: 10;
  display: flex;
  align-items: center;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.05);

  @media (max-width: 768px) {
    height: 35px; /* ✅ Reduced from 56px to 35px */
  }

  .scroll-wrapper {
    display: inline-block;
    white-space: nowrap;
    animation: scroll-banner 120s linear infinite; /* ✅ Increased from 80s to 120s (slower) */
    padding-left: 100%;
  }

  .scroll-item {
    display: inline-flex;
    align-items: center;
    font-size: 13px; /* ✅ Reduced from 15px to 13px */
    font-weight: 600; /* ✅ Reduced from 700 to 600 */
    padding: 0 80px; /* ✅ Reduced from 100px to 80px */
    color: #1f2937;
    letter-spacing: 0.3px; /* ✅ Reduced from 0.5px to 0.3px */

    @media (max-width: 768px) {
      font-size: 11px; /* ✅ Reduced from 13px to 11px */
      padding: 0 50px; /* ✅ Reduced from 60px to 50px */
    }

    .hearts {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      font-size: 16px; /* ✅ Reduced from 20px to 16px */

      @media (max-width: 768px) {
        font-size: 14px; /* ✅ Reduced from 18px to 14px */
      }
    }

    .flag {
      font-size: 20px; /* ✅ Reduced from 24px to 20px */
      margin: 0 10px; /* ✅ Reduced from 12px to 10px */

      @media (max-width: 768px) {
        font-size: 16px; /* ✅ Reduced from 20px to 16px */
        margin: 0 6px; /* ✅ Reduced from 8px to 6px */
      }
    }

    .separator {
      margin: 0 12px; /* ✅ Reduced from 16px to 12px */
      color: #9ca3af;
      font-weight: 500; /* ✅ Reduced from 600 to 500 */

      @media (max-width: 768px) {
        margin: 0 8px; /* ✅ Reduced from 10px to 8px */
      }
    }
  }

  @keyframes scroll-banner {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-100%);
    }
  }
`;


