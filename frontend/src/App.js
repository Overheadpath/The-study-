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
import StudyTimer from "@/pages/StudyTimer";
import TypingPractice from "@/pages/TypingPractice";
import Leaderboard from "@/pages/Leaderboard";
import Badges from "@/pages/Badges";
import WeeklyChallenges from "@/pages/WeeklyChallenges";
import PaymentSuccess from "@/pages/PaymentSuccess";

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
  const [family, setFamily] = useState(null);
  const [currentKid, setCurrentKid] = useState(null);
  const [mode, setMode] = useState(null); // 'parent' or 'student'
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Load saved auth state
    const savedFamily = localStorage.getItem("studyhelper_family");
    const savedKid = localStorage.getItem("studyhelper_current_kid");
    const savedMode = localStorage.getItem("studyhelper_mode");
    
    if (savedFamily) {
      setFamily(JSON.parse(savedFamily));
    }
    if (savedKid) {
      setCurrentKid(JSON.parse(savedKid));
      setMode("student");
      setIsAuthenticated(true);
    }
    if (savedMode === "parent" && savedFamily) {
      setMode("parent");
      setIsAuthenticated(true);
    }
  }, []);

  const loginFamily = useCallback((familyData) => {
    setFamily(familyData);
    localStorage.setItem("studyhelper_family", JSON.stringify(familyData));
  }, []);

  const selectKid = useCallback((kid) => {
    setCurrentKid(kid);
    setMode("student");
    setIsAuthenticated(true);
    localStorage.setItem("studyhelper_current_kid", JSON.stringify(kid));
    localStorage.setItem("studyhelper_mode", "student");
  }, []);

  const enterParentMode = useCallback(() => {
    setMode("parent");
    setIsAuthenticated(true);
    setCurrentKid(null);
    localStorage.setItem("studyhelper_mode", "parent");
    localStorage.removeItem("studyhelper_current_kid");
  }, []);

  const logout = useCallback(() => {
    setFamily(null);
    setCurrentKid(null);
    setMode(null);
    setIsAuthenticated(false);
    localStorage.removeItem("studyhelper_family");
    localStorage.removeItem("studyhelper_current_kid");
    localStorage.removeItem("studyhelper_mode");
    localStorage.removeItem("studyhelper_auth");
  }, []);

  const logoutKid = useCallback(() => {
    setCurrentKid(null);
    setMode(null);
    setIsAuthenticated(false);
    localStorage.removeItem("studyhelper_current_kid");
    localStorage.removeItem("studyhelper_mode");
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
    loginFamily, 
    selectKid, 
    enterParentMode,
    logout, 
    logoutKid,
    refreshKid 
  };
};

function App() {
  const auth = useAuth();

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
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route 
            path="/register" 
            element={<RegisterPage onRegister={auth.loginFamily} />} 
          />
          <Route 
            path="/login" 
            element={<LoginPage onLogin={auth.loginFamily} />} 
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
            path="/student/timer" 
            element={
              auth.currentKid ? (
                <StudyTimer auth={legacyAuth} />
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
