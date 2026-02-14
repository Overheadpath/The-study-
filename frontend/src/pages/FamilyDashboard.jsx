import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  Users, Star, Crown, Check, Gift, BookOpen, 
  ChevronRight, LogOut, Settings, CreditCard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ShareNotifications from "@/components/ShareNotifications";
import ReferralProgram from "@/components/ReferralProgram";

const FamilyDashboard = ({ family, onLogout, onSelectKid, onUpdateFamily }) => {
  const navigate = useNavigate();
  const [kids, setKids] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [family?.id]);

  const fetchData = async () => {
    if (!family?.id) return;
    
    try {
      const [kidsRes, subRes] = await Promise.all([
        api.get(`/kids?family_id=${family.id}`),
        api.get(`/subscription/status/${family.id}`)
      ]);
      setKids(kidsRes.data);
      setSubscription(subRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      const response = await api.post(
        `/subscription/checkout?family_id=${family.id}&origin_url=${window.location.origin}`
      );
      window.location.href = response.data.checkout_url;
    } catch (error) {
      console.error("Failed to create checkout:", error);
      toast.error("Failed to start checkout. Try again.");
    }
  };

  const handleKidLogin = (kid) => {
    onSelectKid(kid);
    navigate("/student");
  };

  const handleParentMode = () => {
    navigate("/parent");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="family-dashboard">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">{family?.family_name}</h1>
              <div className="flex items-center gap-2">
                {subscription?.is_premium ? (
                  <span className="text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-white px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Premium
                  </span>
                ) : (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold">
                    Free Plan
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <ReferralProgram family={family} />
            <ShareNotifications familyId={family?.id} />
            <button 
              onClick={() => navigate("/settings")}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              data-testid="settings-btn"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Premium Banner for Free Users */}
        {!subscription?.is_premium && (
          <div className="card-playful bg-gradient-to-r from-indigo-500 to-purple-600 text-white mb-8 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Crown className="w-7 h-7 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-bold text-lg font-heading">Upgrade to Premium</h3>
                  <p className="text-indigo-100 text-sm">
                    Unlimited kids, AI questions & more for just R20/month
                  </p>
                </div>
              </div>
              <Button 
                onClick={handleUpgrade}
                className="bg-white text-indigo-600 hover:bg-gray-100"
                data-testid="upgrade-btn"
              >
                Upgrade Now
              </Button>
            </div>
          </div>
        )}

        {/* Who's Studying? */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">Who's Studying Today?</h2>
        
        {kids.length === 0 ? (
          <div className="card-playful text-center py-12 mb-8">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-800 mb-2 font-heading">No Children Yet</h3>
            <p className="text-gray-500 mb-4">Add your first child to get started!</p>
            <Button 
              onClick={handleParentMode}
              className="btn-primary"
            >
              Add Child
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {kids.map((kid) => (
              <button
                key={kid.id}
                onClick={() => handleKidLogin(kid)}
                className="card-playful flex items-center gap-4 hover:border-indigo-300 transition-all hover:scale-[1.02]"
                data-testid={`kid-${kid.id}`}
              >
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl font-heading flex-shrink-0"
                  style={{ backgroundColor: kid.avatar_color || "#4F46E5" }}
                >
                  {kid.name.charAt(0)}
                </div>
                <div className="flex-1 text-left">
                  <h3 className="font-bold text-gray-800 font-heading text-lg">{kid.name}</h3>
                  <p className="text-sm text-gray-500">Grade {kid.grade}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                      {kid.points} pts
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">Parent Actions</h2>
        <div className="space-y-3">
          <button
            onClick={handleParentMode}
            className="w-full card-playful flex items-center gap-4 hover:border-amber-300"
            data-testid="parent-mode-btn"
          >
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="font-bold text-gray-800 font-heading">Parent Dashboard</h3>
              <p className="text-sm text-gray-500">Manage kids, rewards & approve tasks</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>

          {!subscription?.is_premium && (
            <button
              onClick={handleUpgrade}
              className="w-full card-playful flex items-center gap-4 hover:border-purple-300 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 text-left">
                <h3 className="font-bold text-gray-800 font-heading">Upgrade to Premium</h3>
                <p className="text-sm text-gray-500">R20/month • Unlimited everything</p>
              </div>
              <ChevronRight className="w-5 h-5 text-purple-400" />
            </button>
          )}
        </div>

        {/* Subscription Info */}
        <div className="mt-8 card-playful bg-gray-50">
          <h3 className="font-bold text-gray-800 mb-3 font-heading">Your Plan</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Children</p>
              <p className="font-semibold text-gray-800">
                {kids.length} / {subscription?.is_premium ? "Unlimited" : subscription?.max_children}
              </p>
            </div>
            <div>
              <p className="text-gray-500">AI Questions Today</p>
              <p className="font-semibold text-gray-800">
                {subscription?.is_premium ? "Unlimited" : `${subscription?.ai_questions_remaining} left`}
              </p>
            </div>
          </div>
          {subscription?.is_premium && subscription?.expires && (
            <p className="text-xs text-gray-400 mt-3">
              Premium expires: {new Date(subscription.expires).toLocaleDateString()}
            </p>
          )}
        </div>
      </main>

      {/* Ad Banner for Free Users */}
      {!subscription?.is_premium && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-100 border-t border-gray-200 py-2 px-4 text-center text-sm text-gray-500">
          <span className="opacity-50">Educational Partner Ads • Upgrade to remove</span>
        </div>
      )}
    </div>
  );
};

export default FamilyDashboard;
