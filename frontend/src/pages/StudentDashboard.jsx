import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  BookOpen, Gift, MessageCircle, PlusCircle, History, 
  Settings, Star, Trophy, Sparkles, ChevronRight, Clock,
  Keyboard, Award, Target, Flame, Users, FileText, Camera
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

const StudentDashboard = ({ auth }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [kidData, setKidData] = useState(null);
  const [streak, setStreak] = useState(null);
  const [badges, setBadges] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [auth.currentKid?.id]);

  const fetchData = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const [statsRes, kidRes, streakRes, badgesRes, challengesRes] = await Promise.all([
        api.get(`/stats/kid/${auth.currentKid.id}`),
        api.get(`/kids/${auth.currentKid.id}`),
        api.get(`/streak/${auth.currentKid.id}`),
        api.get(`/badges/${auth.currentKid.id}`),
        api.get(`/challenges?kid_id=${auth.currentKid.id}`)
      ]);
      setStats(statsRes.data);
      setKidData(kidRes.data);
      setStreak(streakRes.data);
      setBadges(badgesRes.data.badges || []);
      setChallenges(challengesRes.data.filter(c => !c.completed_by?.includes(auth.currentKid.id)));
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    auth.logout();
    // Clear browser history and navigate to landing
    window.history.replaceState(null, "", "/");
    navigate("/", { replace: true });
  };

  const handleSettings = () => {
    navigate("/settings", { replace: false });
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
          
          <div className="flex items-center gap-3">
            {streak?.current_streak > 0 && (
              <div className="flex items-center gap-1 text-orange-500 bg-orange-50 px-3 py-1.5 rounded-full">
                <Flame className="w-4 h-4" />
                <span className="font-bold text-sm">{streak.current_streak}</span>
              </div>
            )}
            <div className="points-badge" data-testid="points-display">
              <Trophy className="w-5 h-5" />
              {stats?.points || 0}
            </div>
            <button 
              onClick={handleSettings}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              data-testid="settings-btn"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-6">
        {/* Progress Card */}
        <div className="card-playful bg-gradient-to-br from-indigo-500 to-purple-600 text-white mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-indigo-100 text-sm font-semibold">Progress to {nextMilestone} points</p>
              <p className="text-3xl font-bold font-heading">{stats?.points || 0} / {nextMilestone}</p>
            </div>
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
          </div>
          <Progress value={progressToMilestone} className="h-3 bg-white/20" />
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6 stagger-children">
          <div className="card-playful text-center py-3 animate-fade-in">
            <Star className="w-5 h-5 text-green-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-800 font-heading">{stats?.approved_tasks || 0}</p>
            <p className="text-xs text-gray-500">Done</p>
          </div>
          <div className="card-playful text-center py-3 animate-fade-in">
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-800 font-heading">{stats?.pending_tasks || 0}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div className="card-playful text-center py-3 animate-fade-in">
            <Award className="w-5 h-5 text-purple-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-800 font-heading">{badges.length}</p>
            <p className="text-xs text-gray-500">Badges</p>
          </div>
          <button 
            onClick={() => navigate("/leaderboard")}
            className="card-playful text-center py-3 animate-fade-in hover:border-indigo-300"
          >
            <Users className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-800 font-heading">VS</p>
            <p className="text-xs text-gray-500">Rank</p>
          </button>
        </div>

        {/* Active Challenges */}
        {challenges.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-gray-800 font-heading flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-500" />
                Active Challenges
              </h2>
              <button 
                onClick={() => navigate("/student/challenges")}
                className="text-sm text-purple-600 font-semibold"
              >
                View All
              </button>
            </div>
            <div className="card-playful bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Target className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800">{challenges[0].title}</h4>
                  <p className="text-sm text-gray-500">{challenges[0].points_reward} points</p>
                </div>
                <span className="text-purple-600 font-bold">{challenges.length} active</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Actions Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 stagger-children">
          <button
            data-testid="submit-task-btn"
            onClick={() => navigate("/student/submit")}
            className="card-playful flex flex-col items-center gap-2 py-5 hover:border-indigo-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <PlusCircle className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-gray-800 font-heading">Submit Homework</span>
          </button>

          <button
            data-testid="ai-tutor-btn"
            onClick={() => navigate("/student/tutor")}
            className="card-playful flex flex-col items-center gap-2 py-5 hover:border-emerald-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-gray-800 font-heading">AI Helper</span>
          </button>

          <button
            data-testid="daily-rewards-btn"
            onClick={() => navigate("/student/daily-rewards")}
            className="card-playful flex flex-col items-center gap-2 py-5 hover:border-amber-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-gray-800 font-heading">Daily Rewards</span>
          </button>

          <button
            data-testid="typing-btn"
            onClick={() => navigate("/student/typing")}
            className="card-playful flex flex-col items-center gap-2 py-5 hover:border-pink-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl flex items-center justify-center">
              <Keyboard className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-gray-800 font-heading">Typing Practice</span>
          </button>
        </div>

        {/* Secondary Actions */}
        <div className="space-y-2 mb-6">
          <button
            data-testid="reward-shop-btn"
            onClick={() => navigate("/student/rewards")}
            className="w-full card-playful flex items-center gap-4 hover:border-amber-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Gift className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Reward Shop</h3>
              <p className="text-sm text-gray-500">Spend your points!</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="badges-btn"
            onClick={() => navigate("/student/badges")}
            className="w-full card-playful flex items-center gap-4 hover:border-purple-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">My Badges</h3>
              <p className="text-sm text-gray-500">{badges.length} badges earned</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="certificates-btn"
            onClick={() => navigate("/student/certificates")}
            className="w-full card-playful flex items-center gap-4 hover:border-amber-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">My Certificates</h3>
              <p className="text-sm text-gray-500">View your achievement awards</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="history-btn"
            onClick={() => navigate("/student/history")}
            className="w-full card-playful flex items-center gap-4 hover:border-gray-300 animate-fade-in"
          >
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center flex-shrink-0">
              <History className="w-6 h-6 text-gray-600" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Points History</h3>
              <p className="text-sm text-gray-500">See how you earned points</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Recent Tasks */}
        {stats?.recent_tasks?.length > 0 && (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-3 font-heading">Recent Tasks</h2>
            <div className="space-y-2">
              {stats.recent_tasks.slice(0, 3).map((task) => (
                <div key={task.id} className="card-playful flex items-center gap-3 py-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    task.status === "approved" ? "bg-green-100" :
                    task.status === "rejected" ? "bg-red-100" : "bg-amber-100"
                  }`}>
                    <BookOpen className={`w-4 h-4 ${
                      task.status === "approved" ? "text-green-600" :
                      task.status === "rejected" ? "text-red-600" : "text-amber-600"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-800 text-sm truncate">{task.title}</h4>
                    <p className="text-xs text-gray-500">{task.subject}</p>
                  </div>
                  {task.status === "approved" && task.points_awarded > 0 && (
                    <span className="text-green-600 font-bold text-sm">+{task.points_awarded}</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
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
