# Study Helper - Product Requirements Document

## Original Problem Statement
Build a Study Helper app with rewards system for children worldwide. The app helps students with homework using AI, allows parents to approve completed tasks and award points, and students can redeem points for rewards.

## User Personas
1. **Student (Any Grade)**: Primary user who submits homework, gets AI help, earns points, and redeems rewards
2. **Parent/Admin**: Supervisor who approves tasks, awards points, manages kids and rewards

## SaaS Model
Multi-tenant SaaS platform:

### Free Tier
- 1 child profile
- 5 AI questions per day

### Premium Tier ($2/month)
- Unlimited child profiles
- Unlimited AI questions
- Ad-free experience

### Admin Accounts (Free Premium Forever)
- `colin.starwars.gg@gmail.com`
- `dean.dhchapman@gmail.com`
- `colcha@sggs.co.za`

## PWA (Progressive Web App)
The app is installable:
- **iOS & Android**: Add to Home Screen from Safari/Chrome
- **Windows & Mac**: Install from Chrome/Edge
- Works offline (cached resources)
- App icons in all sizes (72x72 to 512x512)
- Service worker for caching

## Global Curriculum Support
11 education curriculums:
1. 🇿🇦 CAPS - South Africa
2. 🇺🇸 Common Core - United States
3. 🇬🇧 National Curriculum - UK
4. 🇦🇺 Australian Curriculum
5. 🇮🇳 CBSE - India
6. 🌍 Cambridge International
7. 🌍 IB Programme
8. 🇨🇦 Canadian Curriculum
9. 🇩🇪 German System
10. 🇫🇷 French Curriculum
11. 🌐 Other/General

## Authentication System

### Parent Login
- Register with email/password
- Select curriculum during 2-step registration
- Access to Family Dashboard, Parent Dashboard
- Can manage kids, approve tasks, manage rewards

### Kid Direct Login
- Parents set up email/password for each kid
- Kids log in with their own email at the main login page
- Goes directly to Student Dashboard
- Cannot access Parent Dashboard or admin features

### Session Persistence
- Login persists across page refreshes
- Back button doesn't log you out
- State saved in localStorage

## Account Sharing System (NEW)
Allows two parent accounts to share a kid:
1. Parent 1 tries to add a kid with Parent 2's email
2. System offers to send a share request
3. Parent 2 sees notification bell with pending requests
4. Parent 2 can Approve or Reject
5. If approved, both parents see the kid's progress
6. Kid can login directly with their email

## What's Been Implemented

### Core Features
- [x] AI Homework Helper (Socratic method, adapts to curriculum)
- [x] Task submission with image uploads
- [x] Task approval workflow
- [x] Reward shop with point redemption
- [x] Points tracking

### Gamification
- [x] Study Timer (Pomodoro-style)
- [x] Typing Practice
- [x] Leaderboard
- [x] Badges system
- [x] Weekly Challenges
- [x] Study Streaks

### Authentication
- [x] Parent email/password login
- [x] Kid direct email login
- [x] PIN login for shared devices
- [x] Admin accounts with free premium
- [x] Session persistence (localStorage)

### Account Sharing
- [x] Share request system
- [x] Notification bell for pending requests
- [x] Approve/Reject workflow
- [x] Shared kids visible to both families

### Referral Program (NEW - Feb 14, 2026)
- [x] Unique referral code per family
- [x] Referral code input on registration page
- [x] Real-time code validation
- [x] Both referrer and referred get 1 month FREE Premium
- [x] "Invite Friends" button in Family Dashboard
- [x] Referral dialog with code, copy button, stats
- [x] Share referral link via Web Share API

### Achievement Certificates (NEW - Feb 14, 2026)
- [x] Automatic certificate generation at milestones (100, 250, 500, 1000, 2500 points)
- [x] "My Certificates" button in Student Dashboard
- [x] Certificates page showing earned awards
- [x] Printable HTML certificate with styling
- [x] New certificate notifications

### PWA
- [x] Web App Manifest
- [x] Service Worker (v2)
- [x] App icons (all sizes)
- [x] Install prompt
- [x] Offline caching

### Payments
- [x] Stripe Checkout
- [x] Payment verification
- [x] Subscription management

## Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Shadcn/UI
- **Backend**: FastAPI, Motor (MongoDB)
- **Database**: MongoDB
- **AI**: OpenAI GPT-5.2 via Emergent Integrations
- **Payments**: Stripe

## API Endpoints

### Auth
- `POST /api/auth/register` - Create family account
- `POST /api/auth/login` - Login (parent or kid)
- `GET /api/auth/family/{id}` - Get family info

### Kids
- `GET /api/kids?family_id=X` - Get kids (includes shared)
- `POST /api/kids` - Create kid
- `PUT /api/kids/{id}` - Update kid

### Sharing
- `POST /api/share/request` - Send share request
- `GET /api/share/requests/pending` - Get pending requests
- `POST /api/share/requests/{id}/approve` - Approve request
- `POST /api/share/requests/{id}/reject` - Reject request

### Subscription
- `GET /api/subscription/status/{family_id}`
- `POST /api/subscription/checkout`

### Referrals
- `GET /api/referral/stats/{family_id}` - Get referral stats and code
- `GET /api/referral/validate/{code}` - Validate a referral code

### Certificates
- `GET /api/certificates/{kid_id}` - Get all certificates for a kid
- `GET /api/certificate/{certificate_id}/pdf` - Get printable certificate HTML

## Prioritized Backlog

### P1 (Important)
- [ ] Password reset functionality
- [ ] Email notifications for share requests
- [ ] Progress reports

### P2 (Nice to Have)
- [ ] Face ID/Fingerprint login
- [ ] Multi-language UI
- [ ] PDF export
- [ ] Push notifications

## Last Updated
February 14, 2026 - Added Referral Program, Achievement Certificates, Settings page, and fixed hover visibility & back button issues
