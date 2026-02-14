import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { ArrowLeft, Award, Download, Star, Trophy, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Certificates = ({ auth }) => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState([]);
  const [newCerts, setNewCerts] = useState([]);
  const [loading, setLoading] = useState(true);

  const kidId = auth.currentKid?.id || auth.currentKid?.kid_id;

  useEffect(() => {
    if (kidId) {
      fetchCertificates();
    }
  }, [kidId]);

  const fetchCertificates = async () => {
    try {
      const response = await api.get(`/certificates/${kidId}`);
      setCertificates(response.data.certificates);
      
      // Show notifications for new certificates
      if (response.data.new_certificates?.length > 0) {
        setNewCerts(response.data.new_certificates);
        response.data.new_certificates.forEach(cert => {
          toast.success(`🏆 New Certificate: ${cert.achievement_title}!`);
        });
      }
    } catch (error) {
      console.error("Failed to fetch certificates:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCertificate = (certId) => {
    window.open(`${BACKEND_URL}/api/certificate/${certId}/pdf`, '_blank');
  };

  const getCertIcon = (title) => {
    if (title.includes("Legend")) return "🌟";
    if (title.includes("Master")) return "👑";
    if (title.includes("Champion")) return "🏆";
    if (title.includes("Super")) return "⭐";
    return "🎖️";
  };

  const getCertColor = (title) => {
    if (title.includes("Legend")) return "from-amber-400 to-yellow-500";
    if (title.includes("Master")) return "from-purple-500 to-indigo-600";
    if (title.includes("Champion")) return "from-indigo-500 to-blue-600";
    if (title.includes("Super")) return "from-green-500 to-emerald-600";
    return "from-gray-400 to-gray-500";
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="w-12 h-12 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7]" data-testid="certificates-page">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="font-bold text-gray-800 font-heading text-lg">My Certificates</h1>
              <p className="text-sm text-gray-500">{certificates.length} achievements</p>
            </div>
          </div>
          <Award className="w-8 h-8 text-amber-500" />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* New Certificates Banner */}
        {newCerts.length > 0 && (
          <div className="bg-gradient-to-r from-amber-100 to-yellow-100 rounded-2xl p-6 mb-6 border border-amber-200 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="text-4xl">🎉</div>
              <div>
                <h3 className="font-bold text-amber-800">New Certificates Earned!</h3>
                <p className="text-amber-700 text-sm">
                  You just unlocked {newCerts.length} new certificate{newCerts.length > 1 ? 's' : ''}!
                </p>
              </div>
            </div>
          </div>
        )}

        {certificates.length === 0 ? (
          <div className="text-center py-12 card-playful">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2 font-heading">No Certificates Yet</h3>
            <p className="text-gray-500 mb-4">Keep earning points to unlock your first certificate!</p>
            <div className="text-sm text-gray-400">
              <p>🎖️ 100 points = Rising Star</p>
              <p>⭐ 250 points = Super Learner</p>
              <p>🏆 500 points = Knowledge Champion</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {certificates.map((cert, index) => (
              <div 
                key={cert.id}
                className={`card-playful overflow-hidden ${newCerts.some(n => n.id === cert.id) ? 'ring-2 ring-amber-400' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`h-2 bg-gradient-to-r ${getCertColor(cert.achievement_title)}`}></div>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{getCertIcon(cert.achievement_title)}</div>
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 text-lg font-heading">
                        {cert.achievement_title}
                      </h3>
                      <p className="text-gray-500 text-sm mt-1">{cert.achievement_description}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        Earned on {new Date(cert.issued_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() => openCertificate(cert.id)}
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Print
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Progress to Next */}
        {certificates.length > 0 && (
          <div className="mt-8 card-playful bg-gradient-to-r from-indigo-50 to-purple-50">
            <h4 className="font-bold text-gray-800 mb-3">Next Milestones:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>🎖️ Rising Star</span>
                <span>100 points</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>⭐ Super Learner</span>
                <span>250 points</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>🏆 Knowledge Champion</span>
                <span>500 points</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>👑 Master Scholar</span>
                <span>1000 points</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>🌟 Academic Legend</span>
                <span>2500 points</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Certificates;
