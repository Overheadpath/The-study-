import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Award, Lock, Star, Trophy, Crown } from "lucide-react";

const BADGE_ICONS = {
  maths_master: "➗",
  english_expert: "📚",
  afrikaans_ace: "🇿🇦",
  science_star: "🔬",
  social_scholar: "🌍",
  life_skills_legend: "💪",
  tech_titan: "💻",
  creative_champion: "🎨",
  business_brain: "💼"
};

const BADGE_NAMES = {
  maths_master: "Maths Master",
  english_expert: "English Expert",
  afrikaans_ace: "Afrikaans Ace",
  science_star: "Science Star",
  social_scholar: "Social Scholar",
  life_skills_legend: "Life Skills Legend",
  tech_titan: "Tech Titan",
  creative_champion: "Creative Champion",
  business_brain: "Business Brain"
};

const TIER_COLORS = {
  1: { bg: "bg-amber-700", text: "text-amber-700", name: "Bronze" },
  2: { bg: "bg-gray-400", text: "text-gray-500", name: "Silver" },
  3: { bg: "bg-yellow-500", text: "text-yellow-600", name: "Gold" },
  4: { bg: "bg-purple-600", text: "text-purple-600", name: "Master" }
};

const Badges = ({ auth }) => {
  const navigate = useNavigate();
  const [badgeData, setBadgeData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBadges();
  }, [auth.currentKid?.id]);

  const fetchBadges = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const response = await api.get(`/badges/${auth.currentKid.id}`);
      setBadgeData(response.data);
    } catch (error) {
      console.error("Failed to fetch badges:", error);
      toast.error("Failed to load badges");
    } finally {
      setLoading(false);
    }
  };

  const getBadgeForType = (badgeType) => {
    return badgeData?.badges?.find(b => b.badge_type === badgeType);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  const allBadgeTypes = Object.keys(BADGE_NAMES);

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="badges-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => navigate("/student")}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-800 font-heading text-lg">My Badges</h1>
            <p className="text-sm text-gray-500">Complete tasks to unlock badges!</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Tier Legend */}
        <div className="card-playful mb-8">
          <h3 className="font-bold text-gray-800 mb-4 font-heading">Badge Tiers</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            {Object.entries(TIER_COLORS).map(([tier, colors]) => (
              <div key={tier} className="flex flex-col items-center gap-2">
                <div className={`w-10 h-10 ${colors.bg} rounded-full flex items-center justify-center`}>
                  {tier === "4" ? (
                    <Crown className="w-5 h-5 text-white" />
                  ) : (
                    <Star className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <p className={`font-bold text-sm ${colors.text}`}>{colors.name}</p>
                  <p className="text-xs text-gray-400">
                    {badgeData?.badge_tiers?.[tier]?.tasks_required || 0} tasks
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-4">
            Master tier badges give you <strong>100 bonus points</strong>!
          </p>
        </div>

        {/* Badge Grid */}
        <h3 className="font-bold text-gray-800 mb-4 font-heading">Your Badges</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger-children">
          {allBadgeTypes.map((badgeType) => {
            const badge = getBadgeForType(badgeType);
            const isUnlocked = !!badge;
            const tier = badge?.tier || 0;
            const tasksCompleted = badge?.tasks_completed || 0;
            
            // Find next tier requirements
            let nextTier = tier + 1;
            let tasksNeeded = badgeData?.badge_tiers?.[nextTier]?.tasks_required || 0;
            let progress = tier >= 4 ? 100 : (tasksCompleted / tasksNeeded) * 100;

            return (
              <div 
                key={badgeType}
                className={`card-playful animate-fade-in ${
                  !isUnlocked ? 'opacity-60' : ''
                } ${tier === 4 ? 'ring-2 ring-purple-400 bg-gradient-to-br from-purple-50 to-pink-50' : ''}`}
              >
                <div className="flex items-center gap-4">
                  {/* Badge Icon */}
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl ${
                    isUnlocked 
                      ? TIER_COLORS[tier]?.bg || 'bg-gray-200'
                      : 'bg-gray-200'
                  }`}>
                    {isUnlocked ? BADGE_ICONS[badgeType] : <Lock className="w-6 h-6 text-gray-400" />}
                  </div>

                  {/* Badge Info */}
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 font-heading">
                      {BADGE_NAMES[badgeType]}
                    </h4>
                    {isUnlocked ? (
                      <>
                        <p className={`text-sm font-semibold ${TIER_COLORS[tier]?.text}`}>
                          {TIER_COLORS[tier]?.name} Tier
                        </p>
                        <p className="text-xs text-gray-500">
                          {tasksCompleted} tasks completed
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500">
                        Complete 5 tasks to unlock
                      </p>
                    )}
                  </div>

                  {/* Tier Stars */}
                  {isUnlocked && (
                    <div className="flex flex-col items-center">
                      <div className="flex">
                        {[1, 2, 3, 4].map((t) => (
                          <Star 
                            key={t}
                            className={`w-4 h-4 ${
                              t <= tier 
                                ? 'text-amber-400 fill-amber-400' 
                                : 'text-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress to next tier */}
                {isUnlocked && tier < 4 && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Next: {TIER_COLORS[nextTier]?.name}</span>
                      <span>{tasksCompleted}/{tasksNeeded}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${TIER_COLORS[nextTier]?.bg} rounded-full transition-all`}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {tier === 4 && (
                  <div className="mt-4 text-center">
                    <span className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-semibold">
                      🏆 MAXED OUT!
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Badges;
