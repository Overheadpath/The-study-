import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Target, Plus, Trophy, Clock, CheckCircle, 
  Trash2, Users, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const WeeklyChallenges = ({ auth }) => {
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState([]);
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    title: "",
    description: "",
    points_reward: 25,
    target_kid_id: "",
    deadline: ""
  });

  // Check if user is a parent - either by mode or by checking if accessed via /parent/ route
  const isParent = auth.mode === "parent" || window.location.pathname.startsWith("/parent");

  useEffect(() => {
    fetchData();
  }, [auth.currentKid?.id, auth.mode]);

  const fetchData = async () => {
    try {
      const [challengesRes, kidsRes] = await Promise.all([
        api.get(`/challenges${isParent ? '' : `?kid_id=${auth.currentKid?.id}`}`),
        api.get("/kids")
      ]);
      setChallenges(challengesRes.data);
      setKids(kidsRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title || !form.points_reward || !form.deadline) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSaving(true);
    try {
      await api.post("/challenges", {
        ...form,
        target_kid_id: form.target_kid_id || null
      });
      toast.success("Challenge created!");
      setShowAddDialog(false);
      setForm({ title: "", description: "", points_reward: 25, target_kid_id: "", deadline: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to create:", error);
      toast.error("Failed to create challenge");
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (challengeId) => {
    try {
      const response = await api.post(`/challenges/${challengeId}/complete?kid_id=${auth.currentKid.id}`);
      toast.success(`Challenge completed! +${response.data.points_earned} points!`);
      await auth.refreshKid();
      fetchData();
    } catch (error) {
      console.error("Failed to complete:", error);
      toast.error(error.response?.data?.detail || "Failed to complete challenge");
    }
  };

  const handleDelete = async (challengeId) => {
    if (!confirm("Delete this challenge?")) return;
    
    try {
      await api.delete(`/challenges/${challengeId}`);
      toast.success("Challenge deleted");
      fetchData();
    } catch (error) {
      console.error("Failed to delete:", error);
      toast.error("Failed to delete challenge");
    }
  };

  const isCompleted = (challenge) => {
    return challenge.completed_by?.includes(auth.currentKid?.id);
  };

  const getKidName = (kidId) => {
    const kid = kids.find(k => k.id === kidId);
    return kid?.name || "Everyone";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="challenges-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(isParent ? "/parent" : "/student")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Weekly Challenges</h1>
              <p className="text-sm text-gray-500">
                {isParent ? "Create challenges for your kids" : "Complete for bonus points!"}
              </p>
            </div>
          </div>
          
          {isParent && (
            <Button 
              onClick={() => setShowAddDialog(true)}
              className="btn-secondary"
              data-testid="add-challenge-btn"
            >
              <Plus className="w-5 h-5 mr-1" />
              New Challenge
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {challenges.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-purple-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 font-heading">No Challenges Yet</h2>
            <p className="text-gray-500">
              {isParent 
                ? "Create a challenge to motivate your kids!" 
                : "Ask your parent to create some challenges!"}
            </p>
          </div>
        ) : (
          <div className="space-y-4 stagger-children">
            {challenges.map((challenge) => {
              const completed = isCompleted(challenge);
              
              return (
                <div 
                  key={challenge.id}
                  className={`card-playful animate-fade-in ${
                    completed 
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' 
                      : 'hover:border-purple-300'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      completed 
                        ? 'bg-green-100' 
                        : 'bg-purple-100'
                    }`}>
                      {completed ? (
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      ) : (
                        <Target className="w-6 h-6 text-purple-600" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-800 font-heading">{challenge.title}</h3>
                        {completed && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            Completed!
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{challenge.description}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Trophy className="w-3 h-3 text-amber-500" />
                          {challenge.points_reward} points
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due: {new Date(challenge.deadline).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          For: {challenge.target_kid_id ? getKidName(challenge.target_kid_id) : "Everyone"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {!isParent && !completed && (
                        <Button
                          onClick={() => handleComplete(challenge.id)}
                          size="sm"
                          className="bg-purple-600 hover:bg-purple-700"
                          data-testid={`complete-${challenge.id}`}
                        >
                          Complete
                        </Button>
                      )}
                      {isParent && (
                        <button
                          onClick={() => handleDelete(challenge.id)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Challenge Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Target className="w-6 h-6 text-purple-500" />
              New Challenge
            </DialogTitle>
            <DialogDescription>
              Create a challenge for your kids to complete
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Title *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Read for 30 minutes"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the challenge..."
                rows={2}
                className="resize-none"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Points Reward *</label>
              <Input
                type="number"
                value={form.points_reward}
                onChange={(e) => setForm({ ...form, points_reward: parseInt(e.target.value) || 0 })}
                min={1}
                max={100}
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">For Who?</label>
              <Select 
                value={form.target_kid_id} 
                onValueChange={(value) => setForm({ ...form, target_kid_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Everyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Everyone</SelectItem>
                  {kids.map((kid) => (
                    <SelectItem key={kid.id} value={kid.id}>
                      {kid.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Deadline *</label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                "Create Challenge"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WeeklyChallenges;
