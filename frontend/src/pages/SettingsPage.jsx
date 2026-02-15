import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, LogOut, User, Bell, Shield, 
  Moon, Sun, HelpCircle, ChevronRight, Crown, Lock, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AVATAR_PRESETS } from "@/constants/avatars";

const SettingsPage = ({ auth, family, onLogout, onUpdateFamily, userType }) => {
  const navigate = useNavigate();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('theme'));
  });

  // Apply dark mode
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);
  
  // Profile form
  const [profileForm, setProfileForm] = useState({
    family_name: family?.family_name || "",
    avatar_id: family?.avatar_id || "fox",
    avatar_emoji: family?.avatar_emoji || "🦊",
    avatar_color: family?.avatar_color || "#FF6B35",
    email_notifications: family?.email_notifications !== false
  });
  
  // Password form
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: ""
  });

  const handleLogout = () => {
    onLogout();
    window.history.replaceState(null, "", "/");
    navigate("/", { replace: true });
  };

  const handleBack = () => {
    if (userType === "kid") {
      navigate("/student", { replace: true });
    } else {
      navigate("/family", { replace: true });
    }
  };

  const handleProfileSave = async () => {
    if (!family?.id) return;
    setLoading(true);
    try {
      const response = await api.put(`/profile/${family.id}`, {
        family_name: profileForm.family_name,
        avatar_id: profileForm.avatar_id,
        avatar_emoji: profileForm.avatar_emoji,
        avatar_color: profileForm.avatar_color,
        email_notifications: profileForm.email_notifications
      });
      
      // Update the family in parent state
      if (onUpdateFamily) {
        onUpdateFamily(response.data);
      }
      
      toast.success("Profile updated!");
      setShowProfileDialog(false);
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!family?.id) return;
    
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error("New passwords don't match");
      return;
    }
    
    if (passwordForm.new_password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    
    setLoading(true);
    try {
      await api.post(`/profile/${family.id}/change-password`, {
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password
      });
      
      toast.success("Password changed successfully!");
      setShowPasswordDialog(false);
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
    } catch (error) {
      console.error("Failed to change password:", error);
      const message = error.response?.data?.detail || "Failed to change password";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const selectAvatar = (avatar) => {
    setProfileForm({
      ...profileForm,
      avatar_id: avatar.id,
      avatar_emoji: avatar.emoji,
      avatar_color: avatar.color
    });
  };

  const currentUser = userType === "kid" ? auth?.currentKid : family;
  const userName = userType === "kid" ? auth?.currentKid?.name : family?.family_name;
  const avatarEmoji = family?.avatar_emoji || "🦊";
  const avatarColor = family?.avatar_color || "#4F46E5";

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="settings-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            data-testid="back-btn"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="font-bold text-gray-800 font-heading text-lg">Settings</h1>
            <p className="text-sm text-gray-500">Manage your account</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* Profile Card */}
        <div className="card-playful mb-6">
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: avatarColor }}
            >
              {avatarEmoji}
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-gray-800 text-lg font-heading">{userName}</h2>
              <p className="text-sm text-gray-500">
                {userType === "kid" ? `Grade ${auth?.currentKid?.grade}` : currentUser?.email}
              </p>
              {family?.is_premium && (
                <span className="inline-flex items-center gap-1 text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-white px-2 py-0.5 rounded-full font-semibold mt-1">
                  <Crown className="w-3 h-3" /> Premium
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Settings Sections */}
        <div className="space-y-3">
          {/* Account Section */}
          <div className="card-playful">
            <h3 className="font-bold text-gray-800 mb-3 font-heading text-sm uppercase tracking-wide">Account</h3>
            <div className="space-y-1">
              <button 
                onClick={() => setShowProfileDialog(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                data-testid="profile-btn"
              >
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Profile</p>
                  <p className="text-sm text-gray-500">Edit name & avatar</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>

              <div 
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Bell className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Email Notifications</p>
                  <p className="text-sm text-gray-500">
                    {profileForm.email_notifications ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <Switch 
                  checked={profileForm.email_notifications}
                  onCheckedChange={async (checked) => {
                    setProfileForm(prev => ({ ...prev, email_notifications: checked }));
                    // Auto-save notification preference
                    if (family?.id) {
                      try {
                        await api.put(`/profile/${family.id}`, { email_notifications: checked });
                        toast.success(checked ? "Notifications enabled" : "Notifications disabled");
                      } catch (e) {
                        toast.error("Failed to update preference");
                      }
                    }
                  }}
                />
              </div>

              <button 
                onClick={() => setShowPasswordDialog(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                data-testid="password-btn"
              >
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Change Password</p>
                  <p className="text-sm text-gray-500">Update your password</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Support Section */}
          <div className="card-playful">
            <h3 className="font-bold text-gray-800 mb-3 font-heading text-sm uppercase tracking-wide">Support</h3>
            <div className="space-y-1">
              <a 
                href="mailto:support@studyhelper.com"
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Help & Support</p>
                  <p className="text-sm text-gray-500">Contact us for help</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </a>
            </div>
          </div>

          {/* Logout Button */}
          <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
            <AlertDialogTrigger asChild>
              <button 
                className="w-full card-playful flex items-center gap-3 p-4 hover:bg-red-50 hover:border-red-200 transition-colors text-left"
                data-testid="logout-btn"
              >
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <LogOut className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-red-600">Sign Out</p>
                  <p className="text-sm text-gray-500">Log out of your account</p>
                </div>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign Out?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to sign out? You'll need to log in again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleLogout}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Sign Out
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* App Info */}
        <div className="mt-8 text-center text-sm text-gray-400">
          <p>Study Helper v1.0.0</p>
          <p className="mt-1">Made with love for learners everywhere</p>
        </div>
      </main>

      {/* Profile Edit Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-600" />
              Edit Profile
            </DialogTitle>
            <DialogDescription>
              Update your family name and avatar
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Avatar Selection */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Choose Avatar</label>
              <div className="flex justify-center mb-3">
                <div 
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg"
                  style={{ backgroundColor: profileForm.avatar_color }}
                >
                  {profileForm.avatar_emoji}
                </div>
              </div>
              <div className="grid grid-cols-8 gap-2 max-h-[120px] overflow-y-auto p-1">
                {AVATAR_PRESETS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => selectAvatar(avatar)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all hover:scale-110 ${
                      profileForm.avatar_id === avatar.id ? 'ring-2 ring-indigo-500 ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: avatar.color }}
                  >
                    {avatar.emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Family Name */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Family Name</label>
              <Input
                value={profileForm.family_name}
                onChange={(e) => setProfileForm({ ...profileForm, family_name: e.target.value })}
                placeholder="Enter family name"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleProfileSave} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-600" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Current Password</label>
              <Input
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">New Password</label>
              <Input
                type="password"
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                placeholder="Enter new password (min 6 characters)"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Confirm New Password</label>
              <Input
                type="password"
                value={passwordForm.confirm_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                placeholder="Confirm new password"
              />
              {passwordForm.new_password && passwordForm.confirm_password && 
                passwordForm.new_password === passwordForm.confirm_password && (
                <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handlePasswordChange} 
              disabled={loading || !passwordForm.current_password || !passwordForm.new_password}
            >
              {loading ? "Changing..." : "Change Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
