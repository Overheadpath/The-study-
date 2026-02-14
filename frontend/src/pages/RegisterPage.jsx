import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { BookOpen, Mail, Lock, User, ArrowRight, Globe, Gift, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { CURRICULUMS } from "@/constants/curriculums";
import { AVATAR_PRESETS, getRandomAvatar } from "@/constants/avatars";

const RegisterPage = ({ onRegister }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1: Account info, 2: Avatar & Preferences, 3: Curriculum
  const [referralValid, setReferralValid] = useState(null);
  const [referrerName, setReferrerName] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    familyName: "",
    curriculum: "caps",
    referralCode: "",
    avatar: getRandomAvatar(),
    emailNotifications: true
  });
  const [errors, setErrors] = useState({});

  // Check for referral code in URL
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      setForm(prev => ({ ...prev, referralCode: refCode }));
      validateReferralCode(refCode);
    }
  }, [searchParams]);

  const validateReferralCode = async (code) => {
    if (!code || code.length < 6) {
      setReferralValid(null);
      return;
    }
    try {
      const response = await api.get(`/referral/validate/${code}`);
      setReferralValid(response.data.valid);
      if (response.data.valid) {
        setReferrerName(response.data.family_name);
      }
    } catch (error) {
      setReferralValid(false);
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = "Invalid email";
    if (!form.password) newErrors.password = "Password is required";
    else if (form.password.length < 6) newErrors.password = "Password must be at least 6 characters";
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = "Passwords don't match";
    if (!form.familyName) newErrors.familyName = "Family name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) {
      if (validate()) setStep(2);
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await api.post("/auth/register", {
        email: form.email,
        password: form.password,
        family_name: form.familyName,
        curriculum: form.curriculum,
        referral_code: form.referralCode || null,
        avatar_id: form.avatar.id,
        avatar_emoji: form.avatar.emoji,
        avatar_color: form.avatar.color,
        email_notifications: form.emailNotifications
      });

      if (form.referralCode && referralValid) {
        toast.success("🎉 Account created with FREE Premium month!");
      } else {
        toast.success("Account created! Welcome to Study Helper!");
      }
      onRegister(response.data);
      navigate("/family", { replace: true });
    } catch (error) {
      console.error("Registration failed:", error);
      const message = error.response?.data?.detail || "Registration failed. Try again.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedCurriculum = CURRICULUMS.find(c => c.id === form.curriculum);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF7] via-[#FEF3C7] to-[#FDFBF7] flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-2xl text-gray-800 font-heading">Study Helper</span>
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 font-heading">
            {step === 1 ? "Create Your Account" : step === 2 ? "Choose Your Avatar" : "Select Your Curriculum"}
          </h1>
          <p className="text-gray-500">
            {step === 1 ? "Start your family's learning journey" : step === 2 ? "Pick a fun character to represent your family!" : "So we can tailor the AI tutor to your needs"}
          </p>
        </div>

        {/* Progress indicator - 3 steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
          <div className={`w-8 h-1 ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
          <div className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
          <div className={`w-8 h-1 ${step >= 3 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
          <div className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-indigo-600' : 'bg-gray-300'}`}></div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 ? (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">Family Name</label>
                  <div className="relative">
                    <User className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={form.familyName}
                      onChange={(e) => setForm({ ...form, familyName: e.target.value })}
                      placeholder="e.g., The Smiths"
                      className="pl-10 h-12"
                      data-testid="family-name-input"
                    />
                  </div>
                  {errors.familyName && <p className="text-red-500 text-xs mt-1">{errors.familyName}</p>}
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">Email</label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="parent@example.com"
                      className="pl-10 h-12"
                      data-testid="email-input"
                    />
                  </div>
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">Password</label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className="pl-10 h-12"
                      data-testid="password-input"
                    />
                  </div>
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">Confirm Password</label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                      placeholder="••••••••"
                      className="pl-10 h-12"
                      data-testid="confirm-password-input"
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
                </div>

                {/* Referral Code Input */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-1 block">
                    Referral Code <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <Gift className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      value={form.referralCode}
                      onChange={(e) => {
                        const code = e.target.value.toUpperCase();
                        setForm({ ...form, referralCode: code });
                        if (code.length >= 6) {
                          validateReferralCode(code);
                        } else {
                          setReferralValid(null);
                        }
                      }}
                      placeholder="Enter code for FREE month"
                      className={`pl-10 h-12 uppercase ${
                        referralValid === true ? 'border-green-500 bg-green-50' : 
                        referralValid === false ? 'border-red-500 bg-red-50' : ''
                      }`}
                      maxLength={10}
                      data-testid="referral-code-input"
                    />
                  </div>
                  {referralValid === true && (
                    <p className="text-green-600 text-xs mt-1 flex items-center gap-1">
                      <Gift className="w-3 h-3" />
                      Valid code from {referrerName}! You'll both get 1 month FREE Premium!
                    </p>
                  )}
                  {referralValid === false && (
                    <p className="text-red-500 text-xs mt-1">Invalid referral code</p>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full h-12 bg-gradient-to-r from-indigo-500 to-purple-600"
                  data-testid="next-btn"
                >
                  Next: Choose Avatar
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </>
            ) : step === 2 ? (
              <>
                {/* Avatar Selection */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 block text-center">
                    Pick your family avatar!
                  </label>
                  
                  {/* Current Selection */}
                  <div className="flex justify-center mb-4">
                    <div 
                      className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shadow-lg transition-transform hover:scale-105"
                      style={{ backgroundColor: form.avatar.color }}
                    >
                      {form.avatar.emoji}
                    </div>
                  </div>
                  <p className="text-center text-sm text-gray-600 mb-4 font-semibold">{form.avatar.name}</p>
                  
                  {/* Avatar Grid */}
                  <div className="grid grid-cols-6 gap-2 max-h-[200px] overflow-y-auto p-2">
                    {AVATAR_PRESETS.map((avatar) => (
                      <button
                        key={avatar.id}
                        type="button"
                        onClick={() => setForm({ ...form, avatar })}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all hover:scale-110 ${
                          form.avatar.id === avatar.id 
                            ? 'ring-3 ring-indigo-500 ring-offset-2' 
                            : ''
                        }`}
                        style={{ backgroundColor: avatar.color }}
                        data-testid={`avatar-${avatar.id}`}
                      >
                        {avatar.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Email Notifications Opt-in */}
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                  <Checkbox
                    id="emailNotifications"
                    checked={form.emailNotifications}
                    onCheckedChange={(checked) => setForm({ ...form, emailNotifications: checked })}
                    data-testid="email-notifications-checkbox"
                  />
                  <div className="flex-1">
                    <label htmlFor="emailNotifications" className="text-sm font-semibold text-gray-700 cursor-pointer flex items-center gap-2">
                      <Bell className="w-4 h-4 text-indigo-500" />
                      Send me email updates
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Get weekly progress reports and tips for your kids' learning
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1 h-12"
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex-1 h-12 bg-gradient-to-r from-indigo-500 to-purple-600"
                    data-testid="next-curriculum-btn"
                  >
                    Next
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-3 block flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Select Your Curriculum
                  </label>
                  
                  <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-2">
                    {CURRICULUMS.map((curr) => (
                      <button
                        key={curr.id}
                        type="button"
                        onClick={() => setForm({ ...form, curriculum: curr.id })}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          form.curriculum === curr.id 
                            ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' 
                            : 'border-gray-200 hover:border-indigo-300'
                        }`}
                        data-testid={`curriculum-${curr.id}`}
                      >
                        <span className="text-xl">{curr.flag}</span>
                        <p className="font-semibold text-gray-800 text-sm mt-1">{curr.name}</p>
                        <p className="text-xs text-gray-500">{curr.country}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedCurriculum && (
                  <div className="bg-indigo-50 rounded-xl p-4">
                    <p className="text-sm text-indigo-800">
                      <span className="font-semibold">Selected:</span> {selectedCurriculum.name}
                    </p>
                    <p className="text-xs text-indigo-600 mt-1">{selectedCurriculum.description}</p>
                    <p className="text-xs text-indigo-600">Supports: {selectedCurriculum.grades}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                    className="flex-1 h-12"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 h-12 bg-gradient-to-r from-indigo-500 to-purple-600"
                    data-testid="register-btn"
                  >
                    {loading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-indigo-600 font-semibold hover:underline">
              Log In
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
