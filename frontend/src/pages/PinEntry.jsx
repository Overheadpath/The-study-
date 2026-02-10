import { useState, useRef } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { BookOpen, Users, Star, Sparkles } from "lucide-react";

const PinEntry = ({ onLogin }) => {
  const [mode, setMode] = useState(null); // 'parent' or 'student'
  const [pin, setPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRefs = useRef([]);

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
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl mb-6 shadow-lg animate-bounce">
              <BookOpen className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2 font-heading">Study Helper</h1>
            <p className="text-gray-500 text-lg">Learn, Complete Tasks & Earn Rewards!</p>
          </div>

          {/* Mode Selection */}
          <div className="space-y-4 stagger-children">
            <button
              data-testid="student-mode-btn"
              onClick={() => setMode("student")}
              className="w-full card-playful flex items-center gap-4 hover:border-indigo-300 animate-fade-in"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Star className="w-8 h-8 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-xl font-bold text-gray-800 font-heading">I'm a Student</h3>
                <p className="text-gray-500">Submit homework & earn points</p>
              </div>
            </button>

            <button
              data-testid="parent-mode-btn"
              onClick={() => setMode("parent")}
              className="w-full card-playful flex items-center gap-4 hover:border-amber-300 animate-fade-in"
            >
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-xl font-bold text-gray-800 font-heading">I'm a Parent</h3>
                <p className="text-gray-500">Approve tasks & manage rewards</p>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="mt-12 text-center">
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
