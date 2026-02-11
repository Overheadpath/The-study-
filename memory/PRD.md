# Study Helper - Product Requirements Document

## Original Problem Statement
Build a Study Helper app with rewards system for South African CAPS curriculum students (Grade 4 and Grade 7). The app helps students with homework using AI, allows parents to approve completed tasks and award points, and students can redeem points for rewards like Pokemon booster packs.

## User Personas
1. **Student (Grade 4-9)**: Primary user who submits homework, gets AI help, earns points, and redeems rewards
2. **Parent/Au Pair**: Supervisor who approves tasks, awards points, manages kids and rewards

## SaaS Model (Implemented Feb 2026)
The app has been pivoted to a multi-tenant SaaS model:

### Free Tier
- 1 child profile
- 5 AI questions per day
- Non-intrusive banner ads

### Premium Tier (R20/month ~ $1.10 USD)
- Unlimited child profiles
- Unlimited AI questions
- Ad-free experience

## What's Been Implemented

### Authentication & User Management
- [x] Email/password registration for families
- [x] JWT-less session management (localStorage)
- [x] SHA256 password hashing
- [x] Family accounts with subscription tracking

### Stripe Payment Integration
- [x] Stripe Checkout for premium subscription
- [x] Payment verification on success callback
- [x] 30-day premium subscription activation
- [x] Transaction logging in database

### Core Features
- [x] AI Homework Helper (CAPS curriculum, Socratic method)
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
- Landing Page (public)
- Registration & Login pages
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
- **Authentication**: Email/password with SHA256 hashing

## Environment Variables
- `MONGO_URL`: MongoDB connection string
- `DB_NAME`: Database name
- `EMERGENT_LLM_KEY`: AI API key for homework helper
- `STRIPE_API_KEY`: Stripe test API key
- `REACT_APP_BACKEND_URL`: Backend API URL

## API Endpoints
### Auth
- `POST /api/auth/register` - Create family account
- `POST /api/auth/login` - Login to family account
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
- [ ] Multiple language support (Afrikaans UI)
- [ ] Export progress reports as PDF
- [ ] Backend code refactoring (split server.py)

## Last Updated
February 11, 2026 - Fixed login bug, completed Stripe payment flow
