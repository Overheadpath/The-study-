import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Gift, Plus, Trash2, Edit2, Check, 
  Package, Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ManageRewards = ({ auth }) => {
  const navigate = useNavigate();
  const [rewards, setRewards] = useState([]);
  const [redemptions, setRedemptions] = useState([]);
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReward, setEditingReward] = useState(null);
  const [deletingReward, setDeletingReward] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    description: "",
    points_required: 50,
    image_url: "",
    quantity: -1
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rewardsRes, redemptionsRes, kidsRes] = await Promise.all([
        api.get("/rewards"),
        api.get("/redemptions?status=pending"),
        api.get("/kids")
      ]);
      setRewards(rewardsRes.data);
      setRedemptions(redemptionsRes.data);
      setKids(kidsRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load rewards");
    } finally {
      setLoading(false);
    }
  };

  const getKidName = (kidId) => {
    const kid = kids.find(k => k.id === kidId);
    return kid?.name || "Unknown";
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.points_required) {
      toast.error("Please fill in required fields");
      return;
    }

    setSaving(true);
    
    try {
      if (editingReward) {
        await api.put(`/rewards/${editingReward.id}`, form);
        toast.success("Reward updated!");
      } else {
        await api.post("/rewards", form);
        toast.success("Reward added!");
      }
      
      setShowAddDialog(false);
      setEditingReward(null);
      setForm({ name: "", description: "", points_required: 50, image_url: "", quantity: -1 });
      fetchData();
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save reward");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingReward) return;
    
    try {
      await api.delete(`/rewards/${deletingReward.id}`);
      toast.success("Reward deleted!");
      setDeletingReward(null);
      fetchData();
    } catch (error) {
      console.error("Failed to delete:", error);
      toast.error("Failed to delete reward");
    }
  };

  const handleMarkGiven = async (redemptionId) => {
    try {
      await api.put(`/redemptions/${redemptionId}/status?status=given`);
      toast.success("Marked as given!");
      fetchData();
    } catch (error) {
      console.error("Failed to update:", error);
      toast.error("Failed to update status");
    }
  };

  const openEditDialog = (reward) => {
    setEditingReward(reward);
    setForm({
      name: reward.name,
      description: reward.description,
      points_required: reward.points_required,
      image_url: reward.image_url,
      quantity: reward.quantity
    });
    setShowAddDialog(true);
  };

  const openAddDialog = () => {
    setEditingReward(null);
    setForm({ name: "", description: "", points_required: 50, image_url: "", quantity: -1 });
    setShowAddDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="manage-rewards-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/parent")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Manage Rewards</h1>
              <p className="text-sm text-gray-500">{rewards.length} rewards available</p>
            </div>
          </div>
          
          <Button 
            onClick={openAddDialog}
            className="btn-secondary"
            data-testid="add-reward-btn"
          >
            <Plus className="w-5 h-5 mr-1" />
            Add Reward
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Pending Redemptions */}
        {redemptions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading flex items-center gap-2">
              <Package className="w-5 h-5 text-purple-500" />
              Rewards to Give ({redemptions.length})
            </h2>
            <div className="space-y-3">
              {redemptions.map((redemption) => (
                <div 
                  key={redemption.id} 
                  className="card-playful bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                      <Gift className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800">{redemption.reward_name}</h4>
                      <p className="text-sm text-gray-500">
                        Claimed by <span className="font-semibold text-purple-600">{getKidName(redemption.kid_id)}</span>
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleMarkGiven(redemption.id)}
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid={`mark-given-${redemption.id}`}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Mark Given
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rewards List */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 font-heading">All Rewards</h2>
        {rewards.length === 0 ? (
          <div className="text-center py-12 card-playful animate-fade-in">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Gift className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-heading">No Rewards Yet</h3>
            <p className="text-gray-500 mb-4">Add rewards that your kids can earn!</p>
            <Button onClick={openAddDialog} className="btn-secondary">
              <Plus className="w-5 h-5 mr-1" />
              Add First Reward
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {rewards.map((reward) => (
              <div key={reward.id} className="reward-card animate-fade-in">
                <div className="relative">
                  <img 
                    src={reward.image_url || "https://images.unsplash.com/photo-1666302936888-d41e661bc3dd?w=400"} 
                    alt={reward.name}
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      e.target.src = "https://images.unsplash.com/photo-1666302936888-d41e661bc3dd?w=400";
                    }}
                  />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      onClick={() => openEditDialog(reward)}
                      className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                      data-testid={`edit-${reward.id}`}
                    >
                      <Edit2 className="w-4 h-4 text-gray-600" />
                    </button>
                    <button
                      onClick={() => setDeletingReward(reward)}
                      className="p-2 bg-white/90 rounded-lg hover:bg-white transition-colors"
                      data-testid={`delete-${reward.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-bold text-gray-800 font-heading">{reward.name}</h3>
                  <p className="text-sm text-gray-500 mb-2 line-clamp-1">{reward.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="points-badge text-xs">{reward.points_required} pts</span>
                    <span className="text-xs text-gray-400">
                      {reward.quantity === -1 ? "Unlimited" : `${reward.quantity} left`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Gift className="w-6 h-6 text-amber-500" />
              {editingReward ? "Edit Reward" : "Add New Reward"}
            </DialogTitle>
            <DialogDescription>
              Create an exciting reward for your kids to earn!
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Pokemon Booster Pack"
                data-testid="reward-name-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe this awesome reward..."
                rows={2}
                className="resize-none"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Points Required *
              </label>
              <Input
                type="number"
                value={form.points_required}
                onChange={(e) => setForm({ ...form, points_required: parseInt(e.target.value) || 0 })}
                min={1}
                data-testid="reward-points-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                Image URL
              </label>
              <Input
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                placeholder="https://..."
              />
              <p className="text-xs text-gray-400 mt-1">
                Paste an image URL or leave blank for default
              </p>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">
                Quantity (-1 = unlimited)
              </label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) })}
                min={-1}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-amber-400 to-orange-500"
              data-testid="save-reward-btn"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                editingReward ? "Save Changes" : "Add Reward"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingReward} onOpenChange={() => setDeletingReward(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reward?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingReward?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageRewards;
