import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Keyboard, Trophy, Target, RotateCcw, 
  Zap, Timer, CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const TypingPractice = ({ auth }) => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [userInput, setUserInput] = useState("");
  const [isStarted, setIsStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [stats, setStats] = useState(null);
  const [sessionResult, setSessionResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchData();
  }, [auth.currentKid?.id]);

  const fetchData = async () => {
    try {
      const [textRes, statsRes] = await Promise.all([
        api.get("/typing/text"),
        api.get(`/typing/stats/${auth.currentKid.id}`)
      ]);
      setText(textRes.data.text);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    
    if (!isStarted && value.length === 1) {
      setIsStarted(true);
      setStartTime(Date.now());
    }
    
    setUserInput(value);
    
    // Check if complete
    if (value.length >= text.length) {
      handleComplete(value);
    }
  };

  const handleComplete = async (finalInput) => {
    setIsComplete(true);
    const endTime = Date.now();
    const durationSeconds = Math.floor((endTime - startTime) / 1000);
    
    // Calculate WPM
    const words = text.split(" ").length;
    const minutes = durationSeconds / 60;
    const wpm = Math.round(words / minutes);
    
    // Calculate accuracy
    let correctChars = 0;
    for (let i = 0; i < text.length; i++) {
      if (finalInput[i] === text[i]) correctChars++;
    }
    const accuracy = (correctChars / text.length) * 100;
    
    try {
      const response = await api.post("/typing/session", {
        kid_id: auth.currentKid.id,
        wpm,
        accuracy: Math.round(accuracy * 10) / 10,
        duration_seconds: durationSeconds
      });
      
      setSessionResult({
        wpm,
        accuracy: Math.round(accuracy * 10) / 10,
        duration: durationSeconds,
        points: response.data.points_earned
      });
      
      if (response.data.points_earned > 0) {
        toast.success(`Great typing! +${response.data.points_earned} points!`);
      }
      
      await auth.refreshKid();
    } catch (error) {
      console.error("Failed to save session:", error);
    }
  };

  const resetPractice = async () => {
    setUserInput("");
    setIsStarted(false);
    setIsComplete(false);
    setStartTime(null);
    setSessionResult(null);
    
    try {
      const textRes = await api.get("/typing/text");
      setText(textRes.data.text);
      
      const statsRes = await api.get(`/typing/stats/${auth.currentKid.id}`);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Failed to fetch new text:", error);
    }
    
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const getCharClass = (index) => {
    if (index >= userInput.length) return "text-gray-400";
    if (userInput[index] === text[index]) return "text-emerald-600";
    return "text-red-500 bg-red-100";
  };

  const progress = (userInput.length / text.length) * 100;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="typing-practice-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/student")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Typing Practice</h1>
              <p className="text-sm text-gray-500">Improve your typing skills!</p>
            </div>
          </div>
          
          {stats && stats.best_wpm > 0 && (
            <div className="flex items-center gap-2 text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-full">
              <Trophy className="w-4 h-4" />
              <span className="font-bold text-sm">Best: {stats.best_wpm} WPM</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Stats Bar */}
        {stats && stats.total_sessions > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card-playful text-center py-4">
              <Zap className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800 font-heading">{stats.best_wpm}</p>
              <p className="text-xs text-gray-500">Best WPM</p>
            </div>
            <div className="card-playful text-center py-4">
              <Target className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800 font-heading">{stats.avg_accuracy}%</p>
              <p className="text-xs text-gray-500">Avg Accuracy</p>
            </div>
            <div className="card-playful text-center py-4">
              <Keyboard className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800 font-heading">{stats.total_sessions}</p>
              <p className="text-xs text-gray-500">Sessions</p>
            </div>
          </div>
        )}

        {/* Typing Area */}
        {!isComplete ? (
          <div className="card-playful animate-fade-in">
            {/* Text Display */}
            <div className="mb-6 p-6 bg-gray-50 rounded-xl font-mono text-lg leading-relaxed">
              {text.split("").map((char, index) => (
                <span key={index} className={`${getCharClass(index)} transition-colors`}>
                  {char}
                </span>
              ))}
            </div>

            {/* Progress */}
            <Progress value={progress} className="h-2 mb-4" />

            {/* Input */}
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={userInput}
                onChange={handleInputChange}
                placeholder="Start typing here..."
                className="w-full p-4 border-2 border-gray-200 rounded-xl font-mono text-lg focus:outline-none focus:border-indigo-400"
                autoFocus
                data-testid="typing-input"
              />
              {isStarted && !isComplete && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-400">
                  <Timer className="w-4 h-4" />
                  <span className="text-sm">
                    {Math.floor((Date.now() - startTime) / 1000)}s
                  </span>
                </div>
              )}
            </div>

            {!isStarted && (
              <p className="text-center text-gray-500 mt-4">
                Start typing to begin the test!
              </p>
            )}
          </div>
        ) : (
          /* Results */
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800 mb-6 font-heading">Great Job!</h2>
            
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="card-playful py-4">
                <p className="text-3xl font-bold text-indigo-600 font-heading">{sessionResult?.wpm}</p>
                <p className="text-sm text-gray-500">WPM</p>
              </div>
              <div className="card-playful py-4">
                <p className="text-3xl font-bold text-emerald-600 font-heading">{sessionResult?.accuracy}%</p>
                <p className="text-sm text-gray-500">Accuracy</p>
              </div>
              <div className="card-playful py-4">
                <p className="text-3xl font-bold text-amber-600 font-heading">+{sessionResult?.points}</p>
                <p className="text-sm text-gray-500">Points</p>
              </div>
            </div>

            {sessionResult?.wpm >= (stats?.best_wpm || 0) && sessionResult?.wpm > 0 && (
              <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <Trophy className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-bold text-amber-800">New Personal Best!</p>
              </div>
            )}
            
            <div className="space-y-3">
              <Button
                onClick={resetPractice}
                className="w-full btn-primary"
                data-testid="try-again-btn"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Try Again
              </Button>
              <Button
                onClick={() => navigate("/student")}
                variant="outline"
                className="w-full"
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        )}

        {/* Tips */}
        {!isComplete && (
          <div className="mt-8 card-playful bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <h3 className="font-bold text-blue-800 mb-3 font-heading">Typing Tips</h3>
            <ul className="space-y-2 text-sm text-blue-700">
              <li>• Keep your fingers on the home row (ASDF JKL;)</li>
              <li>• Don't look at the keyboard</li>
              <li>• Focus on accuracy first, speed will come!</li>
              <li>• 1 point per 10 WPM, bonus for 90%+ accuracy</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
};

export default TypingPractice;
