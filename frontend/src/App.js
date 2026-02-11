import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

// Pages
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// Create axios instance
export const api = axios.create({
  baseURL: API,
  headers: {
    "Content-Type": "application/json",
  },
});

// Auth context
export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mode, setMode] = useState(null); // 'parent' or 'student'
  const [currentKid, setCurrentKid] = useState(null);

  useEffect(() => {
    const savedAuth = localStorage.getItem("studyhelper_auth");
    if (savedAuth) {
      const auth = JSON.parse(savedAuth);
      setIsAuthenticated(true);
      setMode(auth.mode);
      setCurrentKid(auth.kid);
    }
  }, []);

  const login = useCallback((authMode, kid = null) => {
    setIsAuthenticated(true);
    setMode(authMode);
    setCurrentKid(kid);
    localStorage.setItem("studyhelper_auth", JSON.stringify({ mode: authMode, kid }));
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setMode(null);
    setCurrentKid(null);
    localStorage.removeItem("studyhelper_auth");
  }, []);

  const refreshKid = useCallback(async () => {
    if (currentKid?.id) {
      try {
        const response = await api.get(`/kids/${currentKid.id}`);
        const updatedKid = { id: response.data.id, name: response.data.name, points: response.data.points };
        setCurrentKid(updatedKid);
        localStorage.setItem("studyhelper_auth", JSON.stringify({ mode, kid: updatedKid }));
      } catch (error) {
        console.error("Failed to refresh kid data:", error);
      }
    }
  }, [currentKid?.id, mode]);

  return { isAuthenticated, mode, currentKid, login, logout, refreshKid };
};

function App() {
  const auth = useAuth();

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <BrowserRouter>
        <Routes>
          {/* Public route - PIN entry */}
          <Route 
            path="/" 
            element={
              auth.isAuthenticated ? (
                <Navigate to={auth.mode === "parent" ? "/parent" : "/student"} replace />
              ) : (
                <PinEntry onLogin={auth.login} />
              )
            } 
          />

          {/* Student routes */}
          <Route 
            path="/student" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <StudentDashboard auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/tutor" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <AITutor auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/submit" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <SubmitTask auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/rewards" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <RewardShop auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/history" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <PointsHistory auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/timer" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <StudyTimer auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/typing" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <TypingPractice auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/badges" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <Badges auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/student/challenges" 
            element={
              auth.isAuthenticated && auth.mode === "student" ? (
                <WeeklyChallenges auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/leaderboard" 
            element={
              auth.isAuthenticated ? (
                <Leaderboard auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />

          {/* Parent routes */}
          <Route 
            path="/parent" 
            element={
              auth.isAuthenticated && auth.mode === "parent" ? (
                <ParentDashboard auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/parent/approve" 
            element={
              auth.isAuthenticated && auth.mode === "parent" ? (
                <TaskApproval auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/parent/rewards" 
            element={
              auth.isAuthenticated && auth.mode === "parent" ? (
                <ManageRewards auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/parent/kids" 
            element={
              auth.isAuthenticated && auth.mode === "parent" ? (
                <ManageKids auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />
          <Route 
            path="/parent/challenges" 
            element={
              auth.isAuthenticated && auth.mode === "parent" ? (
                <WeeklyChallenges auth={auth} />
              ) : (
                <Navigate to="/" replace />
              )
            } 
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
