// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, Paper, Typography, TextField, IconButton, 
  Avatar, Stack, Chip, Fade, CircularProgress, useTheme 
} from '@mui/material';
import { 
  MessageSquareDot, Send, Sparkles, X, 
  Bot, User, ChevronRight, Terminal 
} from 'lucide-react';
import type { RVViewerPlugin } from '../core/rv-plugin';
import type { RVViewer } from '../core/rv-viewer';
import type { UISlotEntry, UISlotProps } from '../core/rv-ui-plugin';
import type { LoadResult } from '../core/engine/rv-scene-loader';

// ─── Types ───

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  status?: 'sending' | 'thought' | 'executing';
}

// ─── UI Component ───

const AIAssistantUI: React.FC<UISlotProps> = ({ viewer }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      id: '1', 
      sender: 'ai', 
      text: "Hello! I am your Simam Digital Twin Assistant. How can I help you optimize your operations today?", 
      timestamp: new Date() 
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // Simulate AI Processing & Command Dispatch
    setTimeout(() => {
      processCommand(userMsg.text);
    }, 1000);
  };

  const processCommand = (text: string) => {
    const input = text.toLowerCase();
    let response = "I'm not sure how to handle that command yet. I can help find components, check status, or trigger manual overrides.";
    
    // Simple intent detection (Mock)
    if (input.includes('status') || input.includes('health') || input.includes('part count')) {
      const stats = viewer.getPlugin<any>('maintenance-insight');
      response = "System health is currently at 94%. We've processed 1,284 units today with an MTBF prediction of 4,120 hours.";
    } 
    else if (input.includes('go to') || input.includes('show me') || input.includes('find')) {
      // Find component in registry
      const term = text.split(' ').pop() || '';
      const results = viewer.registry?.search(term) ?? [];
      if (results.length > 0) {
        const node = results[0].node;
        viewer.fitToNodes([node]);
        viewer.highlighter.highlight(node, true);
        response = `Taking you to ${results[0].path}. I've highlighted it for you.`;
      } else {
        response = `I couldn't find a component named "${term}". Try searching for specific machine IDs.`;
      }
    }
    else if (input.includes('reset') || input.includes('restart')) {
      void viewer.reloadModel();
      response = "Simulation state has been reset to initial parameters.";
    }

    const aiMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: response,
      timestamp: new Date()
    };

    setIsTyping(false);
    setMessages(prev => [...prev, aiMsg]);
  };

  if (!open) {
    return (
      <IconButton 
        onClick={() => setOpen(true)}
        sx={{ 
          bgcolor: '#7b52ee', // Simam Purple
          color: 'white',
          boxShadow: '0 4px 20px rgba(123, 82, 238, 0.4)',
          '&:hover': { bgcolor: '#6a44d1' }
        }}
      >
        <MessageSquareDot size={24} />
      </IconButton>
    );
  }

  return (
    <Fade in={open}>
      <Paper
        className="glass"
        sx={{
          width: 380,
          height: 500,
          display: 'flex',
          flexDirection: 'column',
          borderTop: '2px solid #7b52ee',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'rgba(123, 82, 238, 0.1)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ width: 32, height: 32, bgcolor: '#7b52ee' }}>
              <Bot size={18} />
            </Avatar>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1 }}>Simam AI</Typography>
              <Typography variant="caption" sx={{ color: '#4caf50', fontSize: '0.65rem' }}>● Online & Monitoring</Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'rgba(255,255,255,0.4)' }}>
            <X size={18} />
          </IconButton>
        </Box>

        {/* Messages */}
        <Box 
          ref={scrollRef}
          sx={{ 
            flexGrow: 1, 
            p: 2, 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 2,
            bgcolor: 'rgba(0,0,0,0.1)'
          }}
        >
          {messages.map((msg) => (
            <Box 
              key={msg.id}
              sx={{ 
                alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%'
              }}
            >
              <Paper
                sx={{
                  p: 1.5,
                  borderRadius: msg.sender === 'user' ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                  bgcolor: msg.sender === 'user' ? '#7b52ee' : 'rgba(255,255,255,0.05)',
                  color: 'white',
                  border: msg.sender === 'ai' ? '1px solid rgba(255,255,255,0.1)' : 'none'
                }}
              >
                <Typography variant="body2" sx={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
                  {msg.text}
                </Typography>
              </Paper>
              <Typography variant="caption" sx={{ mt: 0.5, px: 1, color: 'rgba(255,255,255,0.3)', fontSize: '0.65rem', display: 'block' }}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Typography>
            </Box>
          ))}
          {isTyping && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', ml: 1 }}>
              <CircularProgress size={12} sx={{ color: '#7b52ee' }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Thinking...</Typography>
            </Box>
          )}
        </Box>

        {/* Input */}
        <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <Stack direction="row" spacing={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Type a command..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              autoComplete="off"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 4,
                  bgcolor: 'rgba(0,0,0,0.2)',
                  fontSize: '0.85rem'
                }
              }}
            />
            <IconButton 
              onClick={handleSend}
              disabled={!inputValue.trim()}
              sx={{ bgcolor: '#7b52ee', color: 'white', '&:hover': { bgcolor: '#6a44d1' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <Send size={18} />
            </IconButton>
          </Stack>
          <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {['Status', 'Find Motor', 'Part Count'].map(tag => (
              <Chip 
                key={tag}
                label={tag} 
                size="small" 
                onClick={() => setInputValue(tag)}
                sx={{ 
                  fontSize: '0.65rem', 
                  bgcolor: 'rgba(123, 82, 238, 0.1)', 
                  color: '#7b52ee',
                  border: '1px solid rgba(123, 82, 238, 0.2)',
                  '&:hover': { bgcolor: 'rgba(123, 82, 238, 0.2)' }
                }} 
              />
            ))}
          </Box>
        </Box>
      </Paper>
    </Fade>
  );
};

// ─── Plugin Implementation ───

export class AIAssistantPlugin implements RVViewerPlugin {
  readonly id = 'ai-assistant';
  readonly order = 1000;

  readonly slots: UISlotEntry[] = [
    {
      slot: 'toolbar-button',
      order: 10,
      component: AIAssistantUI,
    }
  ];

  onModelLoaded(_result: LoadResult, viewer: RVViewer): void {}
}
