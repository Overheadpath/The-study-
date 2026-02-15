import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Gift, Star, Sparkles, Trophy, Calendar, Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import confetti from "canvas-confetti";

const DailyRewards = ({ auth }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [rewardData, setRewardData] = useState(null);
  const [kidData, setKidData] = useState(null);

  // Day rewards configuration
  const dayRewards = [
    { day: 1, points: 5, icon: "🎁" },
    { day: 2, points: 10, icon: "⭐" },
    { day: 3, points: 15, icon: "🌟" },
    { day: 4, points: 20, icon: "💫" },
    { day: 5, points: 30, icon: "🏆" },
    { day: 6, points: 40, icon: "👑" },
    { day: 7, points: 100, icon: "🎉", special: true },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const kidId = auth.currentKid?.id;
      if (!kidId) {
        navigate("/");
        return;
      }

      const [kidRes, rewardRes] = await Promise.all([
        api.get(`/kids/${kidId}`),
        api.get(`/daily-rewards/${kidId}`)
      ]);

      setKidData(kidRes.data);
      setRewardData(rewardRes.data);
    } catch (error) {
      console.error("Error fetching data:", error);
      // Initialize with defaults if endpoint doesn't exist yet
      setRewardData({
        current_streak: 0,
        last_claim_date: null,
        can_claim_today: true,
        total_claimed: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const claimReward = async () => {
    if (!rewardData?.can_claim_today || claiming) return;
    
    setClaiming(true);
    try {
      const response = await api.post(`/daily-rewards/${auth.currentKid?.id}/claim`);
      
      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      
      toast.success(`🎉 You earned ${response.data.points_earned} points!`);
      setRewardData(response.data);
      
      // Update kid data with new points
      if (kidData) {
        setKidData({
          ...kidData,
          points: (kidData.points || 0) + response.data.points_earned
        });
      }
    } catch (error) {
      console.error("Error claiming reward:", error);
      toast.error("Failed to claim reward. Try again!");
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-amber-200 border-t-amber-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const currentDay = Math.min((rewardData?.current_streak || 0) + 1, 7);
  const todayReward = dayRewards[currentDay - 1];

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-50" data-testid="daily-rewards-page">
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
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
              <Gift className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 font-heading">Daily Rewards</h1>
              <p className="text-xs text-gray-500">Login daily for bonus points!</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Streak Banner */}
        <div className="card-playful bg-gradient-to-r from-amber-400 to-orange-500 text-white mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm font-medium">Current Streak</p>
              <div className="flex items-center gap-2">
                <span className="text-4xl font-bold font-heading">{rewardData?.current_streak || 0}</span>
                <span className="text-xl">🔥</span>
              </div>
              <p className="text-amber-100 text-sm">days in a row!</p>
            </div>
            <div className="text-right">
              <p className="text-amber-100 text-sm font-medium">Total Earned</p>
              <div className="flex items-center gap-1 justify-end">
                <Trophy className="w-5 h-5" />
                <span className="text-2xl font-bold">{rewardData?.total_claimed || 0}</span>
              </div>
              <p className="text-amber-100 text-sm">bonus points</p>
            </div>
          </div>
        </div>

        {/* Today's Reward */}
        <div className="card-playful mb-6 text-center">
          <h2 className="text-lg font-bold text-gray-800 mb-4 font-heading">
            {rewardData?.can_claim_today ? "Today's Reward" : "Come Back Tomorrow!"}
          </h2>
          
          <div className={`w-24 h-24 mx-auto rounded-3xl flex items-center justify-center text-5xl mb-4 ${
            rewardData?.can_claim_today 
              ? 'bg-gradient-to-br from-amber-100 to-orange-100 animate-bounce' 
              : 'bg-gray-100'
          }`}>
            {rewardData?.can_claim_today ? todayReward?.icon : "✅"}
          </div>
          
          {rewardData?.can_claim_today ? (
            <>
              <p className="text-gray-600 mb-4">
                Day {currentDay} reward: <span className="font-bold text-amber-600">+{todayReward?.points} points</span>
              </p>
              <Button
                onClick={claimReward}
                disabled={claiming}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white px-8 py-3 rounded-full text-lg font-bold"
                data-testid="claim-btn"
              >
                {claiming ? (
                  <span className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Claiming...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Claim Reward!
                  </span>
                )}
              </Button>
            </>
          ) : (
            <p className="text-gray-500">
              You've already claimed today's reward! 🎉<br/>
              Come back tomorrow for more points.
            </p>
          )}
        </div>

        {/* 7-Day Calendar */}
        <div className="card-playful">
          <h3 className="font-bold text-gray-800 mb-4 font-heading flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-500" />
            7-Day Bonus Calendar
          </h3>
          
          <div className="grid grid-cols-7 gap-2">
            {dayRewards.map((reward, index) => {
              const dayNum = index + 1;
              const isCompleted = dayNum <= (rewardData?.current_streak || 0);
              const isCurrent = dayNum === currentDay && rewardData?.can_claim_today;
              const isLocked = dayNum > currentDay;
              
              return (
                <div
                  key={dayNum}
                  className={`relative flex flex-col items-center p-2 rounded-xl transition-all ${
                    isCompleted 
                      ? 'bg-green-100 border-2 border-green-300' 
                      : isCurrent 
                        ? 'bg-amber-100 border-2 border-amber-400 animate-pulse' 
                        : 'bg-gray-50 border-2 border-gray-200'
                  }`}
                >
                  <span className="text-xs text-gray-500 font-medium">Day {dayNum}</span>
                  <span className="text-2xl my-1">{reward.icon}</span>
                  <span className={`text-xs font-bold ${
                    isCompleted ? 'text-green-600' : isCurrent ? 'text-amber-600' : 'text-gray-400'
                  }`}>
                    +{reward.points}
                  </span>
                  
                  {isCompleted && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  
                  {isLocked && (
                    <div className="absolute inset-0 bg-white/50 rounded-xl flex items-center justify-center">
                      <Lock className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                  
                  {reward.special && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px] bg-purple-500 text-white px-1 rounded">
                      MEGA
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          
          <p className="text-xs text-gray-400 text-center mt-4">
            Complete all 7 days for a MEGA bonus! Streak resets if you miss a day.
          </p>
        </div>
      </main>
    </div>
  );
};

export default DailyRewards;
