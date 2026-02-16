import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  ArrowLeft, Trophy, Star, Flame, Target, Award,
  TrendingUp, BookOpen, Calendar, Download, Mail,
  ChevronRight, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ProgressReport = ({ auth }) => {
  const navigate = useNavigate();
  const { kidId } = useParams();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [selectedDays, setSelectedDays] = useState(7);

  useEffect(() => {
    if (kidId) {
      fetchReport();
    }
  }, [kidId, selectedDays]);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/progress-report/${kidId}?days=${selectedDays}`);
      setReport(response.data);
    } catch (error) {
      console.error("Error fetching report:", error);
      toast.error("Failed to load progress report");
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (grade) => {
    switch (grade) {
      case "A+": return "from-green-400 to-emerald-500";
      case "A": return "from-green-500 to-teal-500";
      case "B": return "from-blue-400 to-indigo-500";
      case "C": return "from-amber-400 to-orange-500";
      default: return "from-red-400 to-pink-500";
    }
  };

  const getMasteryColor = (level) => {
    switch (level) {
      case "master": return "bg-purple-500";
      case "gold": return "bg-amber-500";
      case "silver": return "bg-gray-400";
      case "bronze": return "bg-orange-600";
      default: return "bg-gray-300";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">No report available</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900" data-testid="progress-report-page">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate("/parent")}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              data-testid="back-btn"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 dark:text-white font-heading">Progress Report</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">{report.kid_name}'s performance</p>
            </div>
          </div>
          
          {/* Period Selector */}
          <select
            value={selectedDays}
            onChange={(e) => setSelectedDays(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-xl text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Grade Card */}
        <div className={`card-playful bg-gradient-to-r ${getGradeColor(report.summary.grade)} text-white`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Overall Performance</p>
              <div className="flex items-center gap-3">
                <span className="text-6xl font-bold font-heading">{report.summary.grade}</span>
                <div>
                  <p className="text-xl font-bold">{report.summary.performance_score}/100</p>
                  <p className="text-sm text-white/80">{report.period}</p>
                </div>
              </div>
              <p className="mt-2 text-white/90">{report.summary.feedback}</p>
            </div>
            <div className="text-right">
              <Trophy className="w-16 h-16 text-white/30" />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card-playful dark:bg-gray-800 text-center">
            <Star className="w-8 h-8 mx-auto mb-2 text-amber-500" />
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{report.summary.total_points_earned}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Points Earned</p>
          </div>
          <div className="card-playful dark:bg-gray-800 text-center">
            <BookOpen className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{report.tasks.completed}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Tasks Done</p>
          </div>
          <div className="card-playful dark:bg-gray-800 text-center">
            <Flame className="w-8 h-8 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{report.streaks.current}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Day Streak</p>
          </div>
          <div className="card-playful dark:bg-gray-800 text-center">
            <Award className="w-8 h-8 mx-auto mb-2 text-purple-500" />
            <p className="text-2xl font-bold text-gray-800 dark:text-white">{report.achievements.badges_earned}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Badges</p>
          </div>
        </div>

        {/* Tasks by Subject */}
        <div className="card-playful dark:bg-gray-800">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 font-heading flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            Tasks by Subject
          </h3>
          {Object.keys(report.tasks.by_subject).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(report.tasks.by_subject).map(([subject, stats]) => (
                <div key={subject} className="flex items-center gap-4">
                  <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{subject}</span>
                  <div className="flex-1">
                    <Progress value={(stats.count / report.tasks.completed) * 100} className="h-3" />
                  </div>
                  <span className="text-sm font-bold text-gray-800 dark:text-white w-12 text-right">{stats.count}</span>
                  <span className="text-xs text-green-600 w-16 text-right">+{stats.points} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No tasks completed yet</p>
          )}
        </div>

        {/* Subject Mastery */}
        {report.mastery && report.mastery.length > 0 && (
          <div className="card-playful dark:bg-gray-800">
            <h3 className="font-bold text-gray-800 dark:text-white mb-4 font-heading flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Subject Mastery
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {report.mastery.map((m) => (
                <div key={m.subject} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-800 dark:text-white text-sm">{m.subject}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs text-white font-bold ${getMasteryColor(m.level)}`}>
                      {m.level.toUpperCase()}
                    </span>
                  </div>
                  <Progress value={m.progress_to_next} className="h-2" />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {m.tasks_needed > 0 ? `${m.tasks_needed} more for ${m.next_level}` : "Max level!"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Challenges */}
        <div className="card-playful dark:bg-gray-800">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 font-heading flex items-center gap-2">
            <Target className="w-5 h-5 text-red-500" />
            Challenges
          </h3>
          <div className="flex gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">{report.achievements.challenges_completed}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">{report.achievements.challenges_active}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="card-playful dark:bg-gray-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 font-heading">💡 Recommendations</h3>
          <ul className="space-y-2">
            {report.recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <ChevronRight className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                {rec}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.print()}
          >
            <Download className="w-4 h-4 mr-2" />
            Print Report
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            onClick={() => toast.info("Email feature requires email service integration")}
          >
            <Mail className="w-4 h-4 mr-2" />
            Email Report
          </Button>
        </div>
      </main>
    </div>
  );
};

export default ProgressReport;
