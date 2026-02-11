import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Play, Pause, RotateCcw, Trophy, Flame, 
  BookOpen, Clock, Target, Sparkles 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const StudyTimer = ({ auth }) => {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState("");
  const [goalMinutes, setGoalMinutes] = useState(15);
  const [timeLeft, setTimeLeft] = useState(15 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState(null);
  const [streak, setStreak] = useState(null);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    fetchData();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [auth.currentKid?.id]);

  const fetchData = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const [kidRes, subjectsRes, streakRes] = await Promise.all([
        api.get(`/kids/${auth.currentKid.id}`),
        api.get(`/subjects/${(await api.get(`/kids/${auth.currentKid.id}`)).data.grade}`),
        api.get(`/streak/${auth.currentKid.id}`)
      ]);
      
      const subs = subjectsRes.data.subjects;
      setSubjects(subs);
      if (subs.length > 0) setSelectedSubject(subs[0]);
      setStreak(streakRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  };

  useEffect(() => {
    setTimeLeft(goalMinutes * 60);
  }, [goalMinutes]);

  const startTimer = () => {
    if (!selectedSubject) {
      toast.error("Please select a subject first");
      return;
    }
    
    setIsRunning(true);
    startTimeRef.current = Date.now();
    
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          handleSessionComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const pauseTimer = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const resetTimer = () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeLeft(goalMinutes * 60);
    setSessionComplete(false);
    setEarnedPoints(null);
  };

  const handleSessionComplete = async () => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    
    const actualMinutes = goalMinutes - Math.floor(timeLeft / 60);
    
    try {
      const response = await api.post("/study/session", {
        kid_id: auth.currentKid.id,
        subject: selectedSubject,
        goal_minutes: goalMinutes,
        actual_minutes: Math.max(actualMinutes, goalMinutes)
      });
      
      setEarnedPoints(response.data);
      setSessionComplete(true);
      toast.success(`Great job! You earned ${response.data.points_earned} points!`);
      
      // Refresh streak
      const streakRes = await api.get(`/streak/${auth.currentKid.id}`);
      setStreak(streakRes.data);
      await auth.refreshKid();
    } catch (error) {
      console.error("Failed to save session:", error);
      toast.error("Failed to save session");
    }
  };

  const handleEarlyComplete = () => {
    if (timeLeft > goalMinutes * 60 - 60) {
      toast.error("Study for at least 1 minute first!");
      return;
    }
    handleSessionComplete();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((goalMinutes * 60 - timeLeft) / (goalMinutes * 60)) * 100;

  if (sessionComplete && earnedPoints) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6" data-testid="session-complete">
        <div className="text-center animate-fade-in max-w-sm">
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6 animate-bounce">
            <Trophy className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2 font-heading">Awesome Work!</h1>
          <p className="text-gray-500 mb-6">
            You studied {selectedSubject} for {goalMinutes} minutes!
          </p>
          
          <div className="card-playful bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 mb-6">
            <h3 className="font-bold text-amber-800 mb-3 font-heading text-xl">
              +{earnedPoints.points_earned} Points!
            </h3>
            <div className="space-y-2 text-sm text-amber-700">
              <div className="flex justify-between">
                <span>Base points:</span>
                <span>+{earnedPoints.breakdown.base}</span>
              </div>
              {earnedPoints.breakdown.goal_bonus > 0 && (
                <div className="flex justify-between">
                  <span>Goal bonus:</span>
                  <span>+{earnedPoints.breakdown.goal_bonus}</span>
                </div>
              )}
              {earnedPoints.breakdown.streak_bonus > 0 && (
                <div className="flex justify-between">
                  <span>Streak bonus:</span>
                  <span>+{earnedPoints.breakdown.streak_bonus}</span>
                </div>
              )}
            </div>
          </div>

          {streak && streak.current_streak > 0 && (
            <div className="flex items-center justify-center gap-2 mb-6 text-orange-600">
              <Flame className="w-5 h-5" />
              <span className="font-bold">{streak.current_streak} day streak!</span>
            </div>
          )}
          
          <div className="space-y-3">
            <Button
              onClick={resetTimer}
              className="w-full btn-primary"
            >
              Study Again
            </Button>
            <Button
              onClick={() => navigate("/student")}
              variant="outline"
              className="w-full"
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="study-timer-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/student")}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">Study Timer</h1>
              <p className="text-sm text-gray-500">Focus and earn points!</p>
            </div>
          </div>
          
          {streak && streak.current_streak > 0 && (
            <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full">
              <Flame className="w-4 h-4" />
              <span className="font-bold text-sm">{streak.current_streak} days</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        {/* Timer Display */}
        <div className="card-playful text-center mb-8 animate-fade-in">
          <div className="text-7xl font-bold text-gray-800 font-heading mb-4">
            {formatTime(timeLeft)}
          </div>
          
          <Progress value={progress} className="h-3 mb-4" />
          
          <p className="text-gray-500">
            {isRunning ? "Stay focused! You got this!" : "Ready to study?"}
          </p>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mb-8">
          {!isRunning ? (
            <Button
              onClick={startTimer}
              className="h-16 w-16 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
              data-testid="start-btn"
            >
              <Play className="w-8 h-8" />
            </Button>
          ) : (
            <Button
              onClick={pauseTimer}
              className="h-16 w-16 rounded-full bg-amber-500 hover:bg-amber-600"
              data-testid="pause-btn"
            >
              <Pause className="w-8 h-8" />
            </Button>
          )}
          
          <Button
            onClick={resetTimer}
            variant="outline"
            className="h-16 w-16 rounded-full"
            data-testid="reset-btn"
          >
            <RotateCcw className="w-6 h-6" />
          </Button>
        </div>

        {/* Settings */}
        {!isRunning && (
          <div className="space-y-4 animate-fade-in">
            <div className="card-playful">
              <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Subject
              </label>
              <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger data-testid="subject-select">
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="card-playful">
              <label className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Study Goal: {goalMinutes} minutes
              </label>
              <div className="flex gap-2 flex-wrap">
                {[10, 15, 20, 25, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setGoalMinutes(mins)}
                    className={`px-4 py-2 rounded-full font-semibold transition-all ${
                      goalMinutes === mins
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Early complete button */}
        {isRunning && timeLeft < goalMinutes * 60 - 60 && (
          <div className="text-center">
            <Button
              onClick={handleEarlyComplete}
              variant="outline"
              className="mt-4"
            >
              Finish Early ({Math.floor((goalMinutes * 60 - timeLeft) / 60)}m studied)
            </Button>
          </div>
        )}

        {/* Points info */}
        <div className="mt-8 card-playful bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
          <h3 className="font-bold text-indigo-800 mb-3 font-heading flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            How Points Work
          </h3>
          <ul className="space-y-2 text-sm text-indigo-700">
            <li className="flex items-start gap-2">
              <span className="text-indigo-500">•</span>
              1 point per 5 minutes studied
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500">•</span>
              +5 bonus for reaching your goal
            </li>
            <li className="flex items-start gap-2">
              <span className="text-indigo-500">•</span>
              Up to +5 streak bonus (1 per day)
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
};

export default StudyTimer;
