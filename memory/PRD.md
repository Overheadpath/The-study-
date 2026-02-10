# Study Helper - Product Requirements Document

## Original Problem Statement
Build a Study Helper app with rewards system for South African CAPS curriculum students (Grade 4 and Grade 7). The app helps students with homework using AI, allows parents to approve completed tasks and award points, and students can redeem points for rewards like Pokemon booster packs.

## User Personas
1. **Student (Grade 4-9)**: Primary user who submits homework, gets AI help, earns points, and redeems rewards
2. **Parent/Au Pair**: Supervisor who approves tasks, awards points, manages kids and rewards

## Core Requirements
- PIN-based authentication (Parent vs Student mode)
- AI Homework Helper (CAPS curriculum aligned)
- Task submission and approval workflow
- Points-based reward system
- Support for multiple kids with different grades

## What's Been Implemented (Jan 2026)

### Backend (FastAPI + MongoDB)
- [x] PIN authentication for parent and students
- [x] Kids CRUD operations (add, edit, delete, view)
- [x] Tasks CRUD with approval workflow
- [x] Rewards CRUD with redemption system
- [x] Points tracking and history
- [x] AI Chat integration with GPT-5.2 (Emergent LLM Key)
- [x] CAPS subjects by grade level (4-9)
- [x] Dashboard statistics endpoints

### Frontend (React + Tailwind + Shadcn)
- [x] PIN Entry screen with mode selection
- [x] Student Dashboard with progress tracking
- [x] AI Tutor chat interface
- [x] Task submission form
- [x] Reward Shop with redemption
- [x] Points History view
- [x] Parent Dashboard with alerts
- [x] Task Approval interface with rating & points
- [x] Manage Rewards page
- [x] Manage Kids page

### Design
- Fredoka font for headings
- Nunito font for body text
- Kid-friendly color scheme (Indigo, Amber, Emerald)
- Playful card-based layout
- Smooth animations and transitions

## Prioritized Backlog

### P0 (Critical) - Completed
- All core features implemented

### P1 (Important) - Future Enhancements
- [ ] Parent can set custom point values for subjects
- [ ] Weekly/monthly progress reports
- [ ] Achievement badges for milestones
- [ ] Push notifications for task approvals

### P2 (Nice to Have)
- [ ] Multiple language support (Afrikaans UI)
- [ ] Export progress reports as PDF
- [ ] Integration with school calendar
- [ ] Parental controls for AI chat topics

## Technical Architecture
- **Frontend**: React 19, Tailwind CSS, Shadcn/UI, React Router
- **Backend**: FastAPI, Motor (async MongoDB driver)
- **Database**: MongoDB
- **AI**: OpenAI GPT-5.2 via Emergent Integrations Library
- **Authentication**: PIN-based (stored in MongoDB)

## Default Credentials
- Parent PIN: 1234
- Student PINs: Set by parent when adding kids

## Environment Variables
- `MONGO_URL`: MongoDB connection string
- `DB_NAME`: Database name
- `EMERGENT_LLM_KEY`: AI API key for homework helper
- `REACT_APP_BACKEND_URL`: Backend API URL
