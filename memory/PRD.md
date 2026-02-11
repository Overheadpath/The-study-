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

### Premium Tier ($1/month)
- Unlimited child profiles
- Unlimited AI questions
- Ad-free experience

### Admin Accounts
- `Colin.starwars.gg@gmail.com` - Full premium access forever, no payment required

## PWA (Progressive Web App)
The app is installable:
- **iOS & Android**: Add to Home Screen from Safari/Chrome
- **Windows & Mac**: Install from Chrome/Edge
- Works offline (cached resources)
- App icons in all sizes

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
- Select curriculum during registration
- Access to Family Dashboard, Parent Dashboard
- Can manage kids, approve tasks, manage rewards

### Kid Direct Login (NEW)
- Parents set up email/password for each kid
- Kids log in with their own email
- Goes directly to Student Dashboard
- Cannot access Parent Dashboard or admin features
- PIN login still available for shared devices

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
- [x] Kid direct email login (NEW)
- [x] PIN login for shared devices
- [x] Admin accounts with free premium

### PWA
- [x] Web App Manifest
- [x] Service Worker
- [x] App icons
- [x] Install prompt

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
- `POST /api/kids` - Create kid (with optional email/password)
- `PUT /api/kids/{id}` - Update kid (can add email/password)

### Subscription
- `GET /api/subscription/status/{family_id}`
- `POST /api/subscription/checkout`

## Prioritized Backlog

### P1 (Important)
- [ ] Password reset functionality
- [ ] Banner ads for free tier
- [ ] Progress reports

### P2 (Nice to Have)
- [ ] Face ID/Fingerprint login
- [ ] Multi-language UI
- [ ] PDF export
- [ ] Push notifications

## Last Updated
February 11, 2026 - Added kid direct email login, admin system, PWA fixes
