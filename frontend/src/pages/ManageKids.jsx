import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Users, Trash2, Edit2, UserPlus, Mail, Lock, Eye, EyeOff
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
  const [showPassword, setShowPassword] = useState(false);
  
  const [form, setForm] = useState({
    name: "",
    grade: "4",
    pin: "",
    avatar_color: AVATAR_COLORS[0],
    email: "",
    password: ""
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
      toast.error("Please fill in name and a 4-digit PIN");
      return;
    }

    // Validate email/password pair
    if (form.email && !form.password && !editingKid?.email) {
      toast.error("Please set a password for the email login");
      return;
    }

    setSaving(true);
    
    try {
      const payload = {
        name: form.name,
        grade: parseInt(form.grade),
        pin: form.pin,
        avatar_color: form.avatar_color
      };

      // Add email if provided
      if (form.email) {
        payload.email = form.email;
      }
      
      // Add password if provided
      if (form.password) {
        payload.password = form.password;
      }

      if (editingKid) {
        await api.put(`/kids/${editingKid.id}`, payload);
        toast.success("Kid updated!");
      } else {
        // Add family_id for new kids
        const familyData = localStorage.getItem("studyhelper_family");
        if (familyData) {
          const family = JSON.parse(familyData);
          payload.family_id = family.id;
        }
        await api.post("/kids", payload);
        toast.success("Kid added!");
      }
      
      setShowAddDialog(false);
      setEditingKid(null);
      setForm({ name: "", grade: "4", pin: "", avatar_color: AVATAR_COLORS[0], email: "", password: "" });
      fetchKids();
    } catch (error) {
      console.error("Failed to save:", error);
      const message = error.response?.data?.detail || "Failed to save kid";
      
      // Check if email already registered - offer to send share request
      if (message.includes("Email already registered") && form.email) {
        const confirmShare = window.confirm(
          `This email is already registered to another account.\n\nWould you like to send a SHARE REQUEST to that account?\n\nIf they approve, you'll both be able to see ${form.name}'s progress!`
        );
        
        if (confirmShare) {
          await sendShareRequest();
        }
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const sendShareRequest = async () => {
    try {
      const familyData = localStorage.getItem("studyhelper_family");
      if (!familyData) {
        toast.error("Please log in first");
        return;
      }
      const family = JSON.parse(familyData);
      
      const response = await api.post(`/share/request?family_id=${family.id}`, {
        to_email: form.email,
        kid_name: form.name,
        kid_grade: parseInt(form.grade),
        kid_pin: form.pin,
        kid_email: form.email,
        kid_password: form.password,
        avatar_color: form.avatar_color
      });
      
      toast.success("Share request sent! They'll need to approve it.");
      setShowAddDialog(false);
      setForm({ name: "", grade: "4", pin: "", avatar_color: AVATAR_COLORS[0], email: "", password: "" });
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to send share request";
      toast.error(message);
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
      avatar_color: kid.avatar_color || AVATAR_COLORS[0],
      email: kid.email || "",
      password: "" // Don't show existing password
    });
    setShowAddDialog(true);
  };

  const openAddDialog = () => {
    setEditingKid(null);
    setForm({ 
      name: "", 
      grade: "4", 
      pin: "", 
      avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      email: "",
      password: ""
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
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-sm text-gray-500">Grade {kid.grade}</span>
                      <span className="text-sm text-gray-400">PIN: {kid.pin}</span>
                      <span className="points-badge text-xs">{kid.points} pts</span>
                    </div>
                    {kid.email && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-indigo-600">
                        <Mail className="w-3 h-3" />
                        <span>{kid.email}</span>
                        <span className="bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-700 ml-1">Can login directly</span>
                      </div>
                    )}
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
          <h4 className="font-bold text-blue-800 mb-2 font-heading">💡 Kid Email Login</h4>
          <p className="text-sm text-blue-700">
            You can set up an email and password for each kid so they can log in directly to their student dashboard - without accessing parent features!
          </p>
        </div>
      </main>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((grade) => (
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
                Used for quick PIN login on shared devices
              </p>
            </div>

            {/* Divider */}
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-indigo-300" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-2 text-indigo-600 font-semibold">🔑 Kid's Own Login (Recommended)</span>
              </div>
            </div>

            {/* Email Login Section */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 space-y-3 border border-indigo-200">
              <p className="text-xs text-indigo-700 font-medium">
                ✨ Set up an email and password so your child can log in directly on the main login page - they'll only see their student dashboard!
              </p>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Kid's Email
                </label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="child@example.com"
                  data-testid="kid-email-input"
                />
              </div>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 mb-1 block">
                  <Lock className="w-4 h-4 inline mr-1" />
                  {editingKid?.email ? "New Password (leave blank to keep current)" : "Password"}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingKid?.email ? "••••••••" : "Set a password"}
                    data-testid="kid-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
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
