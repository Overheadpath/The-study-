import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  Users, Plus, QrCode, Settings, LogOut, 
  Bell, UserPlus, ChevronRight, Sparkles, Copy, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import QRCode from "react-qr-code";

const UserDashboard = ({ user, onLogout, onUpdateUser }) => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showQRCode, setShowQRCode] = useState(null);
  const [showInvite, setShowInvite] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    groupType: "family"
  });

  const [inviteUsername, setInviteUsername] = useState("");

  useEffect(() => {
    fetchData();
  }, [user?.id]);

  const fetchData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [groupsRes, invitesRes] = await Promise.all([
        api.get(`/groups?user_id=${user.id}`),
        api.get(`/groups/invites/pending?user_id=${user.id}`)
      ]);
      setGroups(groupsRes.data);
      setPendingInvites(invitesRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupForm.name) {
      toast.error("Please enter a group name");
      return;
    }

    setCreating(true);
    try {
      const response = await api.post(`/groups?user_id=${user.id}`, {
        name: groupForm.name,
        description: groupForm.description,
        group_type: groupForm.groupType
      });
      toast.success("Group created!");
      setShowCreateGroup(false);
      setGroupForm({ name: "", description: "", groupType: "family" });
      fetchData();
    } catch (error) {
      toast.error("Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleInviteUser = async (groupId) => {
    if (!inviteUsername) {
      toast.error("Please enter a username");
      return;
    }

    try {
      await api.post(`/groups/invite?from_user_id=${user.id}`, {
        group_id: groupId,
        to_username: inviteUsername
      });
      toast.success("Invite sent!");
      setShowInvite(null);
      setInviteUsername("");
    } catch (error) {
      const message = error.response?.data?.detail || "Failed to send invite";
      toast.error(message);
    }
  };

  const handleAcceptInvite = async (inviteId) => {
    try {
      await api.post(`/groups/invites/${inviteId}/accept?user_id=${user.id}`);
      toast.success("Joined group!");
      fetchData();
    } catch (error) {
      toast.error("Failed to accept invite");
    }
  };

  const handleRejectInvite = async (inviteId) => {
    try {
      await api.post(`/groups/invites/${inviteId}/reject?user_id=${user.id}`);
      toast.info("Invite rejected");
      fetchData();
    } catch (error) {
      toast.error("Failed to reject invite");
    }
  };

  const copyQRCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Code copied!");
  };

  const handleLogout = () => {
    localStorage.removeItem("studyhelper_user");
    onLogout();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900" data-testid="user-dashboard">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: user?.avatar_color || "#4F46E5" }}
            >
              {user?.avatar_emoji || "😊"}
            </div>
            <div>
              <h1 className="font-bold text-gray-800 dark:text-white font-heading">{user?.display_name}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">@{user?.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingInvites.length > 0 && (
              <div className="relative">
                <Bell className="w-6 h-6 text-amber-500" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {pendingInvites.length}
                </span>
              </div>
            )}
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="w-5 h-5 text-red-500" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* User Info Card */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-indigo-100 text-sm">Your Points</p>
              <p className="text-4xl font-bold font-heading">{user?.points || 0}</p>
            </div>
            {user?.is_child && (
              <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
                Grade {user?.grade}
              </div>
            )}
          </div>
          {user?.is_child && (
            <p className="text-indigo-100 text-xs mt-2">
              Under 13 - Safety features enabled
            </p>
          )}
        </div>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-800 dark:text-white font-heading flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-500" />
              Pending Invites
            </h2>
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="font-semibold text-gray-800 dark:text-white">
                  {invite.from_username} invited you to join "{invite.group_name}"
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={() => handleAcceptInvite(invite.id)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleRejectInvite(invite.id)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Groups */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-800 dark:text-white font-heading flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              My Groups
            </h2>
            <Button onClick={() => setShowCreateGroup(true)} size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Create Group
            </Button>
          </div>

          {groups.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No groups yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Create a group or scan a QR code to join one</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800 dark:text-white">{group.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          group.group_type === "family" 
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" 
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        }`}>
                          {group.group_type}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {group.members?.length || 0} members
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setShowQRCode(group)}
                      >
                        <QrCode className="w-4 h-4" />
                      </Button>
                      {!user?.is_child && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setShowInvite(group)}
                        >
                          <UserPlus className="w-4 h-4" />
                        </Button>
                      )}
                      <Button 
                        size="sm"
                        onClick={() => navigate(`/group/${group.id}`)}
                      >
                        View
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Member avatars */}
                  <div className="flex -space-x-2 mt-3">
                    {group.members?.slice(0, 5).map((member) => (
                      <div 
                        key={member.id}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 border-white dark:border-gray-800"
                        style={{ backgroundColor: member.avatar_color || "#4F46E5" }}
                        title={member.display_name}
                      >
                        {member.avatar_emoji || "😊"}
                      </div>
                    ))}
                    {(group.members?.length || 0) > 5 && (
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300 border-2 border-white dark:border-gray-800">
                        +{group.members.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            variant="outline" 
            className="h-auto py-4 flex-col"
            onClick={() => navigate("/join-group")}
          >
            <QrCode className="w-6 h-6 mb-2" />
            <span>Scan QR Code</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex-col"
            onClick={() => navigate("/student")}
          >
            <Sparkles className="w-6 h-6 mb-2" />
            <span>Study Mode</span>
          </Button>
        </div>
      </main>

      {/* Create Group Dialog */}
      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a Group</DialogTitle>
            <DialogDescription>
              Create a family or friends group to study together
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Group Name</label>
              <Input
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="My Family"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Description (optional)</label>
              <Input
                value={groupForm.description}
                onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                placeholder="Study group for homework"
              />
            </div>
            
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">Group Type</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setGroupForm({ ...groupForm, groupType: "family" })}
                  className={`flex-1 p-3 rounded-xl border-2 transition-colors ${
                    groupForm.groupType === "family" 
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" 
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <Users className="w-5 h-5 mx-auto mb-1 text-indigo-600" />
                  <p className="text-sm font-semibold">Family</p>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupForm({ ...groupForm, groupType: "friends" })}
                  className={`flex-1 p-3 rounded-xl border-2 transition-colors ${
                    groupForm.groupType === "friends" 
                      ? "border-green-500 bg-green-50 dark:bg-green-900/20" 
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <Sparkles className="w-5 h-5 mx-auto mb-1 text-green-600" />
                  <p className="text-sm font-semibold">Friends</p>
                </button>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateGroup(false)}>Cancel</Button>
            <Button onClick={handleCreateGroup} disabled={creating}>
              {creating ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!showQRCode} onOpenChange={() => setShowQRCode(null)}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle>Share Group QR Code</DialogTitle>
            <DialogDescription>
              Others can scan this to join "{showQRCode?.name}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6">
            <div className="bg-white p-4 rounded-xl inline-block">
              {showQRCode?.qr_invite_code && (
                <QRCode 
                  value={showQRCode.qr_invite_code} 
                  size={200}
                  level="M"
                />
              )}
            </div>
            
            <div className="mt-4 flex items-center justify-center gap-2">
              <code className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg font-mono text-lg">
                {showQRCode?.qr_invite_code}
              </code>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => copyQRCode(showQRCode?.qr_invite_code)}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            
            <p className="text-sm text-gray-500 mt-4">
              Share this code with anyone to let them join your group
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={!!showInvite} onOpenChange={() => setShowInvite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to "{showInvite?.name}"</DialogTitle>
            <DialogDescription>
              Enter their username to send an invite
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Input
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="Username"
            />
            <p className="text-xs text-gray-500 mt-2">
              Note: Users under 13 must scan the QR code in person
            </p>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(null)}>Cancel</Button>
            <Button onClick={() => handleInviteUser(showInvite?.id)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserDashboard;
