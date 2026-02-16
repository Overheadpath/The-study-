import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  Users, Gift, CheckCircle, LogOut, Settings,
  ChevronRight, Clock, AlertCircle, UserPlus, Target, BarChart3
} from "lucide-react";

const ParentDashboard = ({ auth }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await api.get("/stats/parent");
      setStats(response.data);
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
        <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="parent-dashboard">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Parent Dashboard</h1>
              <p className="text-sm text-gray-500">Manage your family's learning</p>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            data-testid="logout-btn"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Alert Cards */}
        {(stats?.total_pending_tasks > 0 || stats?.total_pending_redemptions > 0) && (
          <div className="mb-8 space-y-3 stagger-children">
            {stats?.total_pending_tasks > 0 && (
              <div 
                className="card-playful bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 flex items-center gap-4 cursor-pointer hover:border-amber-400 animate-fade-in"
                onClick={() => navigate("/parent/approve")}
                data-testid="pending-tasks-alert"
              >
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-amber-800 font-heading">{stats.total_pending_tasks} Tasks Waiting</h3>
                  <p className="text-sm text-amber-600">Tap to review and approve homework</p>
                </div>
                <ChevronRight className="w-5 h-5 text-amber-400" />
              </div>
            )}

            {stats?.total_pending_redemptions > 0 && (
              <div 
                className="card-playful bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 flex items-center gap-4 cursor-pointer hover:border-purple-400 animate-fade-in"
                onClick={() => navigate("/parent/rewards")}
                data-testid="pending-rewards-alert"
              >
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Gift className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-purple-800 font-heading">{stats.total_pending_redemptions} Rewards to Give</h3>
                  <p className="text-sm text-purple-600">Kids are waiting for their rewards!</p>
                </div>
                <ChevronRight className="w-5 h-5 text-purple-400" />
              </div>
            )}
          </div>
        )}

        {/* Kids Overview */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">Your Kids</h2>
        {stats?.kids?.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 stagger-children">
            {stats.kids.map((kid) => (
              <div key={kid.id} className="card-playful animate-fade-in">
                <div className="flex items-center gap-4 mb-4">
                  <div 
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl font-heading"
                    style={{ backgroundColor: kid.avatar_color || "#4F46E5" }}
                  >
                    {kid.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-800 font-heading text-lg">{kid.name}</h3>
                    <p className="text-sm text-gray-500">Grade {kid.grade}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="points-badge text-sm">
                    {kid.points} points
                  </div>
                  <span className="text-xs text-gray-400">PIN: {kid.pin}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-playful text-center py-8 mb-8 animate-fade-in">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-800 mb-2 font-heading">No Kids Yet</h3>
            <p className="text-gray-500 mb-4">Add your children to get started</p>
            <button
              onClick={() => navigate("/parent/kids")}
              className="btn-primary inline-flex items-center gap-2"
              data-testid="add-first-kid-btn"
            >
              <UserPlus className="w-5 h-5" />
              Add Your First Kid
            </button>
          </div>
        )}

        {/* Management Actions */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">Manage</h2>
        <div className="space-y-3 stagger-children">
          <button
            data-testid="approve-tasks-btn"
            onClick={() => navigate("/parent/approve")}
            className="w-full card-playful flex items-center gap-4 hover:border-indigo-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Review Tasks</h3>
              <p className="text-sm text-gray-500">Approve homework and award points</p>
            </div>
            {stats?.total_pending_tasks > 0 && (
              <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-bold">
                {stats.total_pending_tasks}
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="manage-rewards-btn"
            onClick={() => navigate("/parent/rewards")}
            className="w-full card-playful flex items-center gap-4 hover:border-amber-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Gift className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Manage Rewards</h3>
              <p className="text-sm text-gray-500">Add rewards & mark as given</p>
            </div>
            {stats?.total_pending_redemptions > 0 && (
              <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-bold">
                {stats.total_pending_redemptions}
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="manage-kids-btn"
            onClick={() => navigate("/parent/kids")}
            className="w-full card-playful flex items-center gap-4 hover:border-emerald-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Users className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Manage Kids</h3>
              <p className="text-sm text-gray-500">Add kids, set grades & PINs</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          <button
            data-testid="challenges-btn"
            onClick={() => navigate("/parent/challenges")}
            className="w-full card-playful flex items-center gap-4 hover:border-purple-300 animate-fade-in"
          >
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Target className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Weekly Challenges</h3>
              <p className="text-sm text-gray-500">Create bonus challenges</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;
