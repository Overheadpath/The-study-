import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Camera, Upload, Sparkles, FileText, 
  BookOpen, Clock, Loader2, Check, X, Lightbulb, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const HomeworkScanner = ({ auth }) => {
  const navigate = useNavigate();
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    subject: "",
    points: 10
  });
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result);
    };
    reader.readAsDataURL(file);

    // Base64 for API
    const base64Reader = new FileReader();
    base64Reader.onload = (e) => {
      const base64 = e.target?.result?.split(',')[1];
      setImageBase64(base64);
    };
    base64Reader.readAsDataURL(file);
    
    setScanResult(null);
  };

  const handleScan = async () => {
    if (!imageBase64) {
      toast.error("Please select an image first");
      return;
    }

    setScanning(true);
    try {
      const response = await api.post("/homework/scan", {
        kid_id: auth.currentKid?.id,
        image_base64: imageBase64
      });

      setScanResult(response.data);
      
      // Pre-fill task form
      if (response.data.suggested_task) {
        setTaskForm({
          title: response.data.suggested_task.title,
          description: response.data.suggested_task.description,
          subject: response.data.suggested_task.subject,
          points: response.data.suggested_task.estimated_points
        });
      }
      
      toast.success("Homework scanned successfully!");
    } catch (error) {
      console.error("Scan error:", error);
      const message = error.response?.data?.detail || "Failed to scan homework";
      toast.error(message);
    } finally {
      setScanning(false);
    }
  };

  const handleCreateTask = async () => {
    setCreatingTask(true);
    try {
      await api.post(`/homework/create-task?kid_id=${auth.currentKid?.id}&title=${encodeURIComponent(taskForm.title)}&description=${encodeURIComponent(taskForm.description)}&subject=${encodeURIComponent(taskForm.subject)}&points=${taskForm.points}`);
      
      toast.success("Task created! Ask your parent to approve it.");
      setShowTaskDialog(false);
      navigate("/student/submit");
    } catch (error) {
      console.error("Create task error:", error);
      toast.error("Failed to create task");
    } finally {
      setCreatingTask(false);
    }
  };

  const clearImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setScanResult(null);
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900" data-testid="homework-scanner-page">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => navigate("/student")}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 dark:text-white font-heading">Homework Scanner</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Snap & get help!</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Image Upload Section */}
        {!imagePreview ? (
          <div className="card-playful dark:bg-gray-800 text-center py-12">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 rounded-3xl flex items-center justify-center mb-4">
              <Camera className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2 font-heading">
              Scan Your Homework
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              Take a photo or upload an image of your homework
            </p>
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                onClick={() => cameraInputRef.current?.click()}
                className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                data-testid="camera-btn"
              >
                <Camera className="w-5 h-5 mr-2" />
                Take Photo
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                data-testid="upload-btn"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Image
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Image Preview */}
            <div className="card-playful dark:bg-gray-800 relative">
              <button
                onClick={clearImage}
                className="absolute top-4 right-4 p-2 bg-red-100 hover:bg-red-200 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-red-600" />
              </button>
              <img 
                src={imagePreview} 
                alt="Homework" 
                className="w-full rounded-xl max-h-[300px] object-contain"
              />
              
              {!scanResult && (
                <div className="mt-4 text-center">
                  <Button
                    onClick={handleScan}
                    disabled={scanning}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                    data-testid="scan-btn"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" />
                        Scan Homework
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Scan Results */}
            {scanResult && (
              <>
                {/* Extracted Text */}
                <div className="card-playful dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <h3 className="font-bold text-gray-800 dark:text-white font-heading">Extracted Content</h3>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {scanResult.extracted_text}
                  </div>
                </div>

                {/* AI Explanation */}
                <div className="card-playful dark:bg-gray-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="w-5 h-5 text-amber-600" />
                    <h3 className="font-bold text-gray-800 dark:text-white font-heading">AI Study Helper</h3>
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-h-[250px] overflow-y-auto">
                    {scanResult.explanation}
                  </div>
                </div>

                {/* Suggested Task */}
                {scanResult.suggested_task && (
                  <div className="card-playful dark:bg-gray-800">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="w-5 h-5 text-green-600" />
                      <h3 className="font-bold text-gray-800 dark:text-white font-heading">Create Task</h3>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-white">
                          {scanResult.suggested_task.title}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          ~{scanResult.suggested_task.estimated_minutes} min
                          <span className="text-green-600 font-bold">
                            +{scanResult.suggested_task.estimated_points} pts
                          </span>
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowTaskDialog(true)}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="create-task-btn"
                      >
                        <Check className="w-5 h-5 mr-1" />
                        Create
                      </Button>
                    </div>
                  </div>
                )}

                {/* Scan Another */}
                <div className="text-center">
                  <Button
                    variant="outline"
                    onClick={clearImage}
                  >
                    Scan Another Homework
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Create Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Homework Task</DialogTitle>
            <DialogDescription>
              This will create a task for your parent to approve
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Title</label>
              <Input
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Homework title"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Subject</label>
              <Input
                value={taskForm.subject}
                onChange={(e) => setTaskForm({ ...taskForm, subject: e.target.value })}
                placeholder="e.g., Math, English"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Description</label>
              <Textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="What's the homework about?"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
                Points: {taskForm.points}
              </label>
              <input
                type="range"
                min="5"
                max="50"
                value={taskForm.points}
                onChange={(e) => setTaskForm({ ...taskForm, points: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={creatingTask}>
              {creatingTask ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HomeworkScanner;
