import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Send, Trash2, BookOpen, Sparkles } from "lucide-react";
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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      subject: selectedSubject
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.post("/chat", {
        kid_id: auth.currentKid.id,
        message: input,
        subject: selectedSubject
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
      // Remove the user message if the API call failed
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
                <p className="text-xs text-gray-500">Ask me anything!</p>
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
                Hi {kidData?.name}! I'm your AI Tutor
              </h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Ask me anything about {selectedSubject || "your subjects"}! I'm here to help you learn and understand your homework.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["Help me with fractions", "What is photosynthesis?", "Explain verbs in Afrikaans"].map((suggestion) => (
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

      {/* Input Area */}
      <div className="bg-white border-t border-gray-100 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your homework..."
                className="w-full px-4 py-3 pr-12 border-2 border-gray-200 rounded-2xl resize-none focus:outline-none focus:border-emerald-400 transition-colors font-body"
                rows={1}
                style={{ minHeight: "52px", maxHeight: "150px" }}
                data-testid="chat-input"
                disabled={loading}
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="h-[52px] px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-2xl"
              data-testid="send-btn"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITutor;
