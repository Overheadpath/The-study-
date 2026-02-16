import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

// Components
import InstallPrompt from "@/components/InstallPrompt";

// Pages
import LandingPage from "@/pages/LandingPage";
import RegisterPage from "@/pages/RegisterPage";
import LoginPage from "@/pages/LoginPage";
import FamilyDashboard from "@/pages/FamilyDashboard";
import PinEntry from "@/pages/PinEntry";
import StudentDashboard from "@/pages/StudentDashboard";
import ParentDashboard from "@/pages/ParentDashboard";
import AITutor from "@/pages/AITutor";
import SubmitTask from "@/pages/SubmitTask";
import RewardShop from "@/pages/RewardShop";
import TaskApproval from "@/pages/TaskApproval";
import ManageRewards from "@/pages/ManageRewards";
import ManageKids from "@/pages/ManageKids";
import PointsHistory from "@/pages/PointsHistory";
import DailyRewards from "@/pages/DailyRewards";
import TypingPractice from "@/pages/TypingPractice";
import Leaderboard from "@/pages/Leaderboard";
import Badges from "@/pages/Badges";
import WeeklyChallenges from "@/pages/WeeklyChallenges";
import PaymentSuccess from "@/pages/PaymentSuccess";
import Certificates from "@/pages/Certificates";
import SettingsPage from "@/pages/SettingsPage";
import HomeworkScanner from "@/pages/HomeworkScanner";
import ProgressReport from "@/pages/ProgressReport";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import TermsOfService from "@/pages/TermsOfService";

// New User System Pages
import NewRegisterPage from "@/pages/NewRegisterPage";
import NewLoginPage from "@/pages/NewLoginPage";
import UserDashboard from "@/pages/UserDashboard";
import JoinGroupPage from "@/pages/JoinGroupPage";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Create axios instance
export const api = axios.create({
  baseURL: API,
  headers: {
    "Content-Type": "application/json",
  },
});

// Auth hook
export const useAuth = () => {
  // Initialize state directly from localStorage (synchronous)
  const getInitialFamily = () => {
    try {
      const saved = localStorage.getItem("studyhelper_family");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Error reading family from localStorage:", e);
      return null;
    }
  };

  const getInitialKid = () => {
    try {
      const saved = localStorage.getItem("studyhelper_current_kid");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Error reading kid from localStorage:", e);
      return null;
    }
  };

  const [family, setFamily] = useState(getInitialFamily);
  const [currentKid, setCurrentKid] = useState(getInitialKid);
  const [mode, setMode] = useState(() => localStorage.getItem("studyhelper_mode") || null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!(getInitialFamily() || getInitialKid());
  });
  const [isLoading, setIsLoading] = useState(false); // Start as false since we init synchronously

  const loginFamily = useCallback((familyData) => {
    setFamily(familyData);
    setIsAuthenticated(true);
    try {
      localStorage.setItem("studyhelper_family", JSON.stringify(familyData));
    } catch (e) {
      console.error("Error saving family to localStorage:", e);
    }
  }, []);

  const selectKid = useCallback((kid) => {
    setCurrentKid(kid);
    setMode("student");
    setIsAuthenticated(true);
    try {
      localStorage.setItem("studyhelper_current_kid", JSON.stringify(kid));
      localStorage.setItem("studyhelper_mode", "student");
    } catch (e) {
      console.error("Error saving kid to localStorage:", e);
    }
  }, []);

  const enterParentMode = useCallback(() => {
    setMode("parent");
    setIsAuthenticated(true);
    setCurrentKid(null);
    try {
      localStorage.setItem("studyhelper_mode", "parent");
      localStorage.removeItem("studyhelper_current_kid");
    } catch (e) {
      console.error("Error saving mode to localStorage:", e);
    }
  }, []);

  const logout = useCallback(() => {
    setFamily(null);
    setCurrentKid(null);
    setMode(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem("studyhelper_family");
      localStorage.removeItem("studyhelper_current_kid");
      localStorage.removeItem("studyhelper_mode");
      localStorage.removeItem("studyhelper_auth");
    } catch (e) {
      console.error("Error clearing localStorage:", e);
    }
  }, []);

  const logoutKid = useCallback(() => {
    setCurrentKid(null);
    setMode(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem("studyhelper_current_kid");
      localStorage.removeItem("studyhelper_mode");
    } catch (e) {
      console.error("Error clearing kid localStorage:", e);
    }
  }, []);

  // Direct kid login (when kid logs in with their own email)
  const loginKid = useCallback((kidData) => {
    setCurrentKid(kidData);
    setMode("student");
    setIsAuthenticated(true);
    try {
      localStorage.setItem("studyhelper_current_kid", JSON.stringify(kidData));
      localStorage.setItem("studyhelper_mode", "student");
      // Clear family data - kid doesn't have parent access
      setFamily(null);
      localStorage.removeItem("studyhelper_family");
    } catch (e) {
      console.error("Error saving kid login to localStorage:", e);
    }
  }, []);

  const refreshKid = useCallback(async () => {
    if (currentKid?.id) {
      try {
        const response = await api.get(`/kids/${currentKid.id}`);
        const updatedKid = response.data;
        setCurrentKid(updatedKid);
        localStorage.setItem("studyhelper_current_kid", JSON.stringify(updatedKid));
      } catch (error) {
        console.error("Failed to refresh kid data:", error);
      }
    }
  }, [currentKid?.id]);

  return { 
    family, 
    currentKid, 
    mode, 
    isAuthenticated,
    isLoading,
    loginFamily, 
    loginKid,
    selectKid, 
    enterParentMode,
    logout, 
    logoutKid,
    refreshKid 
  };
};

function App() {
  const auth = useAuth();
  
  // New user system state
  const [newUser, setNewUser] = useState(() => {
    try {
      const saved = localStorage.getItem("studyhelper_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const handleNewUserLogin = (userData) => {
    setNewUser(userData);
    localStorage.setItem("studyhelper_user", JSON.stringify(userData));
  };

  const handleNewUserLogout = () => {
    setNewUser(null);
    localStorage.removeItem("studyhelper_user");
  };

  // Show loading while checking auth state
  if (auth.isLoading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Create a combined auth object for backward compatibility
  const legacyAuth = {
    isAuthenticated: auth.isAuthenticated,
    mode: auth.mode,
    currentKid: auth.currentKid,
    login: (mode, kid) => {
      if (mode === "parent") {
        auth.enterParentMode();
      } else if (kid) {
        auth.selectKid(kid);
      }
    },
    logout: auth.logoutKid,
    refreshKid: auth.refreshKid
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <BrowserRouter>
        <Routes>
          {/* NEW USER SYSTEM ROUTES */}
          <Route 
            path="/new-register" 
            element={
              newUser ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <NewRegisterPage onRegister={handleNewUserLogin} />
              )
            } 
          />
          <Route 
            path="/new-login" 
            element={
              newUser ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <NewLoginPage onLogin={handleNewUserLogin} />
              )
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              newUser ? (
                <UserDashboard 
                  user={newUser} 
                  onLogout={handleNewUserLogout}
                  onUpdateUser={handleNewUserLogin}
                />
              ) : (
                <Navigate to="/new-login" replace />
              )
            } 
          />
          <Route 
            path="/join-group" 
            element={<JoinGroupPage user={newUser} />} 
          />

          {/* Public routes - redirect if already logged in */}
          <Route 
            path="/" 
            element={
              auth.currentKid ? (
                <Navigate to="/student" replace />
              ) : auth.family ? (
                <Navigate to="/family" replace />
              ) : (
                <LandingPage />
              )
            } 
          />
          <Route 
            path="/register" 
            element={
              auth.currentKid ? (
                <Navigate to="/student" replace />
              ) : auth.family ? (
                <Navigate to="/family" replace />
              ) : (
                <RegisterPage onRegister={auth.loginFamily} />
              )
            } 
          />
          <Route 
            path="/login" 
            element={
              auth.currentKid ? (
                <Navigate to="/student" replace />
              ) : auth.family ? (
                <Navigate to="/family" replace />
              ) : (
                <LoginPage onLogin={auth.loginFamily} onKidLogin={auth.loginKid} />
              )
            } 
          />

          {/* Family dashboard (after login) */}
          <Route 
            path="/family" 
            element={
              auth.family ? (
                <FamilyDashboard 
                  family={auth.family}
                  onLogout={auth.logout}
                  onSelectKid={auth.selectKid}
                  onUpdateFamily={auth.loginFamily}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />

          {/* Setup page for new users */}
          <Route 
            path="/setup" 
            element={
              auth.family ? (
                <Navigate to="/family" replace />
              ) : (
                <Navigate to="/register" replace />
              )
            } 
          />

          {/* Legacy PIN entry (for demo/backwards compatibility) */}
          <Route 
            path="/pin" 
            element={<PinEntry onLogin={legacyAuth.login} />} 
          />

          {/* Student routes */}
          <Route 
            path="/student" 
            element={
              auth.currentKid ? (
                <StudentDashboard auth={legacyAuth} />
              ) : auth.family ? (
                <Navigate to="/family" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/student/tutor" 
            element={
              auth.currentKid ? (
                <AITutor auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/submit" 
            element={
              auth.currentKid ? (
                <SubmitTask auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/rewards" 
            element={
              auth.currentKid ? (
                <RewardShop auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/history" 
            element={
              auth.currentKid ? (
                <PointsHistory auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/daily-rewards" 
            element={
              auth.currentKid ? (
                <DailyRewards auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/typing" 
            element={
              auth.currentKid ? (
                <TypingPractice auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/scan" 
            element={
              auth.currentKid ? (
                <HomeworkScanner auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/badges" 
            element={
              auth.currentKid ? (
                <Badges auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/certificates" 
            element={
              auth.currentKid ? (
                <Certificates auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/student/challenges" 
            element={
              auth.currentKid ? (
                <WeeklyChallenges auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />
          <Route 
            path="/leaderboard" 
            element={
              auth.isAuthenticated ? (
                <Leaderboard auth={legacyAuth} />
              ) : (
                <Navigate to="/family" replace />
              )
            } 
          />

          {/* Parent routes */}
          <Route 
            path="/parent" 
            element={
              auth.family || auth.mode === "parent" ? (
                <ParentDashboard auth={legacyAuth} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/parent/progress/:kidId" 
            element={
              auth.family || auth.mode === "parent" ? (
                <ProgressReport auth={legacyAuth} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/parent/approve" 
            element={
              auth.family || auth.mode === "parent" ? (
                <TaskApproval auth={legacyAuth} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/parent/rewards" 
            element={
              auth.family || auth.mode === "parent" ? (
                <ManageRewards auth={legacyAuth} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/parent/kids" 
            element={
              auth.family || auth.mode === "parent" ? (
                <ManageKids auth={legacyAuth} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />
          <Route 
            path="/parent/challenges" 
            element={
              auth.family || auth.mode === "parent" ? (
                <WeeklyChallenges auth={legacyAuth} />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />

          {/* Payment routes */}
          <Route 
            path="/payment/success" 
            element={<PaymentSuccess onUpdateFamily={auth.loginFamily} />}
          />
          <Route 
            path="/payment/cancel" 
            element={
              <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-gray-800 mb-2">Payment Cancelled</h1>
                  <p className="text-gray-500 mb-6">No worries! You can upgrade anytime.</p>
                  <a href="/family" className="btn-primary px-6 py-3 rounded-full">
                    Back to Dashboard
                  </a>
                </div>
              </div>
            } 
          />

          {/* Settings routes */}
          <Route 
            path="/settings" 
            element={
              auth.family ? (
                <SettingsPage 
                  auth={legacyAuth} 
                  family={auth.family} 
                  onLogout={auth.logout}
                  onUpdateFamily={auth.loginFamily}
                  userType="parent" 
                />
              ) : auth.currentKid ? (
                <SettingsPage 
                  auth={legacyAuth} 
                  family={null} 
                  onLogout={auth.logoutKid} 
                  userType="kid" 
                />
              ) : (
                <Navigate to="/login" replace />
              )
            } 
          />

          {/* Legal Pages (Public) */}
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <InstallPrompt />
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
