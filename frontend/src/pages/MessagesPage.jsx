import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Sparkles, User } from 'lucide-react';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import useFetch from '../hooks/useFetch';
import { getConversations, getThread, sendMessage } from '../services/messageService';
import { formatRelative, getInitials, fullName } from '../utils/formatters';
import { useAuth } from '../context/AuthContext';

const ConversationItem = ({ conv, active, onClick }) => {
  const lastMessage = conv.messages?.[0];
  const participant = conv.participants?.[0]?.tenant;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-slate-100 hover:bg-surface-50 transition-colors ${active ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''}`}
    >
      <div className="w-9 h-9 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
        {getInitials(participant?.firstName, participant?.lastName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {participant?.firstName} {participant?.lastName}
          </p>
          {lastMessage && (
            <span className="text-xs text-slate-400 flex-shrink-0">
              {formatRelative(lastMessage.createdAt)}
            </span>
          )}
        </div>
        {conv.subject && (
          <p className="text-xs text-slate-500 truncate mt-0.5">{conv.subject}</p>
        )}
        {lastMessage && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{lastMessage.body}</p>
        )}
      </div>
    </button>
  );
};

const MessageBubble = ({ message, isOwn }) => {
  const senderProfile = isOwn
    ? message.sender?.landlordProfile
    : message.sender?.tenantProfile;
  const name = senderProfile ? `${senderProfile.firstName} ${senderProfile.lastName}` : 'Unknown';

  return (
    <div className={`flex gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isOwn ? 'bg-brand-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
        {getInitials(senderProfile?.firstName, senderProfile?.lastName)}
      </div>
      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
        <p className={`text-xs text-slate-400 mb-1 ${isOwn ? 'text-right' : ''}`}>{name}</p>
        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isOwn ? 'bg-brand-500 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-card'}`}>
          {message.body}
        </div>
        <p className="text-xs text-slate-400 mt-1">{formatRelative(message.createdAt)}</p>
      </div>
    </div>
  );
};

const MessagesPage = () => {
  const { user } = useAuth();
  const [activeConvId, setActiveConvId] = useState(null);
  const [threadData, setThreadData] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const { data, loading, refetch } = useFetch(getConversations);
  const conversations = data?.conversations || [];

  const loadThread = async (convId) => {
    setActiveConvId(convId);
    setLoadingThread(true);
    try {
      const data = await getThread(convId);
      setThreadData(data);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    if (conversations.length > 0 && !activeConvId) {
      loadThread(conversations[0].id);
    }
  }, [conversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadData?.messages]);

  const handleSend = async () => {
    if (!messageText.trim() || !activeConvId || sending) return;
    setSending(true);
    try {
      await sendMessage(activeConvId, { body: messageText.trim() });
      setMessageText('');
      const updated = await getThread(activeConvId);
      setThreadData(updated);
      refetch();
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><LoadingSpinner size="lg" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Messages</h1>
          <p className="text-slate-500 text-sm mt-1">{conversations.length} conversations</p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden flex" style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
        {/* Conversation list */}
        <div className="w-72 flex-shrink-0 border-r border-slate-100 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversations</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No conversations</p>
            ) : (
              conversations.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  active={conv.id === activeConvId}
                  onClick={() => loadThread(conv.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!activeConvId ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState icon={MessageSquare} title="Select a conversation" description="Choose a conversation from the left to start messaging." />
            </div>
          ) : loadingThread ? (
            <div className="flex-1 flex items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <>
              {/* Thread header */}
              {threadData?.conversation && (
                <div className="px-5 py-3.5 border-b border-slate-100 bg-white">
                  <p className="font-semibold text-slate-800">
                    {threadData.conversation.participants?.[0]?.tenant?.firstName}{' '}
                    {threadData.conversation.participants?.[0]?.tenant?.lastName}
                  </p>
                  {threadData.conversation.subject && (
                    <p className="text-xs text-slate-400 mt-0.5">{threadData.conversation.subject}</p>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-surface-50">
                {(threadData?.messages || []).map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    isOwn={msg.sender?.id === user?.id}
                  />
                ))}
                <div ref={bottomRef} />
              </div>

              {/* AI suggestion placeholder */}
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 flex items-center gap-2">
                <Sparkles size={13} className="text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700">AI reply suggestions coming soon</p>
              </div>

              {/* Input */}
              <div className="p-4 border-t border-slate-100 bg-white flex items-end gap-3">
                <textarea
                  rows={2}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Enter to send)"
                  className="input flex-1 resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending}
                  className="btn-primary flex-shrink-0 h-10 w-10 p-0 justify-center"
                >
                  {sending ? <LoadingSpinner size="sm" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessagesPage;
