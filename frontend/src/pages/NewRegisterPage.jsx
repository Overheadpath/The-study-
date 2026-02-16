import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { 
  User, Lock, Mail, Calendar, GraduationCap, ArrowRight, 
  ArrowLeft, Check, AlertCircle, Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AVATAR_PRESETS } from "@/constants/avatars";

const NewRegisterPage = ({ onRegister }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [checkingUsername, setCheckingUsername] = useState(false);

  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    displayName: "",
    birthdate: "",
    email: "", // Optional
    grade: "",
    avatarEmoji: "😊",
    avatarColor: "#4F46E5"
  });

  const calculateAge = (birthdate) => {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(form.birthdate);
  const isChild = age !== null && age < 13;

  const checkUsername = async (username) => {
    if (username.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    setCheckingUsername(true);
    try {
      const response = await api.get(`/users/check-username/${username}`);
      setUsernameAvailable(response.data.available);
    } catch (error) {
      setUsernameAvailable(null);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setForm({ ...form, username: value });
    if (value.length >= 3) {
      checkUsername(value);
    } else {
      setUsernameAvailable(null);
    }
  };

  const selectAvatar = (avatar) => {
    setForm({
      ...form,
      avatarEmoji: avatar.emoji,
      avatarColor: avatar.color
    });
  };

  const validateStep1 = () => {
    if (!form.username || form.username.length < 3) {
      toast.error("Username must be at least 3 characters");
      return false;
    }
    if (!usernameAvailable) {
      toast.error("Please choose an available username");
      return false;
    }
    if (!form.password || form.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return false;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords don't match");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!form.displayName) {
      toast.error("Please enter your display name");
      return false;
    }
    if (!form.birthdate) {
      toast.error("Please enter your birthdate");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await api.post("/users/register", {
        username: form.username,
        password: form.password,
        display_name: form.displayName,
        birthdate: form.birthdate,
        email: form.email || null,
        grade: form.grade ? parseInt(form.grade) : null,
        avatar_emoji: form.avatarEmoji,
        avatar_color: form.avatarColor
      });

      toast.success("Account created successfully!");
      
      // Store user data and redirect
      localStorage.setItem("studyhelper_user", JSON.stringify(response.data));
      onRegister(response.data);
      navigate("/dashboard");
    } catch (error) {
      const message = error.response?.data?.detail || "Registration failed";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF7] via-[#FEF3C7] to-[#FDFBF7] dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white font-heading">Create Account</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Join Study Helper</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-3 h-3 rounded-full transition-colors ${
                s === step ? 'bg-indigo-600' : s < step ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-700">
          
          {/* Step 1: Username & Password */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Choose your login</h2>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Username *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    value={form.username}
                    onChange={handleUsernameChange}
                    placeholder="coolstudent123"
                    className="pl-10"
                    maxLength={20}
                    data-testid="username-input"
                  />
                  {checkingUsername && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
                  )}
                  {!checkingUsername && usernameAvailable === true && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                  )}
                  {!checkingUsername && usernameAvailable === false && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
                  )}
                </div>
                {usernameAvailable === false && (
                  <p className="text-xs text-red-500 mt-1">Username taken</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Letters, numbers, underscores only</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="At least 6 characters"
                    className="pl-10"
                    data-testid="password-input"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Confirm Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Confirm your password"
                    className="pl-10"
                    data-testid="confirm-password-input"
                  />
                </div>
                {form.password && form.confirmPassword && form.password === form.confirmPassword && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Passwords match
                  </p>
                )}
              </div>

              <Button
                onClick={() => validateStep1() && setStep(2)}
                className="w-full bg-gradient-to-r from-indigo-500 to-purple-600"
                data-testid="next-step-btn"
              >
                Next
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 2: Personal Info */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Tell us about yourself</h2>
              
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Display Name *</label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="How should we call you?"
                  data-testid="display-name-input"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Birthdate *</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="date"
                    value={form.birthdate}
                    onChange={(e) => setForm({ ...form, birthdate: e.target.value })}
                    className="pl-10"
                    max={new Date().toISOString().split('T')[0]}
                    data-testid="birthdate-input"
                  />
                </div>
                {age !== null && (
                  <p className={`text-xs mt-1 ${isChild ? 'text-amber-600' : 'text-gray-500'}`}>
                    {isChild ? `Age ${age} - Under 13 (Safety features enabled)` : `Age ${age}`}
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
                  Email (Optional)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="For password recovery"
                    className="pl-10"
                    data-testid="email-input"
                  />
                </div>
              </div>

              {isChild && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Grade</label>
                  <div className="relative">
                    <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={form.grade}
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                      className="w-full h-10 pl-10 pr-4 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
                      data-testid="grade-select"
                    >
                      <option value="">Select grade</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((g) => (
                        <option key={g} value={g}>Grade {g}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => validateStep2() && setStep(3)}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600"
                >
                  Next
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Avatar */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white mb-4">Choose your avatar</h2>
              
              <div className="flex justify-center mb-4">
                <div 
                  className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-lg"
                  style={{ backgroundColor: form.avatarColor }}
                >
                  {form.avatarEmoji}
                </div>
              </div>

              <div className="grid grid-cols-8 gap-2 max-h-[200px] overflow-y-auto p-2">
                {AVATAR_PRESETS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => selectAvatar(avatar)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all hover:scale-110 ${
                      form.avatarEmoji === avatar.emoji ? 'ring-2 ring-indigo-500 ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: avatar.color }}
                  >
                    {avatar.emoji}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1"
                >
                  <ArrowLeft className="w-5 h-5 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600"
                  data-testid="create-account-btn"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      Create Account
                      <Check className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Login link */}
        <p className="text-center mt-6 text-gray-600 dark:text-gray-400">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/new-login")}
            className="text-indigo-600 hover:underline font-semibold"
            data-testid="login-link"
          >
            Log in
          </button>
        </p>
      </div>
    </div>
  );
};

export default NewRegisterPage;
