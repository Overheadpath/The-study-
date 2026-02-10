import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Users, Plus, Trash2, Edit2, UserPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const AVATAR_COLORS = [
  "#4F46E5", "#7C3AED", "#EC4899", "#EF4444", 
  "#F59E0B", "#10B981", "#06B6D4", "#3B82F6"
];

const ManageKids = ({ auth }) => {
  const navigate = useNavigate();
  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingKid, setEditingKid] = useState(null);
  const [deletingKid, setDeletingKid] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    grade: "4",
    pin: "",
    avatar_color: AVATAR_COLORS[0]
  });

  useEffect(() => {
    fetchKids();
  }, []);

  const fetchKids = async () => {
    try {
      const response = await api.get("/kids");
      setKids(response.data);
    } catch (error) {
      console.error("Failed to fetch kids:", error);
      toast.error("Failed to load kids");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.pin || form.pin.length !== 4) {
      toast.error("Please fill in all fields with a 4-digit PIN");
      return;
    }

    setSaving(true);
    
    try {
      if (editingKid) {
        await api.put(`/kids/${editingKid.id}`, {
          name: form.name,
          grade: parseInt(form.grade),
          pin: form.pin,
          avatar_color: form.avatar_color
        });
        toast.success("Kid updated!");
      } else {
        await api.post("/kids", {
          name: form.name,
          grade: parseInt(form.grade),
          pin: form.pin,
          avatar_color: form.avatar_color
        });
        toast.success("Kid added!");
      }
      
      setShowAddDialog(false);
      setEditingKid(null);
      setForm({ name: "", grade: "4", pin: "", avatar_color: AVATAR_COLORS[0] });
      fetchKids();
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("Failed to save kid");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingKid) return;
    
    try {
      await api.delete(`/kids/${deletingKid.id}`);
      toast.success("Kid removed");
      setDeletingKid(null);
      fetchKids();
    } catch (error) {
      console.error("Failed to delete:", error);
      toast.error("Failed to remove kid");
    }
  };

  const openEditDialog = (kid) => {
    setEditingKid(kid);
    setForm({
      name: kid.name,
      grade: kid.grade.toString(),
      pin: kid.pin,
      avatar_color: kid.avatar_color || AVATAR_COLORS[0]
    });
    setShowAddDialog(true);
  };

  const openAddDialog = () => {
    setEditingKid(null);
    setForm({ 
      name: "", 
      grade: "4", 
      pin: "", 
      avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] 
    });
    setShowAddDialog(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="manage-kids-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/parent")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Manage Kids</h1>
              <p className="text-sm text-gray-500">{kids.length} kids registered</p>
            </div>
          </div>
          
          <Button 
            onClick={openAddDialog}
            className="btn-accent"
            data-testid="add-kid-btn"
          >
            <UserPlus className="w-5 h-5 mr-1" />
            Add Kid
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {kids.length === 0 ? (
          <div className="text-center py-12 card-playful animate-fade-in">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-heading">No Kids Yet</h3>
            <p className="text-gray-500 mb-4">Add your children to get started!</p>
            <Button onClick={openAddDialog} className="btn-accent">
              <UserPlus className="w-5 h-5 mr-1" />
              Add First Kid
            </Button>
          </div>
        ) : (
          <div className="space-y-4 stagger-children">
            {kids.map((kid) => (
              <div key={kid.id} className="card-playful animate-fade-in">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl font-heading flex-shrink-0"
                    style={{ backgroundColor: kid.avatar_color || "#4F46E5" }}
                  >
                    {kid.name.charAt(0)}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-800 font-heading text-xl">{kid.name}</h3>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm text-gray-500">Grade {kid.grade}</span>
                      <span className="text-sm text-gray-400">PIN: {kid.pin}</span>
                      <span className="points-badge text-xs">{kid.points} pts</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditDialog(kid)}
                      className="p-3 hover:bg-gray-100 rounded-xl transition-colors"
                      data-testid={`edit-${kid.id}`}
                    >
                      <Edit2 className="w-5 h-5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => setDeletingKid(kid)}
                      className="p-3 hover:bg-red-50 rounded-xl transition-colors"
                      data-testid={`delete-${kid.id}`}
                    >
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tips */}
        <div className="mt-8 card-playful bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <h4 className="font-bold text-blue-800 mb-2 font-heading">CAPS Grades Supported</h4>
          <p className="text-sm text-blue-700">
            Grades 4-9 with appropriate subjects. The AI tutor adapts to each child's grade level!
          </p>
        </div>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl flex items-center gap-2">
              <Users className="w-6 h-6 text-emerald-500" />
              {editingKid ? "Edit Kid" : "Add New Kid"}
            </DialogTitle>
            <DialogDescription>
              Set up a profile for your child
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Avatar Color */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Avatar Color</label>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setForm({ ...form, avatar_color: color })}
                    className={`w-10 h-10 rounded-xl transition-all ${
                      form.avatar_color === color 
                        ? 'ring-4 ring-offset-2 ring-gray-300 scale-110' 
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Name *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Child's name"
                data-testid="kid-name-input"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Grade *</label>
              <Select 
                value={form.grade} 
                onValueChange={(value) => setForm({ ...form, grade: value })}
              >
                <SelectTrigger data-testid="kid-grade-select">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {[4, 5, 6, 7, 8, 9].map((grade) => (
                    <SelectItem key={grade} value={grade.toString()}>
                      Grade {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">4-Digit PIN *</label>
              <Input
                type="password"
                value={form.pin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setForm({ ...form, pin: value });
                }}
                placeholder="****"
                maxLength={4}
                className="text-center text-2xl tracking-widest"
                data-testid="kid-pin-input"
              />
              <p className="text-xs text-gray-400 mt-1">
                This PIN is used by the child to log in
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={saving}
              className="bg-gradient-to-r from-emerald-500 to-teal-600"
              data-testid="save-kid-btn"
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                editingKid ? "Save Changes" : "Add Kid"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingKid} onOpenChange={() => setDeletingKid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Kid?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{deletingKid?.name}"? All their tasks and points will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageKids;
