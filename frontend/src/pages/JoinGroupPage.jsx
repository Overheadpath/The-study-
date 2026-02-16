import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { QrCode, Camera, ArrowLeft, Keyboard, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const JoinGroupPage = ({ user }) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState("manual"); // "manual" or "camera"
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (mode === "camera") {
      startCamera();
    }
    return () => stopCamera();
  }, [mode]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraError(null);
    } catch (error) {
      console.error("Camera error:", error);
      setCameraError("Could not access camera. Please enter the code manually.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
  };

  const handleJoin = async (qrCode) => {
    if (!qrCode || qrCode.length < 5) {
      toast.error("Please enter a valid code");
      return;
    }

    if (!user?.id) {
      toast.error("Please log in first");
      navigate("/new-login");
      return;
    }

    setJoining(true);
    try {
      const response = await api.post(`/groups/join-qr?qr_code=${qrCode.toUpperCase()}&user_id=${user.id}`);
      toast.success(`Joined "${response.data.group_name}"!`);
      navigate("/dashboard");
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to join group";
      toast.error(message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF7] via-[#FEF3C7] to-[#FDFBF7] dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-6 hover:text-gray-800 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-700">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white font-heading">Join a Group</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Scan QR code or enter code manually</p>
          </div>

          {/* Mode Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
                mode === "manual" 
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" 
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              <Keyboard className="w-4 h-4" />
              Enter Code
            </button>
            <button
              onClick={() => setMode("camera")}
              className={`flex-1 py-2 px-4 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
                mode === "camera" 
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" 
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              }`}
            >
              <Camera className="w-4 h-4" />
              Scan QR
            </button>
          </div>

          {/* Manual Entry */}
          {mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
                  Group Code
                </label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g., ABC123XYZ)"
                  className="text-center text-lg font-mono tracking-wider"
                  maxLength={12}
                  data-testid="code-input"
                />
              </div>

              <Button
                onClick={() => handleJoin(code)}
                disabled={joining || code.length < 5}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600"
                data-testid="join-btn"
              >
                {joining ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Join Group
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Camera Scanner */}
          {mode === "camera" && (
            <div className="space-y-4">
              {cameraError ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
                  <p className="text-red-600 dark:text-red-400 text-sm">{cameraError}</p>
                  <Button
                    variant="outline"
                    onClick={() => setMode("manual")}
                    className="mt-3"
                  >
                    Enter code manually
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative aspect-square bg-black rounded-2xl overflow-hidden">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    
                    {/* Scanner overlay */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-48 h-48 border-2 border-white rounded-2xl relative">
                        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg" />
                        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg" />
                        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg" />
                        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-indigo-500 rounded-br-lg" />
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
                    Point camera at the QR code
                  </p>

                  <p className="text-center text-gray-400 text-xs">
                    Note: QR scanning requires a library like html5-qrcode. For now, please enter the code manually.
                  </p>
                  
                  <Button
                    variant="outline"
                    onClick={() => setMode("manual")}
                    className="w-full"
                  >
                    Enter code manually instead
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ask a group member to share their QR code or group code with you
          </p>
        </div>

        {/* Not logged in? */}
        {!user && (
          <div className="mt-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">
              Don't have an account?{" "}
              <button
                onClick={() => navigate("/new-register")}
                className="text-indigo-600 hover:underline font-semibold"
              >
                Create one
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinGroupPage;
