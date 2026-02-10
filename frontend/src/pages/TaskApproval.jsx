import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, CheckCircle, XCircle, Star, BookOpen, 
  Clock, MessageSquare, Award
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TaskApproval = ({ auth }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [approving, setApproving] = useState(false);
  
  const [approval, setApproval] = useState({
    points: 10,
    rating: 3,
    feedback: ""
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tasksRes, kidsRes] = await Promise.all([
        api.get("/tasks?status=pending"),
        api.get("/kids")
      ]);
      setTasks(tasksRes.data);
      setKids(kidsRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  };

  const getKidName = (kidId) => {
    const kid = kids.find(k => k.id === kidId);
    return kid?.name || "Unknown";
  };

  const getKidColor = (kidId) => {
    const kid = kids.find(k => k.id === kidId);
    return kid?.avatar_color || "#4F46E5";
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleApprove = async () => {
    if (!selectedTask) return;
    
    setApproving(true);
    
    try {
      await api.put(`/tasks/${selectedTask.id}/approve`, {
        status: "approved",
        points_awarded: approval.points,
        rating: approval.rating,
        parent_feedback: approval.feedback
      });
      
      toast.success(`Approved! ${getKidName(selectedTask.kid_id)} earned ${approval.points} points!`);
      setSelectedTask(null);
      setApproval({ points: 10, rating: 3, feedback: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to approve:", error);
      toast.error("Failed to approve task");
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedTask) return;
    
    setApproving(true);
    
    try {
      await api.put(`/tasks/${selectedTask.id}/approve`, {
        status: "rejected",
        points_awarded: 0,
        rating: 0,
        parent_feedback: approval.feedback || "Please try again with more effort."
      });
      
      toast.info("Task rejected. The student can try again.");
      setSelectedTask(null);
      setApproval({ points: 10, rating: 3, feedback: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to reject:", error);
      toast.error("Failed to reject task");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="task-approval-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => navigate("/parent")}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-800 font-heading text-lg">Review Tasks</h1>
            <p className="text-sm text-gray-500">{tasks.length} pending approval</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {tasks.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 font-heading">All Caught Up!</h2>
            <p className="text-gray-500">No tasks waiting for approval.</p>
          </div>
        ) : (
          <div className="space-y-4 stagger-children">
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className="card-playful animate-fade-in cursor-pointer hover:border-indigo-300"
                onClick={() => setSelectedTask(task)}
                data-testid={`task-${task.id}`}
              >
                <div className="flex items-start gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg font-heading flex-shrink-0"
                    style={{ backgroundColor: getKidColor(task.kid_id) }}
                  >
                    {getKidName(task.kid_id).charAt(0)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-800 font-heading">{task.title}</h3>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                        {task.subject}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(task.created_at)}
                      </span>
                      <span className="font-semibold text-indigo-600">
                        by {getKidName(task.kid_id)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Approval Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Award className="w-6 h-6 text-amber-500" />
              Review Task
            </DialogTitle>
          </DialogHeader>
          
          {selectedTask && (
            <div className="py-4 space-y-6">
              {/* Task Details */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-indigo-600">{selectedTask.subject}</span>
                </div>
                <h4 className="font-bold text-gray-800 mb-2">{selectedTask.title}</h4>
                <p className="text-sm text-gray-600">{selectedTask.description}</p>
                <p className="text-xs text-gray-400 mt-2">
                  Submitted by {getKidName(selectedTask.kid_id)} • {formatDate(selectedTask.created_at)}
                </p>
              </div>

              {/* Rating */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Rating: {approval.rating} stars
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setApproval({ ...approval, rating: star })}
                      className="p-1 transition-transform hover:scale-110"
                    >
                      <Star 
                        className={`w-8 h-8 ${
                          star <= approval.rating 
                            ? 'text-amber-400 fill-amber-400' 
                            : 'text-gray-200'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Points */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 block">
                  Points to Award: <span className="text-amber-600">{approval.points}</span>
                </label>
                <Slider
                  value={[approval.points]}
                  onValueChange={(value) => setApproval({ ...approval, points: value[0] })}
                  max={50}
                  min={1}
                  step={1}
                  className="my-4"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>1 pt</span>
                  <span>25 pts</span>
                  <span>50 pts</span>
                </div>
              </div>

              {/* Feedback */}
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                  <MessageSquare className="w-4 h-4" />
                  Feedback (optional)
                </label>
                <Textarea
                  value={approval.feedback}
                  onChange={(e) => setApproval({ ...approval, feedback: e.target.value })}
                  placeholder="Great job! Keep up the good work..."
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="destructive" 
              onClick={handleReject}
              disabled={approving}
              className="flex-1 sm:flex-none"
              data-testid="reject-btn"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
            <Button 
              onClick={handleApprove}
              disabled={approving}
              className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              data-testid="approve-btn"
            >
              {approving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Approve (+{approval.points} pts)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskApproval;
