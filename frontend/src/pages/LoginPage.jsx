import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { BookOpen, Mail, Lock, ArrowRight, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LoginPage = ({ onLogin, onKidLogin }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/auth/login", {
        email: form.email,
        password: form.password
      });

      const data = response.data;
      
      if (data.user_type === "kid") {
        // Kid login - go directly to student dashboard
        toast.success(`Welcome back, ${data.kid.name}! 🎉`);
        onKidLogin(data.kid);
        navigate("/student");
      } else {
        // Parent login - go to family dashboard
        toast.success(`Welcome back, ${data.family.family_name}!`);
        onLogin(data.family);
        navigate("/family");
      }
    } catch (error) {
      console.error("Login failed:", error);
      toast.error("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-gray-800 font-heading">Welcome Back</h1>
          <p className="text-gray-500">Parents & Students log in here</p>
        </div>

        {/* Info badges */}
        <div className="flex justify-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-indigo-100 px-4 py-2 rounded-full text-sm text-indigo-700 font-medium">
            <Users className="w-4 h-4" />
            <span>Parents</span>
          </div>
          <div className="flex items-center gap-2 bg-purple-100 px-4 py-2 rounded-full text-sm text-purple-700 font-medium">
            <User className="w-4 h-4" />
            <span>Kids</span>
          </div>
        </div>
        
        {/* Kid login hint */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-3 mb-6 border border-purple-200">
          <p className="text-xs text-purple-700 text-center">
            <strong>🎒 Kids:</strong> Use the email your parent set up for you to log in directly to your dashboard!
          </p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1 block">Email</label>
              <div className="relative">
                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="your@email.com"
                  className="pl-10 h-12"
                  data-testid="email-input"
                />
              </div>
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
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-indigo-500 to-purple-600"
              data-testid="login-btn"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  Log In
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-gray-500">
              Parents:{" "}
              <Link to="/register" className="text-indigo-600 font-semibold hover:underline">
                Create Family Account
              </Link>
            </p>
            <p className="text-center text-xs text-gray-400 mt-2">
              Students: Ask your parent to set up your login email
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
