import { useState, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { Gift, Copy, Check, Users, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ReferralProgram = ({ family }) => {
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (family?.id) {
      fetchStats();
    }
  }, [family?.id]);

  const fetchStats = async () => {
    try {
      const response = await api.get(`/referral/stats/${family.id}`);
      setStats(response.data);
    } catch (error) {
      console.error("Failed to fetch referral stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    const code = stats?.referral_code || family?.referral_code;
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareLink = () => {
    const code = stats?.referral_code || family?.referral_code;
    const url = `${window.location.origin}/register?ref=${code}`;
    if (navigator.share) {
      navigator.share({
        title: "Join Study Helper!",
        text: `Use my referral code ${code} to get 1 month FREE premium!`,
        url: url
      });
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Referral link copied!");
    }
  };

  const referralCode = stats?.referral_code || family?.referral_code || "Loading...";

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          className="border-amber-300 text-amber-700 hover:bg-amber-50"
          data-testid="referral-btn"
        >
          <Gift className="w-4 h-4 mr-2" />
          Invite Friends
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Gift className="w-6 h-6 text-amber-500" />
            Referral Program
          </DialogTitle>
          <DialogDescription>
            Invite friends and both get 1 month FREE Premium!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Referral Code */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200">
            <p className="text-sm text-amber-700 mb-2 font-medium">Your Referral Code:</p>
            <div className="flex gap-2">
              <Input
                value={referralCode}
                readOnly
                className="font-mono text-xl font-bold text-center tracking-wider bg-white"
              />
              <Button 
                onClick={copyCode}
                variant="outline"
                className="px-3"
              >
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* How it works */}
          <div className="space-y-3">
            <h4 className="font-semibold text-gray-800">How it works:</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">1</div>
                <p className="text-gray-600">Share your code with friends</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">2</div>
                <p className="text-gray-600">They sign up using your code</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center text-xs font-bold text-amber-600 flex-shrink-0">
                  <Crown className="w-3 h-3" />
                </div>
                <p className="text-gray-600"><strong>Both of you</strong> get 1 month FREE Premium!</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  <span className="font-medium text-gray-700">Friends Invited:</span>
                </div>
                <span className="text-2xl font-bold text-indigo-600">{stats.total_referrals}</span>
              </div>
              {stats.total_referrals > 0 && (
                <p className="text-sm text-green-600 mt-2">
                  🎉 You've earned {stats.months_earned} free month{stats.months_earned > 1 ? 's' : ''}!
                </p>
              )}
            </div>
          )}

          {/* Share Button */}
          <Button 
            onClick={shareLink}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
          >
            <Gift className="w-5 h-5 mr-2" />
            Share Referral Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralProgram;
