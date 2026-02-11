import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Send, BookOpen, CheckCircle, Camera, X, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SubmitTask = ({ auth }) => {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [kidData, setKidData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [estimatedPoints, setEstimatedPoints] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const fileInputRef = useRef(null);
  
  const [form, setForm] = useState({
    title: "",
    description: "",
    subject: "",
    image_url: ""
  });

  useEffect(() => {
    fetchKidAndSubjects();
  }, [auth.currentKid?.id]);

  const fetchKidAndSubjects = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const kidRes = await api.get(`/kids/${auth.currentKid.id}`);
      setKidData(kidRes.data);
      
      const subjectsRes = await api.get(`/subjects/${kidRes.data.grade}`);
      setSubjects(subjectsRes.data.subjects);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  // Estimate points when form changes
  useEffect(() => {
    const estimatePoints = async () => {
      if (!form.title.trim() || !form.description.trim() || !form.subject || !auth.currentKid?.id) {
        setEstimatedPoints(null);
        return;
      }

      setEstimating(true);
      try {
        const response = await api.post("/tasks/estimate-points", {
          kid_id: auth.currentKid.id,
          title: form.title,
          description: form.description,
          subject: form.subject
        });
        setEstimatedPoints(response.data);
      } catch (error) {
        console.error("Failed to estimate points:", error);
      } finally {
        setEstimating(false);
      }
    };

    // Debounce the estimation
    const timer = setTimeout(estimatePoints, 1000);
    return () => clearTimeout(timer);
  }, [form.title, form.description, form.subject, auth.currentKid?.id]);

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Max 5MB allowed.");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);

    // Upload to server
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await api.post('/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setForm({ ...form, image_url: response.data.image_url });
      toast.success("Photo added!");
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
    setForm({ ...form, image_url: "" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.title.trim() || !form.description.trim() || !form.subject) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);

    try {
      await api.post("/tasks", {
        kid_id: auth.currentKid.id,
        title: form.title,
        description: form.description,
        subject: form.subject,
        image_url: form.image_url || null
      });

      setSubmitted(true);
      toast.success("Task submitted! Waiting for approval.");
    } catch (error) {
      console.error("Failed to submit task:", error);
      toast.error("Failed to submit task. Try again!");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6" data-testid="submit-success">
        <div className="text-center animate-fade-in">
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2 font-heading">Great Job!</h1>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">
            Your homework has been submitted. Your parent will review it soon and award you points!
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => {
                setSubmitted(false);
                setForm({ title: "", description: "", subject: "", image_url: "" });
                setImagePreview(null);
              }}
              className="w-full btn-primary"
              data-testid="submit-another-btn"
            >
              Submit Another Task
            </Button>
            <Button
              onClick={() => navigate("/student")}
              variant="outline"
              className="w-full"
              data-testid="back-to-dashboard-btn"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="submit-task-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => navigate("/student")}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-800 font-heading text-lg">Submit Homework</h1>
            <p className="text-sm text-gray-500">Tell us what you completed!</p>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
          {/* Subject Select */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Subject</label>
            <Select 
              value={form.subject} 
              onValueChange={(value) => setForm({ ...form, subject: value })}
            >
              <SelectTrigger className="h-12" data-testid="subject-select">
                <SelectValue placeholder="Choose a subject" />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      {subject}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title Input */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">What did you do?</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g., Completed maths worksheet page 45"
              className="h-12"
              data-testid="task-title-input"
            />
          </div>

          {/* Description Textarea */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700">Tell us more about it</label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Describe what you learned or did. The more detail, the more points you might earn!"
              rows={4}
              className="resize-none"
              data-testid="task-description-input"
            />
          </div>

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Add a Photo (optional)
            </label>
            
            {imagePreview ? (
              <div className="relative inline-block">
                <img 
                  src={imagePreview} 
                  alt="Homework preview" 
                  className="w-full max-w-xs rounded-xl border-2 border-gray-200"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors"
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-sm text-gray-500">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500">Tap to take or choose a photo</p>
                    <p className="text-xs text-gray-400">Show your completed work!</p>
                  </div>
                )}
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              className="hidden"
              data-testid="image-input"
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={loading || uploading || !form.title || !form.description || !form.subject}
            className="w-full h-14 btn-primary text-lg"
            data-testid="submit-task-btn"
          >
            {loading ? (
              <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                Submit for Approval
              </>
            )}
          </Button>
        </form>

        {/* Tips Card */}
        <div className="mt-8 card-playful bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <h3 className="font-bold text-amber-800 mb-3 font-heading">Tips for More Points</h3>
          <ul className="space-y-2 text-sm text-amber-700">
            <li className="flex items-start gap-2">
              <span className="text-amber-500">✓</span>
              Be specific about what you completed
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500">✓</span>
              Explain what you learned
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500">✓</span>
              Add a photo of your work!
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500">✓</span>
              Mention any challenges you overcame
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default SubmitTask;
