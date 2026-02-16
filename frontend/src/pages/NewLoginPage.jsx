import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/App";
import { toast } from "sonner";
import { User, Lock, Sparkles, QrCode, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NewLoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: ""
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!form.username || !form.password) {
      toast.error("Please enter username and password");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/users/login", {
        username: form.username.toLowerCase(),
        password: form.password
      });

      toast.success(`Welcome back, ${response.data.display_name}!`);
      
      // Store user data
      localStorage.setItem("studyhelper_user", JSON.stringify(response.data));
      onLogin(response.data);
      navigate("/dashboard");
    } catch (error) {
      const message = error.response?.data?.detail || "Login failed";
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
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white font-heading">Welcome Back</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Log in to Study Helper</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-gray-700">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="Your username"
                  className="pl-10"
                  autoComplete="username"
                  data-testid="username-input"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Your password"
                  className="pl-10"
                  autoComplete="current-password"
                  data-testid="password-input"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600"
              data-testid="login-btn"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Log In
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200 dark:border-gray-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">or</span>
            </div>
          </div>

          {/* Join Group via QR */}
          <Button
            variant="outline"
            onClick={() => navigate("/join-group")}
            className="w-full"
            data-testid="qr-join-btn"
          >
            <QrCode className="w-5 h-5 mr-2" />
            Join a Group with QR Code
          </Button>
        </div>

        {/* Register link */}
        <p className="text-center mt-6 text-gray-600 dark:text-gray-400">
          Don't have an account?{" "}
          <button
            onClick={() => navigate("/new-register")}
            className="text-indigo-600 hover:underline font-semibold"
            data-testid="register-link"
          >
            Create one
          </button>
        </p>

        {/* Old system link */}
        <p className="text-center mt-4 text-gray-500 dark:text-gray-500 text-sm">
          <button
            onClick={() => navigate("/login")}
            className="hover:underline"
          >
            Login with email (old system)
          </button>
        </p>
      </div>
    </div>
  );
};

export default NewLoginPage;
