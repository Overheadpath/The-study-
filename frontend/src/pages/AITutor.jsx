import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Send, Trash2, BookOpen, Sparkles, Camera, X, Image as ImageIcon, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AITutor = ({ auth }) => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [kidData, setKidData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      setSpeechSupported(true);
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';
      
      recognitionRef.current.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInput(prev => prev + transcript);
        
        if (event.results[event.results.length - 1].isFinal) {
          setIsListening(false);
        }
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          toast.error('Please allow microphone access to use voice input');
        }
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (!speechSupported) {
      toast.error('Voice input is not supported in your browser');
      return;
    }
    
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
        toast.success('Listening... Speak now!');
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
      }
    }
  };

  useEffect(() => {
    fetchKidAndSubjects();
    fetchChatHistory();
  }, [auth.currentKid?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchKidAndSubjects = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const kidRes = await api.get(`/kids/${auth.currentKid.id}`);
      setKidData(kidRes.data);
      
      const subjectsRes = await api.get(`/subjects/${kidRes.data.grade}`);
      setSubjects(subjectsRes.data.subjects);
      if (subjectsRes.data.subjects.length > 0) {
        setSelectedSubject(subjectsRes.data.subjects[0]);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  const fetchChatHistory = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const response = await api.get(`/chat/history?kid_id=${auth.currentKid.id}`);
      setMessages(response.data);
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Max 5MB allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setImageUrl(response.data.image_url);
      toast.success("Photo ready! Ask your question.");
    } catch (error) {
      console.error("Failed to upload:", error);
      toast.error("Failed to upload photo");
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !imageUrl) || loading) return;

    const messageContent = imageUrl 
      ? `[Photo attached] ${input || "Help me with this homework"}`
      : input;

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageContent,
      subject: selectedSubject,
      image: imagePreview
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    const sentImageUrl = imageUrl;
    setImageUrl("");
    setImagePreview(null);
    setLoading(true);

    try {
      const response = await api.post("/chat", {
        kid_id: auth.currentKid.id,
        message: input || "Help me understand this homework problem",
        subject: selectedSubject,
        image_url: sentImageUrl || null
      });

      const assistantMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.data.response,
        subject: selectedSubject
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Oops! I couldn't respond. Try again!");
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear all chat history?")) return;

    try {
      await api.delete(`/chat/history/${auth.currentKid.id}`);
      setMessages([]);
      toast.success("Chat history cleared!");
    } catch (error) {
      console.error("Failed to clear history:", error);
      toast.error("Failed to clear history");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col" data-testid="ai-tutor-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/student")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-gray-800 font-heading">AI Homework Helper</h1>
                <p className="text-xs text-gray-500">I'll help you learn, not give answers!</p>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleClearHistory}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
            data-testid="clear-history-btn"
            title="Clear chat history"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Subject Selector */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-gray-400" />
            <Select value={selectedSubject} onValueChange={setSelectedSubject}>
              <SelectTrigger className="w-[200px]" data-testid="subject-select">
                <SelectValue placeholder="Select subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-gray-500">Grade {kidData?.grade} CAPS</span>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 ? (
            <div className="text-center py-12 animate-fade-in">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2 font-heading">
                Hi {kidData?.name}! I'm your Study Buddy
              </h2>
              <p className="text-gray-500 mb-4 max-w-md mx-auto">
                I won't give you answers, but I'll help you figure things out yourself! 
                That's how you really learn. 🧠
              </p>
              <p className="text-sm text-gray-400 mb-6">
                You can take a photo of your homework and I'll help you understand it!
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["How do I solve this?", "Explain this to me", "What's the method?"].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-4 py-2 bg-white border-2 border-gray-200 rounded-full text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={message.id || index}
                  className={`chat-bubble ${message.role} animate-fade-in`}
                  data-testid={`message-${message.role}`}
                >
                  {message.image && (
                    <img 
                      src={message.image} 
                      alt="Homework" 
                      className="max-w-xs rounded-lg mb-2"
                    />
                  )}
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
              {loading && (
                <div className="chat-bubble assistant animate-fade-in">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Image Preview */}
      {imagePreview && (
        <div className="bg-white border-t border-gray-100 px-4 py-3">
          <div className="max-w-4xl mx-auto">
            <div className="relative inline-block">
              <img 
                src={imagePreview} 
                alt="Homework preview" 
                className="h-20 rounded-lg border-2 border-emerald-200"
              />
              <button
                onClick={removeImage}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {uploading && <span className="ml-3 text-sm text-gray-500">Uploading...</span>}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="bg-white border-t border-gray-100 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-3">
            {/* Camera Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-[52px] w-[52px] flex-shrink-0 flex items-center justify-center bg-gray-100 hover:bg-emerald-100 rounded-2xl transition-colors"
              data-testid="camera-btn"
            >
              <Camera className="w-5 h-5 text-gray-600" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
            />
            
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={imagePreview ? "Ask about this homework..." : "Ask me anything about your homework..."}
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl resize-none focus:outline-none focus:border-emerald-400 transition-colors font-body"
                rows={1}
                style={{ minHeight: "52px", maxHeight: "150px" }}
                data-testid="chat-input"
                disabled={loading}
              />
            </div>
            
            {/* Microphone Button */}
            {speechSupported && (
              <button
                onClick={toggleListening}
                className={`h-[52px] w-[52px] flex-shrink-0 flex items-center justify-center rounded-2xl transition-all ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                    : 'bg-gray-100 hover:bg-emerald-100'
                }`}
                data-testid="mic-btn"
              >
                {isListening ? (
                  <MicOff className="w-5 h-5 text-white" />
                ) : (
                  <Mic className="w-5 h-5 text-gray-600" />
                )}
              </button>
            )}
            
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && !imageUrl) || loading || uploading}
              className="h-[52px] px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-2xl"
              data-testid="send-btn"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            {isListening ? "🎤 Listening... Click mic to stop" : "I'll guide you to find the answer yourself - that's how you really learn!"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AITutor;
