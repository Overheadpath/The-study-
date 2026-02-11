import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Medal, Crown, Award, Star } from "lucide-react";

const Leaderboard = ({ auth }) => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await api.get("/leaderboard");
      setLeaderboard(response.data);
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      toast.error("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (index) => {
    switch (index) {
      case 0:
        return <Crown className="w-6 h-6 text-amber-500" />;
      case 1:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 2:
        return <Award className="w-6 h-6 text-amber-700" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-gray-500 font-bold">{index + 1}</span>;
    }
  };

  const getRankBg = (index) => {
    switch (index) {
      case 0:
        return "bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300";
      case 1:
        return "bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300";
      case 2:
        return "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300";
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="leaderboard-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-800 font-heading text-lg">Leaderboard</h1>
            <p className="text-sm text-gray-500">See who's winning!</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {leaderboard.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 font-heading">No one here yet!</h2>
            <p className="text-gray-500">Start earning points to get on the leaderboard.</p>
          </div>
        ) : (
          <div className="space-y-4 stagger-children">
            {leaderboard.map((kid, index) => (
              <div 
                key={kid.id}
                className={`card-playful flex items-center gap-4 animate-fade-in ${getRankBg(index)} ${
                  kid.id === auth.currentKid?.id ? 'ring-2 ring-indigo-400' : ''
                }`}
              >
                {/* Rank */}
                <div className="w-10 flex-shrink-0 flex justify-center">
                  {getRankIcon(index)}
                </div>

                {/* Avatar */}
                <div 
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl font-heading flex-shrink-0"
                  style={{ backgroundColor: kid.avatar_color || "#4F46E5" }}
                >
                  {kid.name.charAt(0)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-800 font-heading flex items-center gap-2">
                    {kid.name}
                    {kid.id === auth.currentKid?.id && (
                      <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">You</span>
                    )}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>Grade {kid.grade}</span>
                    <span>•</span>
                    <span>{kid.tasks_completed} tasks</span>
                    {kid.current_streak > 0 && (
                      <>
                        <span>•</span>
                        <span className="text-orange-500">🔥 {kid.current_streak}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Points */}
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-indigo-600 font-heading">{kid.points}</p>
                  <p className="text-xs text-gray-400">points</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        {leaderboard.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="card-playful text-center">
              <Star className="w-6 h-6 text-amber-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800 font-heading">
                {leaderboard.reduce((sum, k) => sum + k.badges_count, 0)}
              </p>
              <p className="text-sm text-gray-500">Total Badges</p>
            </div>
            <div className="card-playful text-center">
              <Trophy className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-2xl font-bold text-gray-800 font-heading">
                {leaderboard.reduce((sum, k) => sum + k.tasks_completed, 0)}
              </p>
              <p className="text-sm text-gray-500">Tasks Completed</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Leaderboard;
