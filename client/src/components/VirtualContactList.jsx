import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ContactItem } from './ChatStyles';
import { Tag } from 'lucide-react';
import dayjs from 'dayjs';

const VirtualContactList = ({
  contacts,
  selectedContact,
  onContactSelect,
  tags,
  hasMore,
  onLoadMore,
  loading
}) => {
  const containerRef = useRef(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 30 });
  const loadingRef = useRef(false);
  
  const ITEM_HEIGHT = 72; // Approximate height of each contact item
  const BUFFER = 10; // Extra items to render above/below viewport
  const LOAD_THRESHOLD = 400; // Load more when 400px from bottom

  // ✅ IMPROVED: Better scroll handler with debouncing
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, clientHeight, scrollHeight } = containerRef.current;
    
    // Calculate visible range
    const start = Math.floor(scrollTop / ITEM_HEIGHT);
    const end = Math.ceil((scrollTop + clientHeight) / ITEM_HEIGHT) + BUFFER;

    setVisibleRange({ 
      start: Math.max(0, start - BUFFER), 
      end: Math.min(contacts.length, end) 
    });

    // ✅ Load more when near bottom
    const scrollBottom = scrollTop + clientHeight;
    const distanceFromBottom = scrollHeight - scrollBottom;
    
    console.log('📊 Scroll Debug:', {
      scrollTop,
      scrollBottom,
      scrollHeight,
      distanceFromBottom,
      hasMore,
      loading: loadingRef.current
    });

    if (distanceFromBottom < LOAD_THRESHOLD && hasMore && !loadingRef.current && !loading) {
      console.log('🔄 Loading more contacts...');
      loadingRef.current = true;
      onLoadMore();
      
      // Reset loading flag after 1 second
      setTimeout(() => {
        loadingRef.current = false;
      }, 1000);
    }
  }, [contacts.length, hasMore, loading, onLoadMore, ITEM_HEIGHT, BUFFER, LOAD_THRESHOLD]);

  // ✅ Debounced scroll handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timeoutId = null;
    
    const debouncedScroll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleScroll, 100);
    };

    container.addEventListener('scroll', debouncedScroll);
    handleScroll(); // Initial call

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      container.removeEventListener('scroll', debouncedScroll);
    };
  }, [handleScroll]);

  // ✅ Reset loading ref when loading prop changes
  useEffect(() => {
    if (!loading) {
      loadingRef.current = false;
    }
  }, [loading]);

  const visibleContacts = contacts.slice(visibleRange.start, visibleRange.end);
  const offsetY = visibleRange.start * ITEM_HEIGHT;
  const totalHeight = contacts.length * ITEM_HEIGHT;

  console.log('🎨 Render Debug:', {
    totalContacts: contacts.length,
    visibleRange,
    visibleCount: visibleContacts.length,
    hasMore,
    loading
  });

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        position: 'relative',
        WebkitOverflowScrolling: 'touch' // ✅ Smooth scrolling on iOS
      }}
    >
      {/* ✅ Spacer to create scrollable area */}
      <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
        
        {/* ✅ Visible items with proper positioning */}
        <div 
          style={{ 
            transform: `translateY(${offsetY}px)`,
            willChange: 'transform' // ✅ Performance optimization
          }}
        >
          {visibleContacts.map((contact) => (
            <ContactItem
              key={contact._id}
              selected={selectedContact?._id === contact._id}
              onClick={() => onContactSelect(contact)}
              style={{ minHeight: `${ITEM_HEIGHT}px` }} // ✅ Ensure consistent height
            >
              <div className="avatar">
                {contact.profile_name?.[0]?.toUpperCase() ||
                  contact.name?.[0]?.toUpperCase() ||
                  contact.phone_number?.[0] ||
                  '?'}
              </div>

              <div className="contact-details">
                <div className="contact-name">
                  <span className="truncate" style={{ maxWidth: '180px' }}>
                    {contact.profile_name || contact.name || contact.phone_number || 'Unknown'}
                  </span>

                  {contact.tags && contact.tags.length > 0 && (
                    <>
                      {contact.tags.slice(0, 1).map((tagId) => {
                        const tag = tags.find((t) => t._id === tagId);
                        if (!tag) return null;
                        return (
                          <Tag
                            key={tagId}
                            size={14}
                            className="inline-block ml-1.5"
                            style={{
                              color: tag.color,
                              verticalAlign: 'middle',
                              marginBottom: '2px',
                            }}
                            title={tag.name}
                          />
                        );
                      })}
                    </>
                  )}

                  {contact.humanAgentRequested && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 ml-2"
                      style={{ verticalAlign: 'middle' }}
                    >
                      Team
                    </span>
                  )}
                </div>

                <div className="last-message">{contact.lastMessage || 'No messages'}</div>
              </div>

              <div className="timestamp-notification">
                <span className="text-xs text-gray-500">
                  {contact.timestamp ? dayjs(contact.timestamp).format('hh:mm A') : ''}
                </span>

                {contact.unreadCount > 0 && (
                  <div
                    style={{
                      backgroundColor: '#25D366',
                      color: 'white',
                      borderRadius: '50%',
                      padding: '2px 6px',
                      fontSize: '12px',
                      minWidth: '20px',
                      textAlign: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    {contact.unreadCount}
                  </div>
                )}
              </div>
            </ContactItem>
          ))}
        </div>
      </div>

      {/* ✅ Loading indicator at bottom */}
      {loading && (
        <div 
          style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'white',
            padding: '16px',
            textAlign: 'center',
            borderTop: '1px solid #e5e7eb',
            zIndex: 10
          }}
        >
          <div className="flex justify-center items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-500" />
            <span className="text-sm text-gray-600">Loading more contacts...</span>
          </div>
        </div>
      )}

      {/* ✅ End of list indicator */}
      {!hasMore && contacts.length > 0 && !loading && (
        <div 
          style={{
            padding: '16px',
            textAlign: 'center',
            color: '#9ca3af',
            fontSize: '13px'
          }}
        >
          No more contacts to load
        </div>
      )}
    </div>
  );
};

export default VirtualContactList;
