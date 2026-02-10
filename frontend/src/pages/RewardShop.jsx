import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Gift, Trophy, ShoppingCart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const RewardShop = ({ auth }) => {
  const navigate = useNavigate();
  const [rewards, setRewards] = useState([]);
  const [kidData, setKidData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedReward, setSelectedReward] = useState(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    fetchData();
  }, [auth.currentKid?.id]);

  const fetchData = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const [rewardsRes, kidRes] = await Promise.all([
        api.get("/rewards"),
        api.get(`/kids/${auth.currentKid.id}`)
      ]);
      setRewards(rewardsRes.data);
      setKidData(kidRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load rewards");
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!selectedReward) return;
    
    setRedeeming(true);
    
    try {
      await api.post(`/rewards/${selectedReward.id}/redeem?kid_id=${auth.currentKid.id}`);
      toast.success(`You got ${selectedReward.name}! Ask your parent for it!`);
      setSelectedReward(null);
      await auth.refreshKid();
      fetchData();
    } catch (error) {
      console.error("Failed to redeem:", error);
      toast.error(error.response?.data?.detail || "Failed to redeem reward");
    } finally {
      setRedeeming(false);
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
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="reward-shop-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
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
                <h1 className="font-bold text-gray-800 font-heading">Reward Shop</h1>
                <p className="text-xs text-gray-500">Spend your points!</p>
              </div>
            </div>
          </div>
          
          <div className="points-badge" data-testid="points-display">
            <Trophy className="w-5 h-5" />
            {kidData?.points || 0} pts
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {rewards.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Gift className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 font-heading">No Rewards Yet</h2>
            <p className="text-gray-500">Ask your parent to add some cool rewards!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
            {rewards.map((reward) => {
              const canAfford = (kidData?.points || 0) >= reward.points_required;
              const outOfStock = reward.quantity === 0;
              
              return (
                <div 
                  key={reward.id} 
                  className={`reward-card animate-fade-in ${!canAfford || outOfStock ? 'opacity-60' : ''}`}
                >
                  <div className="relative">
                    <img 
                      src={reward.image_url} 
                      alt={reward.name}
                      className="w-full h-40 object-cover"
                      onError={(e) => {
                        e.target.src = "https://images.unsplash.com/photo-1666302936888-d41e661bc3dd?w=400";
                      }}
                    />
                    {outOfStock && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="bg-red-500 text-white px-4 py-2 rounded-full font-bold">
                          Out of Stock
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-800 font-heading text-lg mb-1">
                      {reward.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                      {reward.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="points-badge text-sm">
                        {reward.points_required} pts
                      </div>
                      <Button
                        onClick={() => setSelectedReward(reward)}
                        disabled={!canAfford || outOfStock}
                        className={`rounded-full ${
                          canAfford && !outOfStock 
                            ? 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600' 
                            : 'bg-gray-200 text-gray-400'
                        }`}
                        data-testid={`redeem-${reward.id}`}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        {canAfford ? 'Get It!' : 'Need More'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-amber-500" />
              Get this reward?
            </DialogTitle>
            <DialogDescription>
              You're about to spend <strong>{selectedReward?.points_required} points</strong> on:
            </DialogDescription>
          </DialogHeader>
          
          {selectedReward && (
            <div className="py-4">
              <div className="flex items-center gap-4">
                <img 
                  src={selectedReward.image_url} 
                  alt={selectedReward.name}
                  className="w-20 h-20 object-cover rounded-xl"
                />
                <div>
                  <h4 className="font-bold text-gray-800 font-heading">{selectedReward.name}</h4>
                  <p className="text-sm text-gray-500">{selectedReward.description}</p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-amber-50 rounded-xl">
                <p className="text-sm text-amber-700">
                  After this, you'll have <strong>{(kidData?.points || 0) - selectedReward.points_required} points</strong> left.
                </p>
              </div>
            </div>
          )}
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => setSelectedReward(null)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRedeem}
              disabled={redeeming}
              className="bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600"
              data-testid="confirm-redeem-btn"
            >
              {redeeming ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" />
                  Yes, Get It!
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RewardShop;
