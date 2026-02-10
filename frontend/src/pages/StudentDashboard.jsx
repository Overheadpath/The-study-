import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  BookOpen, Gift, MessageCircle, PlusCircle, History, 
  LogOut, Star, Trophy, Sparkles, ChevronRight 
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

const StudentDashboard = ({ auth }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kidData, setKidData] = useState(null);

  useEffect(() => {
    fetchData();
  }, [auth.currentKid?.id]);

  const fetchData = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const [statsRes, kidRes] = await Promise.all([
        api.get(`/stats/kid/${auth.currentKid.id}`),
        api.get(`/kids/${auth.currentKid.id}`)
      ]);
      setStats(statsRes.data);
      setKidData(kidRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    auth.logout();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const nextMilestone = Math.ceil((stats?.points || 0) / 100) * 100;
  const progressToMilestone = ((stats?.points || 0) % 100);

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="student-dashboard">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-xl font-heading"
              style={{ backgroundColor: kidData?.avatar_color || "#4F46E5" }}
            >
              {kidData?.name?.charAt(0) || "S"}
            </div>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Hi, {kidData?.name}!</h1>
              <p className="text-sm text-gray-500">Grade {kidData?.grade}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="points-badge" data-testid="points-display">
              <Trophy className="w-5 h-5" />
              {stats?.points || 0} pts
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              data-testid="logout-btn"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress Card */}
        <div className="card-playful bg-gradient-to-br from-indigo-500 to-purple-600 text-white mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-indigo-100 text-sm font-semibold">Progress to {nextMilestone} points</p>
              <p className="text-3xl font-bold font-heading">{stats?.points || 0} / {nextMilestone}</p>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
          <Progress value={progressToMilestone} className="h-3 bg-white/20" />
          <p className="text-indigo-100 text-sm mt-2">{100 - progressToMilestone} more points to next milestone!</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8 stagger-children">
          <div className="card-playful text-center animate-fade-in">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Star className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-gray-800 font-heading">{stats?.approved_tasks || 0}</p>
            <p className="text-sm text-gray-500">Completed</p>
          </div>
          
          <div className="card-playful text-center animate-fade-in">
            <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-gray-800 font-heading">{stats?.pending_tasks || 0}</p>
            <p className="text-sm text-gray-500">Pending</p>
          </div>
          
          <div className="card-playful text-center animate-fade-in">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Gift className="w-6 h-6 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-gray-800 font-heading">{stats?.pending_redemptions || 0}</p>
            <p className="text-sm text-gray-500">Rewards</p>
          </div>
        </div>

        {/* Quick Actions */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">Quick Actions</h2>
        <div className="space-y-3 mb-8 stagger-children">
          <button
            data-testid="submit-task-btn"
            onClick={() => navigate("/student/submit")}
            className="w-full card-playful flex items-center gap-4 hover:border-indigo-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <PlusCircle className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Submit Homework</h3>
              <p className="text-sm text-gray-500">Tell us what you completed!</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="ai-tutor-btn"
            onClick={() => navigate("/student/tutor")}
            className="w-full card-playful flex items-center gap-4 hover:border-emerald-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">AI Homework Helper</h3>
              <p className="text-sm text-gray-500">Get help with any subject</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="reward-shop-btn"
            onClick={() => navigate("/student/rewards")}
            className="w-full card-playful flex items-center gap-4 hover:border-amber-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Gift className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Reward Shop</h3>
              <p className="text-sm text-gray-500">Spend your points on cool stuff!</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="history-btn"
            onClick={() => navigate("/student/history")}
            className="w-full card-playful flex items-center gap-4 hover:border-gray-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <History className="w-7 h-7 text-gray-600" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Points History</h3>
              <p className="text-sm text-gray-500">See how you earned your points</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Recent Tasks */}
        {stats?.recent_tasks?.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">Recent Tasks</h2>
            <div className="space-y-3">
              {stats.recent_tasks.slice(0, 3).map((task) => (
                <div key={task.id} className="card-playful flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    task.status === "approved" ? "bg-green-100" :
                    task.status === "rejected" ? "bg-red-100" : "bg-amber-100"
                  }`}>
                    <BookOpen className={`w-5 h-5 ${
                      task.status === "approved" ? "text-green-600" :
                      task.status === "rejected" ? "text-red-600" : "text-amber-600"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800">{task.title}</h4>
                    <p className="text-sm text-gray-500">{task.subject}</p>
                  </div>
                  {task.status === "approved" && task.points_awarded > 0 && (
                    <span className="text-green-600 font-bold">+{task.points_awarded}</span>
                  )}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    task.status === "approved" ? "bg-green-100 text-green-700" :
                    task.status === "rejected" ? "bg-red-100 text-red-700" : 
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default StudentDashboard;
