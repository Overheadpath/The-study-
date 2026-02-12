import { useState, useEffect } from "react";
import { api } from "@/App";
import { toast } from "sonner";
import { Bell, Check, X, Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ShareNotifications = ({ familyId }) => {
  const [requests, setRequests] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    if (familyId) {
      fetchRequests();
    }
  }, [familyId]);

  const fetchRequests = async () => {
    try {
      const response = await api.get(`/share/requests/pending?family_id=${familyId}`);
      setRequests(response.data);
    } catch (error) {
      console.error("Failed to fetch share requests:", error);
    }
  };

  const handleApprove = async (requestId) => {
    setProcessing(requestId);
    try {
      await api.post(`/share/requests/${requestId}/approve?family_id=${familyId}`);
      toast.success("Kid sharing approved! You can now see their progress.");
      fetchRequests();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to approve");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (requestId) => {
    setProcessing(requestId);
    try {
      await api.post(`/share/requests/${requestId}/reject?family_id=${familyId}`);
      toast.success("Share request rejected");
      fetchRequests();
    } catch (error) {
      toast.error("Failed to reject request");
    } finally {
      setProcessing(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <>
      {/* Notification Bell */}
      <button
        onClick={() => setShowDialog(true)}
        className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors"
        data-testid="share-notifications-btn"
      >
        <Bell className="w-6 h-6 text-gray-600" />
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
          {requests.length}
        </span>
      </button>

      {/* Requests Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-indigo-500" />
              Share Requests
            </DialogTitle>
            <DialogDescription>
              Other families want to share a kid account with you
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            {requests.map((request) => (
              <div
                key={request.id}
                className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">
                      {request.from_family_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      wants to share <strong>{request.kid_name}</strong> with you
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      From: {request.from_email}
                    </p>
                    {request.kid_email && (
                      <p className="text-xs text-indigo-600 mt-1">
                        Kid login email: {request.kid_email}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => handleApprove(request.id)}
                    disabled={processing === request.id}
                    className="flex-1 bg-green-500 hover:bg-green-600"
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(request.id)}
                    disabled={processing === request.id}
                    className="flex-1 text-red-500 border-red-200 hover:bg-red-50"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ShareNotifications;
