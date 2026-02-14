import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, LogOut, User, Bell, Shield, 
  Palette, HelpCircle, ChevronRight, Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

const SettingsPage = ({ auth, family, onLogout, userType }) => {
  const navigate = useNavigate();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogout = () => {
    onLogout();
    // Clear history and redirect to landing
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

  const currentUser = userType === "kid" ? auth?.currentKid : family;
  const userName = userType === "kid" ? auth?.currentKid?.name : family?.family_name;

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
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl font-heading"
              style={{ backgroundColor: currentUser?.avatar_color || "#4F46E5" }}
            >
              {userName?.charAt(0) || "U"}
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
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Profile</p>
                  <p className="text-sm text-gray-500">Edit your profile info</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>

              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Bell className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Notifications</p>
                  <p className="text-sm text-gray-500">Manage notifications</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>

              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Privacy & Security</p>
                  <p className="text-sm text-gray-500">Password and security settings</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="card-playful">
            <h3 className="font-bold text-gray-800 mb-3 font-heading text-sm uppercase tracking-wide">Preferences</h3>
            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 bg-pink-100 rounded-xl flex items-center justify-center">
                  <Palette className="w-5 h-5 text-pink-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Appearance</p>
                  <p className="text-sm text-gray-500">Theme and display</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Support Section */}
          <div className="card-playful">
            <h3 className="font-bold text-gray-800 mb-3 font-heading text-sm uppercase tracking-wide">Support</h3>
            <div className="space-y-1">
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <HelpCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-800">Help & Support</p>
                  <p className="text-sm text-gray-500">Get help with Study Helper</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
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
                  Are you sure you want to sign out? You'll need to log in again to access your account.
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
    </div>
  );
};

export default SettingsPage;
