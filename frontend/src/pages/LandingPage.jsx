import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  BookOpen, Star, Trophy, Clock, Keyboard, Award, 
  Users, Check, Sparkles, ArrowRight, Crown, Globe,
  Download, Smartphone, Monitor
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CURRICULUMS } from "@/constants/curriculums";

const LandingPage = () => {
  const navigate = useNavigate();
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    // Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowInstallPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const features = [
    { icon: BookOpen, title: "AI Homework Helper", desc: "Guides learning with hints - never gives direct answers" },
    { icon: Trophy, title: "Parent-Set Rewards", desc: "Kids earn points, parents choose the real rewards to give" },
    { icon: Star, title: "Daily Login Bonus", desc: "Earn bonus points for logging in every day" },
    { icon: Keyboard, title: "Typing Practice", desc: "Improve typing speed and accuracy with fun exercises" },
    { icon: Award, title: "Badges & Mastery", desc: "Unlock badges and master subjects over time" },
    { icon: Users, title: "Family Leaderboard", desc: "Friendly competition between siblings" },
  ];

  const freeFeatures = [
    "1 child account",
    "5 AI questions per day",
    "Study timer & streaks",
    "Typing practice",
    "Basic rewards system",
    "Subject badges",
  ];

  const premiumFeatures = [
    "Unlimited children",
    "Unlimited AI questions",
    "Custom rewards with images",
    "Create weekly challenges",
    "Detailed progress reports",
    "Priority support",
    "No ads",
  ];

  // Show a few curriculum examples
  const featuredCurriculums = CURRICULUMS.slice(0, 6);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF7] via-[#FEF3C7] to-[#FDFBF7]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl text-gray-800 font-heading">Study Helper</span>
          </div>
          <div className="flex items-center gap-3">
            {showInstallPrompt && (
              <Button 
                variant="outline"
                onClick={handleInstallClick}
                className="hidden sm:flex items-center gap-2 border-indigo-300 text-indigo-600"
                data-testid="install-app-btn"
              >
                <Download className="w-4 h-4" />
                Install App
              </Button>
            )}
            <Button 
              variant="ghost" 
              onClick={() => navigate("/login")}
              data-testid="login-btn"
            >
              Log In
            </Button>
            <Button 
              onClick={() => navigate("/register")}
              className="bg-gradient-to-r from-indigo-500 to-purple-600"
              data-testid="signup-btn"
            >
              Get Started Free
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
          <Globe className="w-4 h-4" />
          Personalized for Every Learner
        </div>
        
        <h1 className="text-5xl md:text-6xl font-bold text-gray-800 mb-6 font-heading leading-tight">
          Make Learning Fun<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            With Rewards
          </span>
        </h1>
        
        <p className="text-xl text-gray-600 mb-4 max-w-3xl mx-auto">
          An app that <strong>incentivizes homework</strong> by letting kids earn points for completing tasks. 
          Parents create custom rewards, approve completed work, and decide what rewards to give.
        </p>
        
        <p className="text-base text-gray-500 mb-8 max-w-2xl mx-auto">
          Tasks can be scanned with AI or entered manually. All rewards are set and fulfilled by parents — 
          Study Helper simply tracks progress and points.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-4">
          <Button 
            onClick={() => navigate("/new-register")}
            className="h-14 px-8 text-lg bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
            data-testid="hero-signup-btn"
          >
            Start Free Trial
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate("/new-login")}
            className="h-14 px-8 text-lg"
          >
            I Have an Account
          </Button>
        </div>

        {/* Install App Banner (Mobile) */}
        {showInstallPrompt && (
          <div className="sm:hidden mb-6">
            <Button 
              onClick={handleInstallClick}
              variant="outline"
              className="w-full border-indigo-300 text-indigo-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Install App on Your Device
            </Button>
          </div>
        )}

        <p className="text-sm text-gray-500 mb-8">
          No credit card required • Free plan available forever
        </p>

        {/* Supported Curriculums */}
        <div className="flex flex-wrap justify-center gap-3">
          {featuredCurriculums.map((curr) => (
            <span 
              key={curr.id}
              className="inline-flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full text-sm text-gray-600 border border-gray-200 shadow-sm"
            >
              <span>{curr.flag}</span>
              <span>{curr.name}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-full text-sm text-indigo-600 border border-indigo-200">
            +{CURRICULUMS.length - 6} more
          </span>
        </div>
      </section>

      {/* PWA Download Section */}
      <section className="max-w-6xl mx-auto px-6 py-8">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-8 text-white">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-2 font-heading">Download the App</h3>
              <p className="text-indigo-100 mb-4">
                Install Study Helper on your phone, tablet, or computer. 
                Works offline and launches instantly from your home screen!
              </p>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
                  <Smartphone className="w-5 h-5" />
                  <span>iOS & Android</span>
                </div>
                <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg">
                  <Monitor className="w-5 h-5" />
                  <span>Windows & Mac</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {showInstallPrompt ? (
                <Button 
                  onClick={handleInstallClick}
                  className="bg-white text-indigo-600 hover:bg-gray-100 h-12 px-6"
                  data-testid="download-app-btn"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Install Now
                </Button>
              ) : (
                <div className="text-center text-indigo-100 text-sm">
                  <p>Open this site in Chrome, Safari, or Edge</p>
                  <p>and look for "Add to Home Screen"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-gray-800 text-center mb-12 font-heading">
          Everything Your Child Needs to Succeed
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="font-bold text-gray-800 mb-2 font-heading">{feature.title}</h3>
              <p className="text-gray-600 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Global Curriculum Support */}
      <section className="max-w-6xl mx-auto px-6 py-16 bg-white/50 rounded-3xl my-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-800 mb-4 font-heading">
            Works With Your Curriculum
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Our AI tutor adapts to your country's education standards. 
            Select your curriculum during signup and get tailored homework help.
          </p>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {CURRICULUMS.map((curr) => (
            <div 
              key={curr.id}
              className="bg-white rounded-xl p-4 border border-gray-100 hover:border-indigo-300 transition-colors"
            >
              <span className="text-3xl mb-2 block">{curr.flag}</span>
              <h4 className="font-semibold text-gray-800">{curr.name}</h4>
              <p className="text-sm text-gray-500">{curr.country}</p>
              <p className="text-xs text-gray-400 mt-1">{curr.grades}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="max-w-6xl mx-auto px-6 py-16" id="pricing">
        <h2 className="text-3xl font-bold text-gray-800 text-center mb-4 font-heading">
          Simple, Affordable Pricing
        </h2>
        <p className="text-gray-600 text-center mb-12">
          Start free, upgrade when you need more
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free Plan */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-200">
            <h3 className="font-bold text-2xl text-gray-800 mb-2 font-heading">Free</h3>
            <p className="text-gray-500 mb-6">Perfect to get started</p>
            
            <div className="mb-6">
              <span className="text-4xl font-bold text-gray-800 font-heading">$0</span>
              <span className="text-gray-500">/month</span>
            </div>
            
            <Button 
              variant="outline" 
              className="w-full mb-8"
              onClick={() => navigate("/register")}
            >
              Get Started
            </Button>
            
            <ul className="space-y-3">
              {freeFeatures.map((feature, index) => (
                <li key={index} className="flex items-center gap-3 text-gray-600">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Premium Plan */}
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 shadow-lg text-white relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <Crown className="w-8 h-8 text-amber-300" />
            </div>
            
            <h3 className="font-bold text-2xl mb-2 font-heading">Premium</h3>
            <p className="text-indigo-100 mb-6">For the whole family</p>
            
            <div className="mb-6">
              <span className="text-4xl font-bold font-heading">$1</span>
              <span className="text-indigo-100">/month</span>
            </div>
            
            <Button 
              className="w-full mb-8 bg-white text-indigo-600 hover:bg-gray-100"
              onClick={() => navigate("/register?plan=premium")}
              data-testid="premium-btn"
            >
              Start Premium
            </Button>
            
            <ul className="space-y-3">
              {premiumFeatures.map((feature, index) => (
                <li key={index} className="flex items-center gap-3">
                  <Check className="w-5 h-5 text-amber-300 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4 font-heading">
            Ready to Make Learning Fun?
          </h2>
          <p className="text-indigo-100 mb-8 max-w-xl mx-auto">
            Join families worldwide using Study Helper to motivate their kids.
          </p>
          <Button 
            className="h-14 px-8 text-lg bg-white text-indigo-600 hover:bg-gray-100"
            onClick={() => navigate("/register")}
          >
            Get Started Free
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="max-w-4xl mx-auto px-6 py-16 bg-gray-50 rounded-3xl mx-6 mb-16">
        <h2 className="text-2xl font-bold text-gray-800 text-center mb-8 font-heading">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-indigo-600">1</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Kids Complete Tasks</h3>
            <p className="text-sm text-gray-600">Submit homework manually or scan with AI. Tasks can be tracked in-app.</p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-amber-600">2</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Parents Approve & Award</h3>
            <p className="text-sm text-gray-600">Parents review completed work and approve points. Parents set all rewards.</p>
          </div>
          <div className="text-center p-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-green-600">3</span>
            </div>
            <h3 className="font-bold text-gray-800 mb-2">Parents Give Rewards</h3>
            <p className="text-sm text-gray-600">When kids redeem points, parents fulfill the reward they created.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-gray-500 text-sm">© 2026 Study Helper. Made with ❤️ for families worldwide.</p>
          
          {/* Legal Links */}
          <div className="flex items-center justify-center gap-6 mt-4">
            <button 
              onClick={() => navigate("/privacy-policy")}
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
              data-testid="footer-privacy-link"
            >
              Privacy Policy
            </button>
            <span className="text-gray-300">|</span>
            <button 
              onClick={() => navigate("/terms-of-service")}
              className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
              data-testid="footer-terms-link"
            >
              Terms of Service
            </button>
          </div>
          
          <p className="text-gray-400 text-xs mt-4 max-w-2xl mx-auto">
            <strong>Disclaimer:</strong> Study Helper is a homework tracking tool. All rewards are created, approved, and fulfilled entirely by parents. 
            Study Helper does not provide, guarantee, or have any responsibility for rewards. Points have no monetary value outside this app.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
