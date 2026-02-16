import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const TermsOfService = () => {
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
          <h1 className="font-bold text-gray-800 dark:text-white font-heading text-lg">Terms of Service</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Last updated: February 2026</p>

          <div className="prose dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Study Helper ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
              </p>
              <p>
                If you are a parent or guardian creating an account for your family, you represent that you have the authority to bind your family to these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">2. Description of Service</h2>
              <p>
                Study Helper is a homework tracking and motivation application that allows:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Children to submit and track homework tasks</li>
                <li>Parents to approve tasks and award points</li>
                <li>Parents to create and manage custom rewards</li>
                <li>AI-assisted homework help (without providing direct answers)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">3. Important Disclaimers About Rewards</h2>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 my-4">
                <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">Please Read Carefully:</p>
                <ul className="list-disc pl-6 space-y-2 text-amber-700 dark:text-amber-300">
                  <li><strong>All rewards are created, managed, and fulfilled entirely by parents.</strong> Study Helper does not provide, guarantee, or have any responsibility for rewards.</li>
                  <li><strong>Points have no monetary value</strong> and cannot be exchanged for cash or transferred outside the app.</li>
                  <li>Study Helper is not responsible for any disputes between parents and children regarding rewards.</li>
                  <li>Parents are solely responsible for ensuring rewards are appropriate and delivered as promised to their children.</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">4. Account Registration</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>You must be at least 18 years old to create a family account</li>
                <li>You are responsible for maintaining the security of your account</li>
                <li>You are responsible for all activities under your account</li>
                <li>You must provide accurate and complete information</li>
                <li>One family account per household is recommended</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">5. Child Accounts</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Child accounts can only be created by a parent or guardian</li>
                <li>Parents are responsible for supervising their children's use of the Service</li>
                <li>Children under 13 require parental consent to use the Service</li>
                <li>Parents can modify or delete child accounts at any time</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">6. Acceptable Use</h2>
              <p>You agree NOT to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Use the Service for any illegal purpose</li>
                <li>Upload inappropriate, offensive, or harmful content</li>
                <li>Attempt to gain unauthorized access to the Service</li>
                <li>Use automated systems to access the Service (bots, scrapers)</li>
                <li>Interfere with or disrupt the Service</li>
                <li>Impersonate others or provide false information</li>
                <li>Use the AI features to generate inappropriate content</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">7. AI Features</h2>
              <p>Our AI homework helper:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Is designed to guide learning, not provide direct answers</li>
                <li>May occasionally provide inaccurate information</li>
                <li>Should not be relied upon as the sole source of educational content</li>
                <li>Is not a replacement for teachers, tutors, or parental guidance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">8. Subscription and Payments</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Free and Premium subscription tiers are available</li>
                <li>Premium subscriptions are billed monthly via Stripe</li>
                <li>You may cancel your subscription at any time</li>
                <li>Refunds are provided at our discretion</li>
                <li>Prices may change with 30 days notice</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">9. Intellectual Property</h2>
              <p>
                The Service and its original content, features, and functionality are owned by Study Helper and are protected by copyright, trademark, and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, STUDY HELPER SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
              </p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Loss of data or content</li>
                <li>Disputes regarding rewards between family members</li>
                <li>Inaccuracies in AI-generated content</li>
                <li>Service interruptions or downtime</li>
                <li>Unauthorized access to your account</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">11. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">12. Termination</h2>
              <p>
                We may terminate or suspend your account at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">13. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. We will notify users of significant changes. Continued use of the Service after changes constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">14. Governing Law</h2>
              <p>
                These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-3">15. Contact</h2>
              <p>
                For questions about these Terms, please contact us at:
              </p>
              <p className="mt-2">
                <strong>Email:</strong> legal@studyhelper.com
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default TermsOfService;
