/**
 * ChatStrip — Bottom-center persistent chat hub.
 *
 * Reduced (44px): online badge + last message preview + input + expand toggle.
 * Expanded (280px): header with channel dropdown + Chat/Online tabs, content area, input.
 * z-150, centered at bottom of viewport.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronUp as ChevronUpIcon, Send, Users } from 'lucide-react';
import { useChatStore } from '../../store/chat-store';
import { useClient } from '../../context';
import type { ChatTab } from '../../store/chat-store';
import styles from './ChatStrip.module.css';

export function ChatStrip() {
  const currentChannel = useChatStore((s) => s.currentChannel);
  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => s.messages);
  const users = useChatStore((s) => s.users);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const isExpanded = useChatStore((s) => s.isExpanded);
  const activeTab = useChatStore((s) => s.activeTab);
  const toggleExpanded = useChatStore((s) => s.toggleExpanded);
  const setCurrentChannel = useChatStore((s) => s.setCurrentChannel);
  const setActiveTab = useChatStore((s) => s.setActiveTab);

  const client = useClient();
  const [input, setInput] = useState('');
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const channelMessages = messages[currentChannel] ?? [];
  const lastMessage = channelMessages[channelMessages.length - 1];
  const visibleMessages = channelMessages.slice(-10);
  const onlineCount = Object.keys(users).length;
  const userList = Object.values(users);

  // Auto-scroll on new messages when expanded in chat tab
  useEffect(() => {
    if (isExpanded && activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channelMessages.length, isExpanded, activeTab]);

  // Close channel dropdown on outside click
  useEffect(() => {
    if (!channelDropdownOpen) return;
    const close = () => setChannelDropdownOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [channelDropdownOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    client.onSendChatMessage(text);
  }, [input, client]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleTabClick = useCallback((tab: ChatTab) => {
    setActiveTab(tab);
  }, [setActiveTab]);

  const handleOnlineBadgeClick = useCallback(() => {
    if (!isExpanded) {
      toggleExpanded();
    }
    setActiveTab('online');
  }, [isExpanded, toggleExpanded, setActiveTab]);

  // Typing indicator text
  const typingText = typingUsers.size > 0
    ? Array.from(typingUsers).slice(0, 3).join(', ') + (typingUsers.size > 3 ? '...' : '') + ' typing...'
    : null;

  return (
    <div className={`${styles.strip} ${isExpanded ? styles.expanded : ''}`}>
      {/* ================= EXPANDED: Header ================= */}
      {isExpanded && (
        <div className={styles.header}>
          {/* Channel dropdown (small, opens upward) */}
          <div className={styles.channelSelect}>
            <button
              className={styles.channelBtn}
              onClick={(e) => {
                e.stopPropagation();
                setChannelDropdownOpen(!channelDropdownOpen);
              }}
            >
              <ChevronUpIcon size={12} />
              {currentChannel || 'Channel'}
            </button>
            {channelDropdownOpen && (
              <div className={styles.channelDropdown}>
                {channels.map((ch) => (
                  <button
                    key={ch}
                    className={`${styles.channelOption} ${ch === currentChannel ? styles.channelOptionActive : ''}`}
                    onClick={() => {
                      setCurrentChannel(ch);
                      setChannelDropdownOpen(false);
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tab switcher */}
          <div className={styles.tabGroup}>
            <button
              className={activeTab === 'chat' ? styles.tabActive : styles.tab}
              onClick={() => handleTabClick('chat')}
            >
              Chat
            </button>
            <button
              className={activeTab === 'online' ? styles.tabActive : styles.tab}
              onClick={() => handleTabClick('online')}
            >
              <Users size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              Online ({onlineCount})
            </button>
          </div>

          {/* Collapse */}
          <button
            className={styles.collapseBtn}
            onClick={toggleExpanded}
            aria-label="Collapse chat"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      )}

      {/* ================= EXPANDED: Chat messages ================= */}
      {isExpanded && activeTab === 'chat' && (
        <div className={styles.messageArea}>
          {visibleMessages.map((msg) => (
            <div
              key={msg.id}
              className={`${styles.message} ${msg.isSystem ? styles.system : ''} ${msg.isGM ? styles.gm : ''}`}
            >
              {!msg.isSystem && (
                <span className={styles.sender}>{msg.from}: </span>
              )}
              <span className={styles.text}>{msg.text}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ================= EXPANDED: Online user list ================= */}
      {isExpanded && activeTab === 'online' && (
        <div className={styles.userList}>
          {userList.length > 0 ? (
            userList.map((user) => (
              <div key={user.id} className={styles.userRow}>
                <span className={`${styles.statusDot} ${user.status === 1 ? styles.statusDotTyping : ''}`} />
                <span className={styles.userName}>{user.name}</span>
                {user.status === 1 && <span className={styles.typingLabel}>typing...</span>}
              </div>
            ))
          ) : (
            <div className={styles.emptyUsers}>No users online</div>
          )}
        </div>
      )}

      {/* ================= REDUCED: Preview row ================= */}
      {!isExpanded && (
        <div className={styles.reducedRow}>
          {/* Online badge */}
          <div
            className={styles.onlineBadge}
            onClick={handleOnlineBadgeClick}
            title="View online users"
          >
            <span className={styles.onlineDot} />
            <span>{onlineCount}</span>
          </div>

          {/* Last message preview */}
          {lastMessage ? (
            <div className={styles.preview} onClick={toggleExpanded}>
              <span className={styles.previewSender}>{lastMessage.from}:</span>
              <span className={styles.previewText}>{lastMessage.text}</span>
            </div>
          ) : (
            <div className={styles.preview} onClick={toggleExpanded}>
              <span className={styles.previewText}>No messages yet</span>
            </div>
          )}

          {/* Expand button */}
          <button
            className={styles.expandBtn}
            onClick={toggleExpanded}
            aria-label="Expand chat"
          >
            <ChevronUp size={14} />
          </button>
        </div>
      )}

      {/* ================= INPUT ROW (always visible) ================= */}
      <div className={styles.inputRow}>
        {typingText && <span className={styles.typing}>{typingText}</span>}

        {/* Online badge in expanded mode */}
        {isExpanded && (
          <div className={styles.onlineBadge} onClick={() => handleTabClick('online')}>
            <span className={styles.onlineDot} />
            <span>{onlineCount}</span>
          </div>
        )}

        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim()}
          aria-label="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
