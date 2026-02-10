import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Trophy, ArrowUp, ArrowDown, Gift, BookOpen } from "lucide-react";

const PointsHistory = ({ auth }) => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [kidData, setKidData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [auth.currentKid?.id]);

  const fetchData = async () => {
    if (!auth.currentKid?.id) return;
    
    try {
      const [historyRes, kidRes] = await Promise.all([
        api.get(`/points/history?kid_id=${auth.currentKid.id}`),
        api.get(`/kids/${auth.currentKid.id}`)
      ]);
      setHistory(historyRes.data);
      setKidData(kidRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', { 
      day: 'numeric', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="points-history-page">
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
              <h1 className="font-bold text-gray-800 font-heading text-lg">Points History</h1>
              <p className="text-sm text-gray-500">Track your earnings</p>
            </div>
          </div>
          
          <div className="points-badge" data-testid="points-display">
            <Trophy className="w-5 h-5" />
            {kidData?.points || 0} pts
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-8">
        {history.length === 0 ? (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-gray-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2 font-heading">No History Yet</h2>
            <p className="text-gray-500">Complete tasks to earn your first points!</p>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {history.map((item, index) => (
              <div 
                key={item.id || index} 
                className="card-playful flex items-center gap-4 animate-fade-in"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  item.amount > 0 
                    ? 'bg-green-100' 
                    : 'bg-red-100'
                }`}>
                  {item.amount > 0 ? (
                    item.task_id ? (
                      <BookOpen className="w-6 h-6 text-green-600" />
                    ) : (
                      <ArrowUp className="w-6 h-6 text-green-600" />
                    )
                  ) : (
                    <Gift className="w-6 h-6 text-red-600" />
                  )}
                </div>
                
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-800">{item.reason}</h4>
                  <p className="text-sm text-gray-500">{formatDate(item.created_at)}</p>
                </div>
                
                <span className={`font-bold text-lg font-heading ${
                  item.amount > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {item.amount > 0 ? '+' : ''}{item.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PointsHistory;
