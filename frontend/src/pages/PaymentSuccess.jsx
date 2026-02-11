import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "@/App";
import { Check, Crown, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const PaymentSuccess = ({ onUpdateFamily }) => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading, success, error
  const [paymentDetails, setPaymentDetails] = useState(null);
  
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (sessionId) {
      verifyPayment();
    } else {
      setStatus("error");
    }
  }, [sessionId]);

  const verifyPayment = async () => {
    try {
      const response = await api.get(`/subscription/status/check/${sessionId}`);
      setPaymentDetails(response.data);
      
      if (response.data.payment_status === "paid") {
        setStatus("success");
        
        // Refresh family data in local storage
        const savedFamily = localStorage.getItem("studyhelper_family");
        if (savedFamily) {
          const family = JSON.parse(savedFamily);
          const familyResponse = await api.get(`/auth/family/${family.id}`);
          localStorage.setItem("studyhelper_family", JSON.stringify(familyResponse.data));
          if (onUpdateFamily) {
            onUpdateFamily(familyResponse.data);
          }
        }
      } else {
        setStatus("pending");
      }
    } catch (error) {
      console.error("Payment verification failed:", error);
      setStatus("error");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700">Verifying your payment...</h2>
          <p className="text-gray-500">Please wait a moment</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Verification Issue</h1>
          <p className="text-gray-500 mb-6">
            We couldn't verify your payment. Don't worry - if you were charged, your subscription will be activated shortly.
          </p>
          <Link to="/family">
            <Button className="btn-primary">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="text-center max-w-md mx-auto px-6">
          <Loader2 className="w-12 h-12 text-amber-500 animate-spin mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Payment Processing</h1>
          <p className="text-gray-500 mb-6">
            Your payment is being processed. This usually takes just a moment.
          </p>
          <Button onClick={verifyPayment} variant="outline" className="mr-2">
            Check Again
          </Button>
          <Link to="/family">
            <Button className="btn-primary">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]" data-testid="payment-success">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="relative mb-6">
          <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Check className="w-12 h-12 text-white" strokeWidth={3} />
          </div>
          <div className="absolute -top-2 -right-2 w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center shadow-md animate-bounce">
            <Crown className="w-5 h-5 text-amber-900" />
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-800 mb-2 font-heading">
          Welcome to Premium!
        </h1>
        <p className="text-gray-500 mb-6">
          Your payment was successful. Enjoy unlimited access to all features!
        </p>
        
        <div className="bg-white rounded-2xl p-6 mb-6 border border-gray-100 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3">What's Unlocked:</h3>
          <ul className="text-left text-gray-600 space-y-2">
            <li className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <span>Unlimited child profiles</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <span>Unlimited AI tutor questions</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <span>Ad-free experience</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-5 h-5 text-green-500" />
              <span>Priority support</span>
            </li>
          </ul>
        </div>
        
        <Link to="/family">
          <Button className="btn-primary w-full py-6 text-lg" data-testid="go-to-dashboard-btn">
            Start Learning!
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default PaymentSuccess;
