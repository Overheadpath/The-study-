# Study Helper - Product Requirements Document

## Original Problem Statement
Build a Study Helper app with rewards system for children worldwide. The app helps students with homework using AI, allows parents to approve completed tasks and award points, and students can redeem points for rewards like Pokemon booster packs.

## User Personas
1. **Student (Any Grade)**: Primary user who submits homework, gets AI help, earns points, and redeems rewards
2. **Parent/Au Pair**: Supervisor who approves tasks, awards points, manages kids and rewards

## SaaS Model
The app is a multi-tenant SaaS platform:

### Free Tier
- 1 child profile
- 5 AI questions per day
- Non-intrusive banner ads

### Premium Tier ($1/month)
- Unlimited child profiles
- Unlimited AI questions
- Ad-free experience

## PWA (Progressive Web App) - NEW
The app is now installable as a PWA:
- **iOS & Android**: Add to Home Screen from Safari/Chrome
- **Windows & Mac**: Install from Chrome/Edge
- Works offline (cached resources)
- Push notifications ready
- App icons in all sizes (72x72 to 512x512)

## Global Curriculum Support - NEW
Supports 11 different education curriculums worldwide:
1. 🇿🇦 **CAPS** - South Africa (Grade 1-12)
2. 🇺🇸 **Common Core** - United States (K-12)
3. 🇬🇧 **National Curriculum** - United Kingdom (Year 1-13)
4. 🇦🇺 **Australian Curriculum** - Australia (Foundation-Year 12)
5. 🇮🇳 **CBSE** - India (Class 1-12)
6. 🌍 **Cambridge International** - International (Primary-A Level)
7. 🌍 **IB Programme** - International (PYP, MYP, DP)
8. 🇨🇦 **Canadian Curriculum** - Canada (K-12)
9. 🇩🇪 **German System** - Germany (Klasse 1-13)
10. 🇫🇷 **French Curriculum** - France (CP-Terminale)
11. 🌐 **Other/General** - Worldwide (All levels)

## What's Been Implemented

### Authentication & User Management
- [x] Email/password registration (2-step flow)
- [x] Curriculum selection during registration
- [x] Session management (localStorage)
- [x] SHA256 password hashing

### Stripe Payment Integration
- [x] Stripe Checkout for premium subscription
- [x] Payment verification on success callback
- [x] 30-day premium subscription activation

### PWA Features
- [x] Web App Manifest (/manifest.json)
- [x] Service Worker (/service-worker.js)
- [x] App icons (all sizes)
- [x] Install prompt component
- [x] Offline caching

### Core Features
- [x] AI Homework Helper (adapts to selected curriculum)
- [x] Task submission with image uploads
- [x] Task approval workflow with points and ratings
- [x] Reward shop with point redemption
- [x] Points tracking and history

### Gamification
- [x] Study Timer (Pomodoro-style)
- [x] Typing Practice
- [x] Leaderboard
- [x] Badges system
- [x] Weekly Challenges
- [x] Study Streaks

### Frontend Pages
- Landing Page (global, PWA download CTA)
- Registration (2-step with curriculum selection)
- Login
- Family Dashboard (with upgrade option)
- Student Dashboard
- Parent Dashboard
- AI Tutor
- Task Submission
- Reward Shop
- Points History
- Study Timer, Typing Practice, Badges, Leaderboard

## Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Shadcn/UI, React Router
- **Backend**: FastAPI, Motor (async MongoDB driver)
- **Database**: MongoDB
- **AI**: OpenAI GPT-5.2 via Emergent Integrations Library
- **Payments**: Stripe via emergentintegrations library
- **PWA**: Service Worker, Web App Manifest

## Environment Variables
- `MONGO_URL`: MongoDB connection string
- `DB_NAME`: Database name
- `EMERGENT_LLM_KEY`: AI API key for homework helper
- `STRIPE_API_KEY`: Stripe test API key
- `REACT_APP_BACKEND_URL`: Backend API URL

## API Endpoints
### Auth
- `POST /api/auth/register` - Create family account with curriculum
- `POST /api/auth/login` - Login to family account (returns curriculum)
- `GET /api/auth/family/{id}` - Get family info

### Subscription
- `GET /api/subscription/status/{family_id}` - Get subscription status
- `POST /api/subscription/checkout` - Create Stripe checkout session
- `GET /api/subscription/status/check/{session_id}` - Verify payment

## Test Credentials
- Email: test_agent@test.com
- Password: TestPass123

## Prioritized Backlog

### P1 (Important)
- [ ] Banner ads for free tier users
- [ ] Parent can set custom point values
- [ ] Weekly/monthly progress reports

### P2 (Nice to Have)
- [ ] Face ID/Fingerprint login (WebAuthn)
- [ ] Multiple language support (Afrikaans, Hindi, etc.)
- [ ] Export progress reports as PDF
- [ ] Backend code refactoring (split server.py)
- [ ] Push notifications for task approvals

## Last Updated
February 11, 2026 - Added PWA support and global curriculum selection
