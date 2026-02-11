import { useState, useRef, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { BookOpen, Users, Star, Sparkles, User } from "lucide-react";

const PinEntry = ({ onLogin }) => {
  const [mode, setMode] = useState(null); // 'parent' or 'student'
  const [pin, setPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kids, setKids] = useState([]);
  const [rememberParent, setRememberParent] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    // Fetch kids for quick login
    fetchKids();
    // Check if parent is remembered
    const remembered = localStorage.getItem("studyhelper_remember_parent");
    if (remembered === "true") {
      setRememberParent(true);
    }
  }, []);

  const fetchKids = async () => {
    try {
      const response = await api.get("/kids");
      setKids(response.data);
    } catch (error) {
      console.error("Failed to fetch kids:", error);
    }
  };

  const handlePinChange = (index, value) => {
    if (value.length > 1) return;
    
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError("");

    // Auto-focus next input
    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits entered
    if (index === 3 && value) {
      const fullPin = [...newPin.slice(0, 3), value].join("");
      verifyPin(fullPin);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyPin = async (fullPin) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/verify-pin", {
        pin: fullPin,
        mode: mode
      });

      if (response.data.valid) {
        if (mode === "parent" && rememberParent) {
          localStorage.setItem("studyhelper_remember_parent", "true");
        }
        toast.success(mode === "parent" ? "Welcome, Parent!" : `Welcome, ${response.data.kid_name}!`);
        onLogin(mode, mode === "student" ? { id: response.data.kid_id, name: response.data.kid_name } : null);
      } else {
        setError("Wrong PIN. Try again!");
        setPin(["", "", "", ""]);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError("Something went wrong. Try again!");
      setPin(["", "", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (kid) => {
    setLoading(true);
    try {
      const response = await api.post("/auth/verify-pin", {
        pin: kid.pin,
        mode: "student"
      });

      if (response.data.valid) {
        toast.success(`Welcome back, ${kid.name}!`);
        onLogin("student", { id: kid.id, name: kid.name });
      }
    } catch (err) {
      toast.error("Login failed. Try again!");
    } finally {
      setLoading(false);
    }
  };

  const resetMode = () => {
    setMode(null);
    setPin(["", "", "", ""]);
    setError("");
  };

  if (!mode) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#FDFBF7] via-[#FEF3C7] to-[#FDFBF7]">
        <div className="w-full max-w-md animate-fade-in">
          {/* Logo/Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl mb-6 shadow-lg animate-bounce">
              <BookOpen className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2 font-heading">Study Helper</h1>
            <p className="text-gray-500 text-lg">St George's Grammar School</p>
          </div>

          {/* Quick Login for Students */}
          {kids.length > 0 && (
            <div className="mb-8">
              <p className="text-sm text-gray-500 text-center mb-4 font-semibold">Quick Login</p>
              <div className="grid grid-cols-2 gap-3 stagger-children">
                {kids.map((kid) => (
                  <button
                    key={kid.id}
                    data-testid={`quick-login-${kid.name.toLowerCase()}`}
                    onClick={() => handleQuickLogin(kid)}
                    disabled={loading}
                    className="card-playful flex flex-col items-center gap-2 py-6 hover:border-indigo-300 animate-fade-in transition-all hover:scale-105"
                  >
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl font-heading"
                      style={{ backgroundColor: kid.avatar_color || "#4F46E5" }}
                    >
                      {kid.name.charAt(0)}
                    </div>
                    <div className="text-center">
                      <h3 className="font-bold text-gray-800 font-heading">{kid.name}</h3>
                      <p className="text-xs text-gray-500">Grade {kid.grade}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-gray-200"></div>
            <span className="text-sm text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          {/* Mode Selection */}
          <div className="space-y-3 stagger-children">
            <button
              data-testid="student-mode-btn"
              onClick={() => setMode("student")}
              className="w-full card-playful flex items-center gap-4 hover:border-indigo-300 animate-fade-in"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Star className="w-7 h-7 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-800 font-heading">Student Login</h3>
                <p className="text-sm text-gray-500">Enter your PIN</p>
              </div>
            </button>

            <button
              data-testid="parent-mode-btn"
              onClick={() => setMode("parent")}
              className="w-full card-playful flex items-center gap-4 hover:border-amber-300 animate-fade-in"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Users className="w-7 h-7 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-gray-800 font-heading">Parent Login</h3>
                <p className="text-sm text-gray-500">Manage & approve tasks</p>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-400 flex items-center justify-center gap-1">
              <Sparkles className="w-4 h-4" />
              CAPS Curriculum Ready
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#FDFBF7] via-[#FEF3C7] to-[#FDFBF7]">
      <div className="w-full max-w-md animate-fade-in">
        {/* Back button */}
        <button
          data-testid="back-btn"
          onClick={resetMode}
          className="mb-8 text-gray-500 hover:text-gray-700 font-semibold flex items-center gap-2"
        >
          ← Back
        </button>

        {/* Header */}
        <div className="text-center mb-10">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg ${
            mode === "student" 
              ? "bg-gradient-to-br from-indigo-500 to-purple-600" 
              : "bg-gradient-to-br from-amber-400 to-orange-500"
          }`}>
            {mode === "student" ? (
              <Star className="w-10 h-10 text-white" />
            ) : (
              <Users className="w-10 h-10 text-white" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-gray-800 font-heading">
            {mode === "student" ? "Student Login" : "Parent Login"}
          </h2>
          <p className="text-gray-500 mt-2">Enter your 4-digit PIN</p>
        </div>

        {/* PIN Input */}
        <div className="flex justify-center gap-4 mb-6">
          {pin.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handlePinChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="pin-input"
              data-testid={`pin-input-${index}`}
              autoFocus={index === 0}
              disabled={loading}
            />
          ))}
        </div>

        {/* Remember me for parent */}
        {mode === "parent" && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <input
              type="checkbox"
              id="remember"
              checked={rememberParent}
              onChange={(e) => setRememberParent(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="remember" className="text-sm text-gray-500">
              Remember me on this device
            </label>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="text-center mb-4 animate-fade-in">
            <p className="text-red-500 font-semibold">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        )}

        {/* Help text */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            {mode === "student" 
              ? "Ask your parent for your PIN" 
              : "Default PIN: 1234"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PinEntry;
