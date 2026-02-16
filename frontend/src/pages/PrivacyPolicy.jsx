import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FDFBF7] dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <h1 className="font-bold text-gray-800 dark:text-white font-heading text-lg">Privacy Policy</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Last updated: February 2026</p>

          <div className="prose dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">1. Introduction</h2>
              <p>
                Study Helper ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Service").
              </p>
              <p>
                By using Study Helper, you agree to the collection and use of information in accordance with this policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">2. Information We Collect</h2>
              
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">2.1 Information You Provide</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Account Information:</strong> Email address, family name, and password when you register</li>
                <li><strong>Child Profiles:</strong> Names, grade levels, and optional PINs for children added to your family account</li>
                <li><strong>Task Data:</strong> Homework descriptions, subjects, and uploaded images</li>
                <li><strong>Rewards:</strong> Custom rewards created by parents within the app</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-2 mt-4">2.2 Automatically Collected Information</h3>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Usage Data:</strong> Points earned, tasks completed, login streaks, and app interactions</li>
                <li><strong>Device Information:</strong> Device type, operating system, and browser type</li>
                <li><strong>Log Data:</strong> IP address, access times, and pages viewed</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">3. How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Provide, maintain, and improve the Service</li>
                <li>Process homework tasks and track progress</li>
                <li>Enable AI-powered homework assistance (images are processed but not permanently stored)</li>
                <li>Send notifications about task approvals and achievements (if enabled)</li>
                <li>Process subscription payments through Stripe</li>
                <li>Respond to customer service requests</li>
                <li>Detect and prevent fraud or abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">4. Children's Privacy (COPPA Compliance)</h2>
              <p>
                Study Helper is designed for use by families. Children under 13 may only use the Service under the supervision and with the consent of a parent or guardian who has created the family account.
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>We do not knowingly collect personal information directly from children under 13</li>
                <li>All child accounts are created and managed by parents</li>
                <li>Parents can review, modify, or delete their child's information at any time</li>
                <li>We do not display targeted advertising to children</li>
                <li>Child data is never sold to third parties</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">5. Data Sharing and Disclosure</h2>
              <p>We do not sell your personal information. We may share information only in these circumstances:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Service Providers:</strong> With third parties who assist in operating our Service (e.g., Stripe for payments, OpenAI for AI features)</li>
                <li><strong>Legal Requirements:</strong> If required by law or to protect our rights</li>
                <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">6. Data Security</h2>
              <p>
                We implement appropriate security measures to protect your information, including:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Encrypted password storage</li>
                <li>Secure HTTPS connections</li>
                <li>Regular security assessments</li>
              </ul>
              <p className="mt-2">
                However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">7. Data Retention</h2>
              <p>
                We retain your information for as long as your account is active or as needed to provide the Service. You may request deletion of your account and associated data at any time by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">8. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Access the personal information we hold about you</li>
                <li>Correct inaccurate information</li>
                <li>Delete your account and associated data</li>
                <li>Export your data in a portable format</li>
                <li>Opt-out of marketing communications</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">9. Third-Party Services</h2>
              <p>Our Service may use the following third-party services:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Stripe:</strong> For payment processing (see Stripe's Privacy Policy)</li>
                <li><strong>OpenAI:</strong> For AI homework assistance (images are processed but not stored by us)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">10. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">11. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> privacy@studyhelper.com
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
