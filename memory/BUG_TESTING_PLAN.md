# Study Helper - Bug Testing Plan

## Testing Phase: February 2026
**Testers:** 5 friends + family members
**App URL:** https://rewards-hub-46.preview.emergentagent.com

---

## How to Report Bugs

When you find a bug, please note:
1. **What you were trying to do** (e.g., "Login with email")
2. **What happened** (e.g., "Page showed error message")
3. **What you expected** (e.g., "Go to dashboard")
4. **Screenshot** if possible
5. **Device/Browser** (e.g., iPhone Safari, Chrome on Windows)

---

## Test Scenarios by Feature

### 1. Registration & Login (Priority: HIGH)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Register new family account | 1. Click "Get Started Free" 2. Fill in email, family name, password 3. Select avatar 4. Submit | Account created, redirected to family dashboard |
| Login as parent | 1. Click "Log In" 2. Enter email/password 3. Submit | Logged in, see family dashboard |
| Kid login (with own email) | 1. Click "Log In" 2. Use "I'm a Student" tab 3. Enter kid email/password | Logged in as student |
| Logout | Click logout button | Returned to landing page |
| Session persistence | Login, close browser, reopen app | Still logged in |

### 2. Kid Management (Priority: HIGH)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Add a child | 1. Go to "Manage Kids" 2. Fill in name, grade 3. Save | Child added to family |
| Select child profile | 1. On family dashboard, click child name | Enter student mode as that child |
| Edit child profile | 1. Settings > Profile 2. Change name/avatar | Changes saved |
| PIN protection (optional) | Set PIN for child | PIN required to access child profile |

### 3. Task Submission & Approval (Priority: HIGH)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Student submits task | 1. As student, click "Submit Task" 2. Enter subject/description 3. Submit | Task pending approval |
| Parent approves task | 1. As parent, go to "Task Approval" 2. Click approve 3. Enter points | Points added to child |
| Parent rejects task | 1. As parent, click reject on task | Task marked rejected |
| View points history | Click "Points History" | See all point transactions |

### 4. Rewards System (Priority: HIGH)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Parent creates reward | 1. "Manage Rewards" 2. Add reward name, cost 3. Save | Reward appears in shop |
| Student redeems reward | 1. As student, go to "Reward Shop" 2. Click reward 3. Redeem | Points deducted, reward claimed |
| Insufficient points | Try to redeem reward without enough points | Shows "not enough points" message |

### 5. AI Tutor (Priority: MEDIUM)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Ask homework question | 1. Open AI Tutor 2. Type question 3. Send | AI provides helpful hints (not direct answers) |
| Voice input | 1. Click microphone 2. Speak question 3. Submit | Speech converted to text, sent to AI |
| Upload homework image | Attach image of homework | AI analyzes and helps |

### 6. Daily Rewards (Priority: MEDIUM)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Claim daily reward | 1. Go to "Daily Rewards" 2. Click claim | Points added, confetti animation |
| Second claim same day | Try to claim again | Shows "already claimed" |
| Check streak | Return next day, claim again | Streak count increases |

### 7. Gamification Features (Priority: MEDIUM)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| View badges | Go to "Badges" page | See earned and locked badges |
| View leaderboard | Go to "Leaderboard" | See family members ranked by points |
| Weekly challenges | Parent: create challenge | Challenge visible to students |
| Typing practice | Go to "Typing Practice" | Can practice typing |

### 8. Premium/Subscription (Priority: MEDIUM)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| View pricing | Scroll to pricing section | See Free vs Premium comparison |
| Upgrade to Premium | Click "Start Premium" | Redirected to Stripe checkout |
| Free tier limits | Try to add >1 child on free plan | Shows upgrade prompt |

### 9. Settings (Priority: MEDIUM)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Change password | Settings > Password | Password updated |
| Toggle dark mode | Settings > Appearance | Theme changes |
| Edit profile | Settings > Profile | Name/avatar updated |

### 10. Legal Pages (Priority: LOW)

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| View Privacy Policy | Click "Privacy Policy" in footer | Opens privacy policy page |
| View Terms of Service | Click "Terms of Service" in footer | Opens terms page |

---

## Known Issues to Watch For

1. **PIN Modal** - May have minor UI glitch when entering PIN
2. **Settings buttons** - Some buttons (Notifications, Privacy) are placeholders
3. **Homework Scanner** - AI OCR not fully implemented yet
4. **Progress Reports** - UI placeholder, data may be limited

---

## Device/Browser Testing Matrix

Test on at least:
- [ ] Chrome (Desktop)
- [ ] Safari (Desktop)
- [ ] Chrome (Android)
- [ ] Safari (iOS)
- [ ] Edge (Desktop)

---

## Test Accounts

**Admin Emails (get free premium):**
- colin.starwars.gg@gmail.com
- dean.dhchapman@gmail.com
- colcha@sggs.co.za

---

## After Testing

Please share your feedback:
- What worked well?
- What was confusing?
- What features are missing?
- Any crashes or errors?

Thank you for helping test Study Helper!
