/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  Menu, 
  MoreVertical, 
  Sparkles, 
  Languages, 
  Info, 
  X, 
  Leaf, 
  FileText, 
  BookOpen,
  Paperclip,
  File
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { BHARAT_AI_PERSONA, BHARAT_AI_FEATURES, SYSTEM_INSTRUCTION } from './constants/persona';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const AshokaChakra = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={cn("text-bharat-chakra", className)}>
    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="50" cy="50" r="8" fill="currentColor" />
    {[...Array(24)].map((_, i) => (
      <line
        key={i}
        x1="50"
        y1="50"
        x2={50 + 40 * Math.cos((i * 15 * Math.PI) / 180)}
        y2={50 + 40 * Math.sin((i * 15 * Math.PI) / 180)}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    ))}
    <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1,2" />
  </svg>
);

const BHARAT_LANGUAGES = [
  { lang: "English", text: "Bharat" },
  { lang: "Hindi", text: "भारत" },
  { lang: "Tamil", text: "பாரதம்" },
  { lang: "Telugu", text: "భారత్" },
  { lang: "Bengali", text: "ভারত" },
  { lang: "Marathi", text: "भारत" },
  { lang: "Gujarati", text: "ભારત" },
  { lang: "Kannada", text: "ಭಾರತ" },
  { lang: "Malayalam", text: "ഭാരതം" },
  { lang: "Punjabi", text: "ਭਾਰਤ" },
  { lang: "Odia", text: "ଭାରତ" },
];

export default function App() {
  const [langIndex, setLangIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Namaste! I am Bharat AI, your assistant. How can I help you today?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string, type: string, data: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLangIndex((prev) => (prev + 1) % BHARAT_LANGUAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedFiles(prev => [...prev, {
          name: file.name,
          type: file.type,
          data: base64
        }]);
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input + (attachedFiles.length > 0 ? `\n\n[Attached Files: ${attachedFiles.map(f => f.name).join(', ')}]` : ''),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    const currentFiles = [...attachedFiles];
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const contents = [];
      
      // Add previous messages for context
      messages.forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      });

      // Add current message with files
      const currentParts: any[] = [{ text: input }];
      
      currentFiles.forEach(file => {
        const [mimeType, base64Data] = file.data.split(';base64,');
        currentParts.push({
          inlineData: {
            mimeType: file.type || 'application/octet-stream',
            data: base64Data
          }
        });
      });

      contents.push({
        role: 'user',
        parts: currentParts
      });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION
        }
      });
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text || "I'm sorry, I couldn't process that.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I encountered an error while processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-sans relative">
      {/* Background Overlay for better readability if needed, but the gradient is the primary look */}
      <div className="absolute inset-0 bg-white/10 pointer-events-none" />

      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 glass-card border-r border-white/20 z-50 p-6 flex flex-col gap-8"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl chakra-logo flex items-center justify-center p-1.5 bg-white">
                    <AshokaChakra className="w-full h-full animate-chakra" />
                  </div>
                  <span className="font-black text-bharat-blue tracking-tight">Advanced Settings</span>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8 pr-2">
                <section>
                  <h3 className="text-[10px] font-black text-bharat-saffron uppercase tracking-[0.2em] mb-4">Language Preferences</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {BHARAT_LANGUAGES.map((l, i) => (
                      <button
                        key={l.lang}
                        onClick={() => setLangIndex(i)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-bold transition-all border",
                          langIndex === i 
                            ? "bg-bharat-blue text-white border-bharat-blue shadow-md" 
                            : "bg-white/10 border-white/20 text-slate-600 hover:bg-white/30"
                        )}
                      >
                        {l.lang}
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black text-bharat-green uppercase tracking-[0.2em] mb-4">AI Capabilities</h3>
                  <div className="space-y-3">
                    {[
                      { icon: <Sparkles size={16} />, title: "Creative Mode", desc: "Enhanced poetic & artistic output" },
                      { icon: <Languages size={16} />, title: "Polyglot Engine", desc: "Real-time translation across 22 languages" },
                      { icon: <BookOpen size={16} />, title: "Vedic Wisdom", desc: "Access to ancient Indian scriptures" },
                    ].map((feat, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-white/10 border border-white/20">
                        <div className="p-2 bg-white/20 rounded-lg text-bharat-blue">
                          {feat.icon}
                        </div>
                        <div>
                          <div className="text-xs font-black text-slate-800">{feat.title}</div>
                          <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{feat.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">System Status</h3>
                  <div className="p-4 rounded-2xl bg-bharat-blue/5 border border-bharat-blue/10 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500">Uptime</span>
                      <span className="text-[10px] font-black text-green-600">99.9%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500">Latency</span>
                      <span className="text-[10px] font-black text-bharat-blue">142ms</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-500">Region</span>
                      <span className="text-[10px] font-black text-bharat-saffron">Asia-South</span>
                    </div>
                  </div>
                </section>
              </div>

              <div className="pt-6 border-t border-white/20 flex flex-col gap-4">
                <button 
                  onClick={() => setShowInfo(true)}
                  className="flex items-center gap-3 text-slate-600 hover:text-bharat-blue transition-colors"
                >
                  <Info size={18} />
                  <span className="text-xs font-black uppercase tracking-wider">About Bharat AI</span>
                </button>
                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest text-center">
                  Version 2.4.0-Alpha
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="px-6 py-8 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="w-12 h-12 glass-card rounded-xl flex items-center justify-center text-bharat-blue shadow-sm hover:scale-105 active:scale-95 transition-transform"
          >
            <Menu size={28} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl chakra-logo flex items-center justify-center p-2 bg-white">
              <AshokaChakra className="w-full h-full animate-chakra" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-black text-bharat-blue tracking-tight leading-none flex items-center gap-1">
                <div className="relative h-7 overflow-hidden min-w-[80px]">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={langIndex}
                      initial={{ rotateX: -90, opacity: 0 }}
                      animate={{ rotateX: 0, opacity: 1 }}
                      exit={{ rotateX: 90, opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                      className="absolute inset-0 flex items-center"
                    >
                      {BHARAT_LANGUAGES[langIndex].text}
                    </motion.span>
                  </AnimatePresence>
                </div>
                <span>AI</span>
              </h1>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-green-700 uppercase tracking-wider">Online & Ready</span>
                </div>
                <div className="h-4 w-[1px] bg-slate-300" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none">Developed By</span>
                  <span className="text-[10px] font-black text-bharat-saffron uppercase tracking-wider">Ayush</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 px-6 py-4 space-y-8 z-10">
        <div className="flex justify-center">
          <div className="px-6 py-2 glass-card rounded-full text-xs font-medium text-slate-500 shadow-sm">
            Today
          </div>
        </div>

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
            >
              <div className={cn(
                "w-full py-2",
                message.role === 'user' ? "text-right" : "text-left"
              )}>
                <div className={cn(
                  "prose prose-sm max-w-none",
                  message.role === 'user' ? "prose-slate inline-block text-left bg-bharat-blue/5 px-4 py-2 rounded-2xl border border-bharat-blue/10" : "prose-slate"
                )}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full py-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full glass-card flex items-center justify-center p-1 shrink-0 shadow-sm">
                <AshokaChakra className="w-full h-full animate-chakra-spin" />
              </div>
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-bharat-blue rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-bharat-blue rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-bharat-blue rounded-full animate-bounce" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="p-6 z-10 flex flex-col items-center gap-6">
        <div className="w-full max-w-2xl flex flex-col gap-4">
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2">
              <AnimatePresence>
                {attachedFiles.map((file, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700"
                  >
                    <File size={14} className="text-bharat-blue" />
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button onClick={() => removeFile(idx)} className="hover:text-red-500 transition-colors">
                      <X size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex-1 glass-card rounded-full px-6 py-4 flex items-center gap-4 shadow-lg">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                multiple 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-slate-400 hover:text-bharat-blue transition-colors"
              >
                <Paperclip size={20} />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your message..."
                className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 font-medium"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
              className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl",
                (!input.trim() && attachedFiles.length === 0) || isLoading
                  ? "bg-white/50 text-slate-300 cursor-not-allowed"
                  : "bg-white text-bharat-blue hover:scale-105 active:scale-95"
              )}
            >
              <Send size={28} className="rotate-[-15deg] translate-x-0.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.2em] uppercase">
            <span className="text-bharat-blue">Make in</span>
            <span className="text-bharat-saffron">Bharat</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.2em] uppercase">
            <span className="text-slate-400">Made by</span>
            <span className="text-bharat-green">Bharatiya</span>
          </div>
        </div>
      </footer>

      {/* Info Modal - Kept from previous version but styled to match */}
      <AnimatePresence>
        {showInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  About {BHARAT_AI_PERSONA.name}
                </h2>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 space-y-8">
                <section>
                  <h3 className="text-sm font-bold text-bharat-saffron uppercase tracking-widest mb-3">Our Purpose</h3>
                  <p className="text-slate-600 leading-relaxed">{BHARAT_AI_PERSONA.corePurpose}</p>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-bharat-green uppercase tracking-widest mb-4">Core Traits</h3>
                  <div className="flex flex-wrap gap-2">
                    {BHARAT_AI_PERSONA.traits.map(trait => (
                      <span key={trait} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-medium">
                        {trait}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-bharat-blue uppercase tracking-widest mb-4">Unique Capabilities</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {BHARAT_AI_FEATURES.map((feature, idx) => (
                      <div key={idx} className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:border-bharat-saffron/30 transition-colors">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-white rounded-lg shadow-sm text-bharat-saffron">
                            {feature.icon === 'Sparkles' && <Sparkles size={18} />}
                            {feature.icon === 'Languages' && <Languages size={18} />}
                            {feature.icon === 'Leaf' && <Leaf size={18} />}
                            {feature.icon === 'FileText' && <FileText size={18} />}
                            {feature.icon === 'BookOpen' && <BookOpen size={18} />}
                          </div>
                          <h4 className="font-bold text-slate-800 text-sm">{feature.title}</h4>
                        </div>
                        <p className="text-xs text-slate-500 leading-normal">{feature.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
