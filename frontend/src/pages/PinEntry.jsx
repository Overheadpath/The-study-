import { useState, useRef, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { BookOpen, Users, Sparkles, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PinEntry = ({ onLogin }) => {
  const [mode, setMode] = useState(null); // 'parent'
  const [pin, setPin] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kids, setKids] = useState([]);
  const [rememberParent, setRememberParent] = useState(false);
  const [setupKid, setSetupKid] = useState(null); // Kid being set up
  const [setupPin, setSetupPin] = useState(["", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", ""]);
  const [setupStep, setSetupStep] = useState(1); // 1 = enter PIN, 2 = confirm PIN
  const inputRefs = useRef([]);
  const setupRefs = useRef([]);
  const confirmRefs = useRef([]);

  useEffect(() => {
    fetchKids();
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

  const handlePinChange = (index, value, refs, pinState, setPinState, onComplete) => {
    if (value.length > 1) return;
    
    const newPin = [...pinState];
    newPin[index] = value;
    setPinState(newPin);
    setError("");

    if (value && index < 3) {
      refs.current[index + 1]?.focus();
    }

    if (index === 3 && value) {
      const fullPin = [...newPin.slice(0, 3), value].join("");
      onComplete(fullPin);
    }
  };

  const handleKeyDown = (index, e, refs, pinState) => {
    if (e.key === "Backspace" && !pinState[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const verifyParentPin = async (fullPin) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.post("/auth/verify-pin", {
        pin: fullPin,
        mode: "parent"
      });

      if (response.data.valid) {
        if (rememberParent) {
          localStorage.setItem("studyhelper_remember_parent", "true");
        }
        toast.success("Welcome, Parent!");
        onLogin("parent", null);
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

  const handleKidClick = (kid) => {
    // Check if PIN is set up on this device for this kid
    const savedPin = localStorage.getItem(`studyhelper_kid_pin_${kid.id}`);
    
    if (savedPin) {
      // Auto-login
      loginKid(kid, savedPin);
    } else {
      // Show setup dialog
      setSetupKid(kid);
      setSetupStep(1);
      setSetupPin(["", "", "", ""]);
      setConfirmPin(["", "", "", ""]);
      setError("");
    }
  };

  const loginKid = async (kid, pin) => {
    setLoading(true);
    try {
      const response = await api.post("/auth/verify-pin", {
        pin: pin,
        mode: "student"
      });

      if (response.data.valid) {
        toast.success(`Welcome back, ${kid.name}!`);
        onLogin("student", { id: kid.id, name: kid.name });
      } else {
        // PIN changed on server, clear local storage
        localStorage.removeItem(`studyhelper_kid_pin_${kid.id}`);
        toast.error("PIN has changed. Please set up again.");
        setSetupKid(kid);
        setSetupStep(1);
      }
    } catch (err) {
      toast.error("Login failed. Try again!");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = (fullPin) => {
    if (setupStep === 1) {
      // Move to confirm step
      setSetupStep(2);
      setError("");
      setTimeout(() => confirmRefs.current[0]?.focus(), 100);
    }
  };

  const handleConfirmComplete = async (fullPin) => {
    const originalPin = setupPin.join("");
    
    if (fullPin !== originalPin) {
      setError("PINs don't match. Try again!");
      setConfirmPin(["", "", "", ""]);
      confirmRefs.current[0]?.focus();
      return;
    }

    // Save PIN locally and update on server
    setLoading(true);
    try {
      // Update kid's PIN on server
      await api.put(`/kids/${setupKid.id}`, { pin: fullPin });
      
      // Save PIN locally for this device
      localStorage.setItem(`studyhelper_kid_pin_${setupKid.id}`, fullPin);
      
      toast.success("PIN set up! You're logged in.");
      onLogin("student", { id: setupKid.id, name: setupKid.name });
    } catch (err) {
      toast.error("Failed to save PIN. Try again!");
      setConfirmPin(["", "", "", ""]);
    } finally {
      setLoading(false);
    }
  };

  const resetMode = () => {
    setMode(null);
    setPin(["", "", "", ""]);
    setError("");
  };

  const closeSetupDialog = () => {
    setSetupKid(null);
    setSetupStep(1);
    setSetupPin(["", "", "", ""]);
    setConfirmPin(["", "", "", ""]);
    setError("");
  };

  // Main login screen
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

          {/* Student Quick Login */}
          {kids.length > 0 && (
            <div className="mb-8">
              <p className="text-sm text-gray-500 text-center mb-4 font-semibold">Tap your name to login</p>
              <div className="grid grid-cols-2 gap-3 stagger-children">
                {kids.map((kid) => {
                  const hasPin = localStorage.getItem(`studyhelper_kid_pin_${kid.id}`);
                  return (
                    <button
                      key={kid.id}
                      data-testid={`quick-login-${kid.name.toLowerCase()}`}
                      onClick={() => handleKidClick(kid)}
                      disabled={loading}
                      className="card-playful flex flex-col items-center gap-2 py-6 hover:border-indigo-300 animate-fade-in transition-all hover:scale-105"
                    >
                      <div 
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl font-heading relative"
                        style={{ backgroundColor: kid.avatar_color || "#4F46E5" }}
                      >
                        {kid.name.charAt(0)}
                        {!hasPin && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center">
                            <Lock className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <h3 className="font-bold text-gray-800 font-heading">{kid.name}</h3>
                        <p className="text-xs text-gray-500">Grade {kid.grade}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-gray-200"></div>
          </div>

          {/* Parent Login Only */}
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

          {/* Footer */}
          <div className="mt-10 text-center">
            <p className="text-sm text-gray-400 flex items-center justify-center gap-1">
              <Sparkles className="w-4 h-4" />
              CAPS Curriculum Ready
            </p>
          </div>
        </div>

        {/* PIN Setup Dialog */}
        <Dialog open={!!setupKid} onOpenChange={closeSetupDialog}>
          <DialogContent className="sm:max-w-md z-50">
            <DialogHeader>
              <DialogTitle className="font-heading text-xl flex items-center gap-2">
                <Lock className="w-6 h-6 text-indigo-500" />
                {setupStep === 1 ? "Set Up Your PIN" : "Confirm Your PIN"}
              </DialogTitle>
              <DialogDescription>
                {setupStep === 1 
                  ? `Hi ${setupKid?.name}! Create a 4-digit PIN for this device.`
                  : "Enter your PIN again to confirm."
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="py-6 relative z-50">
              {setupStep === 1 ? (
                <div className="flex justify-center gap-3">
                  {setupPin.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (setupRefs.current[index] = el)}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(
                        index, 
                        e.target.value, 
                        setupRefs, 
                        setupPin, 
                        setSetupPin, 
                        handleSetupComplete
                      )}
                      onKeyDown={(e) => handleKeyDown(index, e, setupRefs, setupPin)}
                      className="pin-input"
                      data-testid={`setup-pin-${index}`}
                      autoFocus={index === 0}
                      disabled={loading}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex justify-center gap-3">
                  {confirmPin.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (confirmRefs.current[index] = el)}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(
                        index, 
                        e.target.value, 
                        confirmRefs, 
                        confirmPin, 
                        setConfirmPin, 
                        handleConfirmComplete
                      )}
                      onKeyDown={(e) => handleKeyDown(index, e, confirmRefs, confirmPin)}
                      className="pin-input"
                      data-testid={`confirm-pin-${index}`}
                      autoFocus={index === 0}
                      disabled={loading}
                    />
                  ))}
                </div>
              )}

              {error && (
                <p className="text-red-500 text-center mt-4 font-semibold">{error}</p>
              )}

              {loading && (
                <div className="flex justify-center mt-4">
                  <div className="w-6 h-6 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={closeSetupDialog}>
                Cancel
              </Button>
              {setupStep === 2 && (
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSetupStep(1);
                    setConfirmPin(["", "", "", ""]);
                    setError("");
                  }}
                >
                  Back
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Parent PIN entry screen
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg bg-gradient-to-br from-amber-400 to-orange-500">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 font-heading">Parent Login</h2>
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
              onChange={(e) => handlePinChange(
                index, 
                e.target.value, 
                inputRefs, 
                pin, 
                setPin, 
                verifyParentPin
              )}
              onKeyDown={(e) => handleKeyDown(index, e, inputRefs, pin)}
              className="pin-input"
              data-testid={`pin-input-${index}`}
              autoFocus={index === 0}
              disabled={loading}
            />
          ))}
        </div>

        {/* Remember me */}
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

        {/* Error message */}
        {error && (
          <div className="text-center mb-4 animate-fade-in">
            <p className="text-red-500 font-semibold">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center">
            <div className="inline-block w-8 h-8 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PinEntry;
