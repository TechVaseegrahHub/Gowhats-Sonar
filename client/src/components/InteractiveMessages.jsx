// InteractiveMessages.jsx - Complete Interactive Message Components
import React, { useState, useCallback, useMemo } from 'react';
import { ChevronDown, MessageCircle, Phone, Play, CheckCircle, ExternalLink } from 'lucide-react';
import { 
  ListMessage, 
  ButtonMessage, 
  WelcomeMessage, 
  FlowMessage 
} from './ChatStyles';
import { MessageFooter } from './MediaMessages';

export const ListMessageComponent = React.memo(({ message, selectedContact, onListItemSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleListSelect = useCallback((item) => {
    if (onListItemSelect) {
      onListItemSelect(item);
    }
    setIsExpanded(false);
  }, [onListItemSelect]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const sections = useMemo(() => 
    message.interactive?.action?.sections || [], 
    [message.interactive?.action?.sections]
  );

  return (
    <ListMessage $sent={message.from === 'me' || message.from !== selectedContact.phone_number}>
      <div className="list-header">
        <div className="list-title">
          {message.interactive?.header?.text || 'Select an option'}
        </div>
        <div className="list-description">
          {message.interactive?.body?.text || message.text}
        </div>
      </div>
      
      <button 
        className="list-button"
        onClick={toggleExpanded}
      >
        <span>{message.interactive?.action?.button || 'View options'}</span>
        <ChevronDown 
          size={16} 
          className={`chevron-down transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>
      
      {isExpanded && sections.length > 0 && (
        <div className="list-options">
          {sections.map((section, sectionIndex) => (
            <div key={`section-${sectionIndex}`}>
              {section.title && (
                <div className="section-title">
                  {section.title}
                </div>
              )}
              {section.rows?.map((row, rowIndex) => (
                <div
                  key={`row-${sectionIndex}-${rowIndex}`}
                  className="list-option"
                  onClick={() => handleListSelect(row)}
                >
                  <div className="option-title">{row.title}</div>
                  {row.description && (
                    <div className="option-description">{row.description}</div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      
      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={message.from !== selectedContact.phone_number}
      />
    </ListMessage>
  );
});

export const ButtonMessageComponent = React.memo(({ message, selectedContact, onButtonClick }) => {
  const handleButtonClick = useCallback((button) => {
    if (onButtonClick) {
      onButtonClick(button);
    }
  }, [onButtonClick]);

  const buttons = useMemo(() => 
    message.interactive?.action?.buttons || [], 
    [message.interactive?.action?.buttons]
  );

  const getButtonClass = useCallback((button) => {
    switch (button.type) {
      case 'PHONE_NUMBER': return 'action-button call-button';
      case 'URL': return 'action-button url-button';
      default: return 'action-button reply-button';
    }
  }, []);

  const getButtonIcon = useCallback((button) => {
    switch (button.type) {
      case 'PHONE_NUMBER': return <Phone size={14} style={{ marginRight: '6px' }} />;
      case 'URL': return <ExternalLink size={14} style={{ marginRight: '6px' }} />;
      default: return <MessageCircle size={14} style={{ marginRight: '6px' }} />;
    }
  }, []);

  return (
    <ButtonMessage $sent={message.from === 'me' || message.from !== selectedContact.phone_number}>
      <div className="button-header">
        {message.interactive?.header?.text && (
          <div className="button-title">{message.interactive.header.text}</div>
        )}
        <div className="button-body">
          {message.interactive?.body?.text || message.text}
        </div>
      </div>
      
      {buttons.length > 0 && (
        <div className="button-actions">
          {buttons.map((button, index) => (
            <button
              key={`button-${index}`}
              className={getButtonClass(button)}
              onClick={() => handleButtonClick(button)}
            >
              {getButtonIcon(button)}
              {button.reply?.title || button.text}
            </button>
          ))}
        </div>
      )}
      
      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={message.from !== selectedContact.phone_number}
      />
    </ButtonMessage>
  );
});

export const WelcomeMessageComponent = React.memo(({ message, selectedContact, onWelcomeAction }) => {
  const handleAction = useCallback((action) => {
    if (onWelcomeAction) {
      onWelcomeAction(action);
    }
  }, [onWelcomeAction]);

  const actions = useMemo(() => 
    message.welcome?.actions || [], 
    [message.welcome?.actions]
  );

  return (
    <WelcomeMessage $sent={true}>
      <div className="welcome-content">
        <div className="welcome-icon">
          <MessageCircle size={24} />
        </div>
        <div className="welcome-title">
          {message.welcome?.title || 'Welcome!'}
        </div>
        <div className="welcome-text">
          {message.welcome?.message || message.text || 'Thanks for contacting us. How can we help you today?'}
        </div>
        
        {actions.length > 0 && (
          <div className="welcome-actions">
            {actions.map((action, index) => (
              <button
                key={`welcome-action-${index}`}
                className={`welcome-button ${action.type === 'secondary' ? 'secondary' : ''}`}
                onClick={() => handleAction(action)}
              >
                {action.title}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={message.from !== selectedContact.phone_number}
      />
    </WelcomeMessage>
  );
});

export const FlowMessageComponent = React.memo(({ message, selectedContact, onFlowAction }) => {
  const handleFlowAction = useCallback(() => {
    if (onFlowAction) {
      onFlowAction(message.flow);
    }
  }, [onFlowAction, message.flow]);

  return (
    <FlowMessage $sent={message.from !== selectedContact.phone_number}>
      <div className="flow-content">
        {message.interactive?.header && (
          <div className="flow-header">
            <div className="flow-title">{message.interactive.header.text}</div>
            {message.interactive.header.subtitle && (
              <div className="flow-subtitle">{message.interactive.header.subtitle}</div>
            )}
          </div>
        )}
        
        <div className="flow-body">
          {message.interactive?.body?.text || message.text}
        </div>
        
        {message.interactive?.action && (
          <button 
            className="flow-cta"
            onClick={handleFlowAction}
          >
            <Play size={14} style={{ marginRight: '6px' }} />
            {message.interactive.action.name || 'Continue'}
          </button>
        )}
      </div>
      
      <MessageFooter
        timestamp={message.timestamp}
        status={message.status}
        isSent={message.from !== selectedContact.phone_number}
      />
    </FlowMessage>
  );
});

// Set display names for debugging
ListMessageComponent.displayName = 'ListMessageComponent';
ButtonMessageComponent.displayName = 'ButtonMessageComponent';
WelcomeMessageComponent.displayName = 'WelcomeMessageComponent';
FlowMessageComponent.displayName = 'FlowMessageComponent';
