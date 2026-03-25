/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
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
  File,
  Mic,
  MicOff,
  Plus,
  Trash2,
  MessageSquare,
  LogIn,
  LogOut,
  User as UserIcon,
  Volume2,
  VolumeX,
  Play,
  Image as ImageIcon,
  Download
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { BHARAT_AI_PERSONA, BHARAT_AI_FEATURES, SYSTEM_INSTRUCTION } from './constants/persona';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup,
  signOut, 
  onAuthStateChanged, 
  FirebaseUser,
  handleFirestoreError,
  OperationType
} from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc,
  Timestamp,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { Modality } from "@google/genai";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  detectedLanguage?: string;
  imageUrl?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: Date;
}

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, errorInfo: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center">
          <div className="max-w-md glass-card p-8 rounded-3xl shadow-xl">
            <h1 className="text-2xl font-black text-red-600 mb-4">Something went wrong</h1>
            <p className="text-slate-600 mb-6">We encountered an unexpected error. Please try refreshing the page.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-bharat-blue text-white rounded-2xl font-bold shadow-lg hover:scale-105 transition-transform"
            >
              Refresh Page
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-6 p-4 bg-black/5 rounded-xl text-left text-[10px] overflow-auto max-h-40 text-slate-500">
                {this.state.errorInfo}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const AshokaChakra = ({ className, spin = false }: { className?: string, spin?: boolean }) => (
  <motion.svg 
    viewBox="0 0 100 100" 
    className={cn("text-bharat-chakra", className)}
    animate={{ rotate: 360 }}
    transition={{ duration: spin ? 3 : 20, repeat: Infinity, ease: "linear" }}
  >
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
  </motion.svg>
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
  return (
    <ErrorBoundary>
      <BharatAIApp />
    </ErrorBoundary>
  );
}

function BharatAIApp() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [langIndex, setLangIndex] = useState(0);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Namaste! I am Bharat AI, your assistant. I can understand and speak in many Indian languages. How can I help you today?',
      timestamp: new Date(),
      detectedLanguage: 'Multilingual'
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string, type: string, data: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isImageMode, setIsImageMode] = useState(false);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setLangIndex((prev) => (prev + 1) % BHARAT_LANGUAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Auth state listener
  useEffect(() => {
    console.log("Setting up auth listener...");
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("Auth state changed:", firebaseUser ? firebaseUser.email : "No user");
      setUser(firebaseUser);
      setIsAuthReady(true);
      
      if (firebaseUser) {
        // Create or update user profile in Firestore
        const userRef = doc(db, 'users', firebaseUser.uid);
        setDoc(userRef, {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          role: 'user',
          createdAt: Timestamp.now()
        }, { merge: true }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`));
      } else {
        // Reset state on logout
        setSessions([]);
        setCurrentSessionId(null);
        setMessages([
          {
            id: '1',
            role: 'assistant',
            content: 'Namaste! I am Bharat AI, your assistant. I can understand and speak in many Indian languages. How can I help you today?',
            timestamp: new Date(),
            detectedLanguage: 'Multilingual'
          },
        ]);
      }
    });

    // Remove getRedirectResult logic as we are switching to signInWithPopup
    return () => unsubscribe();
  }, []);

  // Load sessions from Firestore
  useEffect(() => {
    if (!user) return;

    const sessionsRef = collection(db, 'users', user.uid, 'sessions');
    const q = query(sessionsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedSessions: ChatSession[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title,
          timestamp: data.timestamp.toDate(),
          messages: [] // Messages will be loaded per session
        };
      });
      setSessions(loadedSessions);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/sessions`));

    return () => unsubscribe();
  }, [user]);

  // Load messages for current session from Firestore
  useEffect(() => {
    if (!user || !currentSessionId) return;

    const messagesRef = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty && messages.length === 0) {
        // Initial welcome message if no messages exist
        setMessages([
          {
            id: '1',
            role: 'assistant',
            content: 'Namaste! I am Bharat AI, your assistant. I can understand and speak in many Indian languages. How can I help you today?',
            timestamp: new Date(),
            detectedLanguage: 'Multilingual'
          },
        ]);
        return;
      }

      const loadedMessages: Message[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          role: data.role,
          content: data.content,
          timestamp: data.timestamp.toDate(),
          detectedLanguage: data.detectedLanguage,
          imageUrl: data.imageUrl
        };
      });
      setMessages(loadedMessages);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/sessions/${currentSessionId}/messages`));

    return () => unsubscribe();
  }, [user, currentSessionId]);

  const handleLogin = async () => {
    console.log("Login button clicked");
    setLoginError("Opening Google login...");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        console.log("Popup login successful", result.user.email);
        setLoginError(null);
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/unauthorized-domain') {
        const projectId = auth.app.options.projectId;
        setLoginError(`Domain not authorized. Please add "${window.location.hostname}" to the Authorized Domains list in your Firebase project: "${projectId}".`);
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("Login popup was blocked. Please allow popups for this site.");
      } else {
        setLoginError(error.message || "Login failed to start");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const playTTS = async (messageId: string, text: string) => {
    if (isPlaying === messageId) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(null);
      }
      return;
    }

    setIsPlaying(messageId);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Speak this clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();
          audioRef.current.onended = () => setIsPlaying(null);
        } else {
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.play();
          audio.onended = () => setIsPlaying(null);
        }
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setIsPlaying(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const startNewChat = async () => {
    if (!user) {
      setMessages([
        {
          id: '1',
          role: 'assistant',
          content: 'Namaste! I am Bharat AI, your assistant. I can understand and speak in many Indian languages. How can I help you today?',
          timestamp: new Date(),
          detectedLanguage: 'Multilingual'
        },
      ]);
      setCurrentSessionId(null);
      setIsSidebarOpen(false);
      return;
    }

    const newSessionId = Date.now().toString();
    const sessionRef = doc(db, 'users', user.uid, 'sessions', newSessionId);
    
    try {
      await setDoc(sessionRef, {
        id: newSessionId,
        userId: user.uid,
        title: 'New Chat',
        timestamp: Timestamp.now()
      });
      
      const welcomeMsgId = '1';
      const welcomeMsgRef = doc(db, 'users', user.uid, 'sessions', newSessionId, 'messages', welcomeMsgId);
      await setDoc(welcomeMsgRef, {
        id: welcomeMsgId,
        sessionId: newSessionId,
        role: 'assistant',
        content: 'Namaste! I am Bharat AI, your assistant. I can understand and speak in many Indian languages. How can I help you today?',
        timestamp: Timestamp.now(),
        detectedLanguage: 'Multilingual'
      });

      setCurrentSessionId(newSessionId);
      setIsSidebarOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/sessions/${newSessionId}`);
    }
  };

  const switchSession = (id: string) => {
    setCurrentSessionId(id);
    setIsSidebarOpen(false);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!user) return;

    try {
      const sessionRef = doc(db, 'users', user.uid, 'sessions', id);
      await deleteDoc(sessionRef);
      
      if (currentSessionId === id) {
        setCurrentSessionId(null);
        setMessages([
          {
            id: '1',
            role: 'assistant',
            content: 'Namaste! I am Bharat AI, your assistant. I can understand and speak in many Indian languages. How can I help you today?',
            timestamp: new Date(),
            detectedLanguage: 'Multilingual'
          },
        ]);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/sessions/${id}`);
    }
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

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Voice input is not supported in your browser. Please try Chrome or Edge.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN'; // Default to Indian English

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
    };

    recognition.onerror = (event: any) => {
      // Handle 'no-speech' error gracefully
      if (event.error === 'no-speech') {
        console.warn("No speech was detected. Please try again.");
      } else {
        console.error("Speech recognition error:", event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start recognition:", err);
      setIsListening(false);
    }
  };

  const handleDownloadImage = async (imageUrl: string, messageId: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bharat-ai-image-${messageId}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  const handleSend = async () => {
    const currentInput = input.trim();
    const currentFiles = [...attachedFiles];
    
    if ((!currentInput && currentFiles.length === 0) || (isImageMode && !currentInput) || isLoading) return;

    let activeSessionId = currentSessionId;
    
    // Create a new session if none exists and user is logged in
    if (!activeSessionId && user) {
      activeSessionId = Date.now().toString();
      const sessionRef = doc(db, 'users', user.uid, 'sessions', activeSessionId);
      try {
        await setDoc(sessionRef, {
          id: activeSessionId,
          userId: user.uid,
          title: currentInput.slice(0, 30) || 'New Chat',
          timestamp: Timestamp.now()
        });
        setCurrentSessionId(activeSessionId);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/sessions/${activeSessionId}`);
      }
    } else if (activeSessionId && user) {
      // Update title if it's the first user message in a "New Chat"
      const session = sessions.find(s => s.id === activeSessionId);
      if (session && session.title === 'New Chat' && messages.length <= 1) {
        const sessionRef = doc(db, 'users', user.uid, 'sessions', activeSessionId);
        setDoc(sessionRef, { title: currentInput.slice(0, 30) }, { merge: true })
          .catch(err => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/sessions/${activeSessionId}`));
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput + (currentFiles.length > 0 ? `\n\n[Attached Files: ${currentFiles.map(f => f.name).join(', ')}]` : ''),
      timestamp: new Date(),
    };

    // Optimistic update
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    
    if (user && activeSessionId) {
      const msgRef = doc(db, 'users', user.uid, 'sessions', activeSessionId, 'messages', userMessage.id);
      setDoc(msgRef, {
        ...userMessage,
        sessionId: activeSessionId,
        timestamp: Timestamp.fromDate(userMessage.timestamp)
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/sessions/${activeSessionId}/messages/${userMessage.id}`));
    }

    setInput('');
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "undefined" || apiKey === "MY_GEMINI_API_KEY") {
        throw new Error("Gemini API Key is missing or invalid. Please configure it in the 'Secrets' section of the Settings menu (top right). For free models, ensure you have a valid project selected.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      if (isImageMode) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: currentInput }],
          },
        });

        let imageUrl = '';
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            imageUrl = `data:${mimeType};base64,${base64EncodeString}`;
            break;
          }
        }

        if (!imageUrl) throw new Error("Failed to generate image. The model might have blocked the request or returned an empty response.");

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "Here is your generated image:",
          timestamp: new Date(),
          imageUrl: imageUrl,
        };

        if (user && activeSessionId) {
          const msgRef = doc(db, 'users', user.uid, 'sessions', activeSessionId, 'messages', assistantMessage.id);
          await setDoc(msgRef, {
            ...assistantMessage,
            sessionId: activeSessionId,
            timestamp: Timestamp.fromDate(assistantMessage.timestamp)
          });
        } else {
          setMessages((prev) => [...prev, assistantMessage]);
        }
      } else {
        const finalContents = [];
        newMessages.slice(-10).forEach(msg => { // Limit context to last 10 messages
          finalContents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          });
        });

        // Handle files in the last message
        if (currentFiles.length > 0) {
          const lastParts: any[] = [{ text: currentInput }];
          currentFiles.forEach(file => {
            const [_, base64Data] = file.data.split(';base64,');
            lastParts.push({
              inlineData: {
                mimeType: file.type || 'application/octet-stream',
                data: base64Data
              }
            });
          });
          finalContents[finalContents.length - 1].parts = lastParts;
        }

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: finalContents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION + "\n\nIMPORTANT: You MUST respond in JSON format with the following structure: { \"detectedLanguage\": \"string (e.g., Hindi, English, Hinglish)\", \"response\": \"string (your actual response)\" }",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                detectedLanguage: { type: Type.STRING },
                response: { type: Type.STRING }
              },
              required: ["detectedLanguage", "response"]
            }
          }
        });
        
        let responseData;
        try {
          responseData = JSON.parse(response.text || "{}");
        } catch (e) {
          responseData = { response: response.text, detectedLanguage: "Unknown" };
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: responseData.response || "I'm sorry, I couldn't process that.",
          timestamp: new Date(),
          detectedLanguage: responseData.detectedLanguage
        };

        if (user && activeSessionId) {
          const msgRef = doc(db, 'users', user.uid, 'sessions', activeSessionId, 'messages', assistantMessage.id);
          await setDoc(msgRef, {
            ...assistantMessage,
            sessionId: activeSessionId,
            timestamp: Timestamp.fromDate(assistantMessage.timestamp)
          });
        } else {
          setMessages((prev) => [...prev, assistantMessage]);
        }
      }
    } catch (error: any) {
      console.error("Error calling Gemini API:", error);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I encountered an error: ${error.message || "Unknown error"}. Please ensure your API key is valid and try again.`,
        timestamp: new Date(),
      };
      
      if (user && activeSessionId) {
        const msgRef = doc(db, 'users', user.uid, 'sessions', activeSessionId, 'messages', assistantMessage.id);
        setDoc(msgRef, {
          ...assistantMessage,
          sessionId: activeSessionId,
          timestamp: Timestamp.fromDate(assistantMessage.timestamp)
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/sessions/${activeSessionId}/messages/${assistantMessage.id}`));
      } else {
        setMessages((prev) => [...prev, assistantMessage]);
      }
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
                    <AshokaChakra className="w-full h-full" />
                  </div>
                  <span className="font-black text-bharat-blue tracking-tight">Bharat AI</span>
                </div>
                <button 
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>

              <AnimatePresence mode="wait">
                {user ? (
                  <motion.div 
                    key="user-profile"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-white/10 border border-white/20"
                  >
                    <img 
                      src={user.photoURL || ''} 
                      alt={user.displayName || 'User'} 
                      className="w-10 h-10 rounded-full border-2 border-bharat-blue"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black text-slate-800 truncate">{user.displayName}</div>
                      <button 
                        onClick={handleLogout}
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1 mt-0.5"
                      >
                        <LogOut size={10} />
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="login-prompt"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleLogin}
                      className="w-full py-3 px-4 rounded-2xl bg-white border border-bharat-blue/20 text-bharat-blue font-black text-sm flex items-center justify-center gap-2 shadow-md hover:bg-slate-50 transition-all"
                    >
                      <LogIn size={18} />
                      Sign In with Google
                    </motion.button>
                    {loginError && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-3 rounded-xl bg-red-50 border border-red-100 text-[10px] text-red-600 font-bold break-words"
                      >
                        Error: {loginError}
                      </motion.div>
                    )}
                    {!isAuthReady && (
                      <div className="text-center text-[9px] text-slate-400 font-bold animate-pulse">
                        Initializing Auth...
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startNewChat}
                className="w-full py-3 px-4 rounded-2xl bg-bharat-blue text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Plus size={18} />
                New Chat
              </motion.button>

              <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
                {user ? (
                  sessions.length > 0 ? (
                    <section>
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Chat History</h3>
                      <motion.div 
                        initial="hidden"
                        animate="show"
                        variants={{
                          show: {
                            transition: {
                              staggerChildren: 0.05
                            }
                          }
                        }}
                        className="space-y-2"
                      >
                        {sessions.map((session) => (
                          <motion.div
                            key={session.id}
                            variants={{
                              hidden: { opacity: 0, x: -10 },
                              show: { opacity: 1, x: 0 }
                            }}
                            whileHover={{ x: 4 }}
                            onClick={() => switchSession(session.id)}
                            className={cn(
                              "group relative flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer",
                              currentSessionId === session.id
                                ? "bg-white border-bharat-blue/20 shadow-sm"
                                : "bg-white/5 border-transparent hover:bg-white/10"
                            )}
                          >
                            <div className={cn(
                              "p-2 rounded-lg",
                              currentSessionId === session.id ? "bg-bharat-blue/10 text-bharat-blue" : "bg-white/10 text-slate-400"
                            )}>
                              <MessageSquare size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={cn(
                                "text-xs font-bold truncate",
                                currentSessionId === session.id ? "text-slate-900" : "text-slate-600"
                              )}>
                                {session.title}
                              </div>
                              <div className="text-[9px] text-slate-400 mt-0.5">
                                {session.timestamp.toLocaleDateString()}
                              </div>
                            </div>
                            <button
                              onClick={(e) => deleteSession(e, session.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 hover:text-red-500 rounded-lg transition-all text-slate-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </motion.div>
                        ))}
                      </motion.div>
                    </section>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No history yet</div>
                    </div>
                  )
                ) : (
                  <div className="p-6 rounded-2xl bg-bharat-blue/5 border border-bharat-blue/10 text-center">
                    <UserIcon size={24} className="mx-auto text-bharat-blue/30 mb-3" />
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">
                      Sign in to save your chat history securely
                    </div>
                  </div>
                )}

                <section>
                  <h3 className="text-[10px] font-black text-bharat-saffron uppercase tracking-[0.2em] mb-4">Available Languages</h3>
                  <motion.div 
                    initial="hidden"
                    animate="show"
                    variants={{
                      show: {
                        transition: {
                          staggerChildren: 0.03
                        }
                      }
                    }}
                    className="grid grid-cols-2 gap-2"
                  >
                    {BHARAT_LANGUAGES.map((l, i) => (
                      <motion.button
                        key={l.lang}
                        variants={{
                          hidden: { opacity: 0, scale: 0.9 },
                          show: { opacity: 1, scale: 1 }
                        }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setLangIndex(i)}
                        className={cn(
                          "px-3 py-2 rounded-xl text-xs font-bold transition-all border",
                          langIndex === i 
                            ? "bg-bharat-blue text-white border-bharat-blue shadow-md" 
                            : "bg-white/10 border-white/20 text-slate-600 hover:bg-white/30"
                        )}
                      >
                        {l.lang}
                      </motion.button>
                    ))}
                  </motion.div>
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
            className="w-12 h-12 glass-card rounded-xl flex items-center justify-center text-bharat-blue shadow-sm hover:bg-white/40 transition-colors"
          >
            <Menu size={28} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl chakra-logo flex items-center justify-center p-2.5 bg-white">
              <AshokaChakra className="w-full h-full" />
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

        <AnimatePresence initial={false} mode="popLayout">
          {messages.map((message) => (
            <motion.div
              key={message.id}
              layout
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full"
            >
              <div className={cn(
                "w-full py-2",
                message.role === 'user' ? "text-right" : "text-left"
              )}>
                <div className={cn(
                  "prose prose-sm max-w-none relative",
                  message.role === 'user' ? "prose-slate inline-block text-left bg-bharat-blue/5 px-4 py-2 rounded-2xl border border-bharat-blue/10" : "prose-slate"
                )}>
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2">
                      {message.detectedLanguage && (
                        <div className="px-2 py-0.5 rounded-full bg-bharat-blue/10 border border-bharat-blue/20 flex items-center gap-1">
                          <Languages size={10} className="text-bharat-blue" />
                          <span className="text-[9px] font-bold text-bharat-blue uppercase tracking-wider">Detected: {message.detectedLanguage}</span>
                        </div>
                      )}
                      <button
                        onClick={() => playTTS(message.id, message.content)}
                        className={cn(
                          "p-1.5 rounded-full transition-all",
                          isPlaying === message.id 
                            ? "bg-bharat-blue text-white animate-pulse" 
                            : "bg-slate-100 text-slate-400 hover:bg-bharat-blue/10 hover:text-bharat-blue"
                        )}
                      >
                        {isPlaying === message.id ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                    </div>
                  )}
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                  {message.imageUrl && (
                    <div className="mt-4 relative group inline-block">
                      <img 
                        src={message.imageUrl} 
                        alt="Generated" 
                        className="rounded-xl max-w-full h-auto shadow-md border border-slate-200"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        onClick={() => handleDownloadImage(message.imageUrl!, message.id)}
                        className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/80 text-white rounded-lg transition-all duration-200 shadow-sm backdrop-blur-sm"
                        title="Download Image"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  )}
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
              <div className="w-10 h-10 rounded-full glass-card flex items-center justify-center p-1.5 shrink-0 shadow-sm">
                <AshokaChakra className="w-full h-full" spin />
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
      <footer className="p-3 md:p-6 z-10 flex flex-col items-center gap-4 md:gap-6">
        <div className="w-full max-w-2xl flex flex-col gap-2 md:gap-4">
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

          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex-1 glass-card rounded-full px-4 py-2.5 md:px-6 md:py-4 flex items-center gap-2 md:gap-4 shadow-lg">
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
                <Paperclip className="size-4 md:size-5" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder={isImageMode ? "Describe the image you want to generate..." : "Type your message..."}
                className="flex-1 bg-transparent border-none outline-none text-slate-700 placeholder:text-black font-medium"
              />
              <div className="relative group flex items-center">
                <button 
                  onClick={() => setIsImageMode(!isImageMode)}
                  className={cn(
                    "transition-all duration-300",
                    isImageMode ? "text-bharat-saffron scale-110" : "text-slate-400 hover:text-bharat-saffron"
                  )}
                  title="Image Generation Mode"
                >
                  <ImageIcon className="size-4 md:size-5" />
                </button>
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {isImageMode ? "Disable Image Mode" : "Enable Image Mode"}
                </div>
              </div>
              <button 
                onClick={toggleListening}
                className={cn(
                  "transition-all duration-300",
                  isListening ? "text-red-500 scale-125 animate-pulse" : "text-slate-400 hover:text-bharat-blue"
                )}
              >
                {isListening ? <MicOff className="size-4 md:size-5" /> : <Mic className="size-4 md:size-5" />}
              </button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSend}
                disabled={(!input.trim() && attachedFiles.length === 0) || (isImageMode && !input.trim()) || isLoading}
                className={cn(
                  "w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all shadow-md shrink-0",
                  (!input.trim() && attachedFiles.length === 0) || (isImageMode && !input.trim()) || isLoading
                    ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                    : "bg-bharat-blue text-white"
                )}
              >
                <Send size={18} className="md:size-20 rotate-[-15deg] translate-x-0.5" />
              </motion.button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.2em] uppercase">
            <span className="text-bharat-blue">Make in</span>
            <span className="text-bharat-saffron">Bharat</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.2em] uppercase">
            <span className="text-slate-400">Made by</span>
            <span className="text-white">Bharatiya</span>
          </div>
        </div>
      </footer>

      {/* Info Modal - Kept from previous version but styled to match */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowInfo(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  About {BHARAT_AI_PERSONA.name}
                </h2>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={24} />
                </button>
              </div>
              <motion.div 
                initial="hidden"
                animate="show"
                variants={{
                  show: {
                    transition: {
                      staggerChildren: 0.1
                    }
                  }
                }}
                className="p-8 space-y-8"
              >
                <motion.section variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                  <h3 className="text-sm font-bold text-bharat-saffron uppercase tracking-widest mb-3">Our Purpose</h3>
                  <p className="text-slate-600 leading-relaxed">{BHARAT_AI_PERSONA.corePurpose}</p>
                </motion.section>

                <motion.section variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                  <h3 className="text-sm font-bold text-bharat-green uppercase tracking-widest mb-4">Core Traits</h3>
                  <div className="flex flex-wrap gap-2">
                    {BHARAT_AI_PERSONA.traits.map(trait => (
                      <span key={trait} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-medium">
                        {trait}
                      </span>
                    ))}
                  </div>
                </motion.section>

                <motion.section variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                  <h3 className="text-sm font-bold text-bharat-blue uppercase tracking-widest mb-4">Unique Capabilities</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {BHARAT_AI_FEATURES.map((feature, idx) => (
                      <motion.div 
                        key={idx} 
                        whileHover={{ scale: 1.02 }}
                        className="p-4 border border-slate-100 rounded-2xl bg-slate-50/50 hover:border-bharat-saffron/30 transition-colors"
                      >
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
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
