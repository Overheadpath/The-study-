from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import io
import time
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import base64
import hashlib
from collections import defaultdict

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# Stripe Key
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY')

# Subscription pricing (in USD)
SUBSCRIPTION_PRICE = 2.00

# Admin emails - these get free premium access
ADMIN_EMAILS = [
    "colin.starwars.gg@gmail.com",
    "dean.dhchapman@gmail.com",
    "colcha@sggs.co.za",
]

def is_admin_email(email: str) -> bool:
    """Check if email is an admin email (case-insensitive)"""
    return email.lower() in [e.lower() for e in ADMIN_EMAILS]

# ============ ANTI-CHEAT RATE LIMITING ============
# Store last request timestamps per user/endpoint
rate_limit_store = defaultdict(lambda: defaultdict(float))

# Rate limits per endpoint (seconds between requests)
RATE_LIMITS = {
    "daily_rewards_claim": 5,  # 5 seconds between claims
    "task_submit": 10,  # 10 seconds between task submissions
    "typing_practice": 2,  # 2 seconds between typing submissions
    "ai_question": 3,  # 3 seconds between AI questions
}

def check_rate_limit(user_id: str, action: str) -> bool:
    """Check if user is rate limited. Returns True if allowed, False if blocked."""
    limit = RATE_LIMITS.get(action, 1)
    last_request = rate_limit_store[user_id][action]
    now = time.time()
    
    if now - last_request < limit:
        return False
    
    rate_limit_store[user_id][action] = now
    return True

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")
# Health check and root route
@api_router.get("/")
async def root():
    return {"message": "Study Helper API", "status": "healthy"}

# ============ MODELS ============

class Kid(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    family_id: Optional[str] = None  # Primary family that owns this kid
    shared_with: List[str] = []  # List of family_ids that can also see this kid
    name: str
    grade: int
    pin: str
    email: Optional[str] = None  # Kid's own email for direct login
    password_hash: Optional[str] = None  # Kid's password for direct login
    points: int = 0
    avatar_color: str = "#4F46E5"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class KidCreate(BaseModel):
    family_id: Optional[str] = None
    name: str
    grade: int
    pin: str
    email: Optional[str] = None  # Optional email for kid's direct login
    password: Optional[str] = None  # Optional password for kid's direct login
    avatar_color: Optional[str] = "#4F46E5"

class KidUpdate(BaseModel):
    name: Optional[str] = None
    grade: Optional[int] = None
    email: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None
    avatar_color: Optional[str] = None
    points: Optional[int] = None

# Share request for linking kids between accounts
class ShareRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_family_id: str  # Family requesting to share
    to_family_id: str  # Family being asked to share
    to_email: str  # Email of the account being asked
    kid_name: str  # Name of kid to share
    kid_email: Optional[str] = None  # Email for the kid
    status: str = "pending"  # pending, approved, rejected
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ShareRequestCreate(BaseModel):
    to_email: str  # Email of account to share with
    kid_name: str
    kid_grade: int
    kid_pin: str
    kid_email: Optional[str] = None
    kid_password: Optional[str] = None
    avatar_color: Optional[str] = "#4F46E5"

class Task(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    title: str
    description: str
    subject: str
    image_url: Optional[str] = None  # Photo of completed homework
    status: str = "pending"  # pending, approved, rejected
    points_awarded: int = 0
    rating: int = 0  # 1-5 stars
    parent_feedback: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    approved_at: Optional[datetime] = None

class TaskCreate(BaseModel):
    kid_id: str
    title: str
    description: str
    subject: str
    image_url: Optional[str] = None  # Photo of completed homework

class TaskApproval(BaseModel):
    status: str  # approved or rejected
    points_awarded: int = 0
    rating: int = 0
    parent_feedback: Optional[str] = None

class Reward(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str
    points_required: int
    image_url: str
    quantity: int = -1  # -1 means unlimited
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RewardCreate(BaseModel):
    name: str
    description: str
    points_required: int
    image_url: str
    quantity: Optional[int] = -1

class RewardRedemption(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    reward_id: str
    reward_name: str
    points_spent: int
    status: str = "pending"  # pending, given, cancelled
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    role: str  # user or assistant
    content: str
    subject: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ChatRequest(BaseModel):
    kid_id: str
    message: str
    subject: Optional[str] = None
    image_url: Optional[str] = None  # For homework picture analysis

class PointsHistory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    amount: int
    reason: str
    task_id: Optional[str] = None
    reward_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============ NEW FEATURE MODELS ============

class StudySession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    subject: str
    goal_minutes: int
    actual_minutes: int
    points_earned: int
    completed: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudySessionCreate(BaseModel):
    kid_id: str
    subject: str
    goal_minutes: int
    actual_minutes: int

class StudyStreak(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    current_streak: int = 0
    longest_streak: int = 0
    last_study_date: Optional[str] = None

class Badge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    badge_type: str  # maths_master, english_expert, etc.
    tier: int = 1  # 1=Bronze, 2=Silver, 3=Gold, 4=Master
    tasks_completed: int = 0
    earned_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WeeklyChallenge(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    points_reward: int
    target_kid_id: Optional[str] = None  # None means all kids
    deadline: str
    status: str = "active"  # active, completed, expired
    completed_by: List[str] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class WeeklyChallengeCreate(BaseModel):
    title: str
    description: str
    points_reward: int
    target_kid_id: Optional[str] = None
    deadline: str

# Referral System
class Referral(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    referrer_family_id: str  # Who sent the referral
    referral_code: str  # Unique code
    referred_email: Optional[str] = None  # Who used it
    referred_family_id: Optional[str] = None
    status: str = "pending"  # pending, used, rewarded
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Achievement Certificates
class Certificate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    kid_name: str
    achievement_type: str  # e.g., "points_milestone", "streak", "subject_master"
    achievement_title: str
    achievement_description: str
    points_at_time: int
    issued_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TypingSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kid_id: str
    wpm: int  # words per minute
    accuracy: float
    duration_seconds: int
    points_earned: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TypingSessionCreate(BaseModel):
    kid_id: str
    wpm: int
    accuracy: float
    duration_seconds: int

class TaskPointEstimate(BaseModel):
    estimated_points: int
    reasoning: str

# ============ USER & SUBSCRIPTION MODELS ============

class Family(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    password_hash: str
    family_name: str = "My Family"
    parent_pin: str = "1234"
    curriculum: str = "caps"  # Default curriculum
    referral_code: str = Field(default_factory=lambda: ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=8)))
    referred_by: Optional[str] = None  # Referral code used during signup
    avatar_id: str = "fox"
    avatar_emoji: str = "🦊"
    avatar_color: str = "#FF6B35"
    email_notifications: bool = True
    is_premium: bool = False
    premium_expires: Optional[str] = None
    ai_questions_today: int = 0
    ai_questions_date: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FamilyRegister(BaseModel):
    email: str
    password: str
    family_name: str
    curriculum: str = "caps"
    referral_code: Optional[str] = None  # Optional referral code
    avatar_id: Optional[str] = "fox"
    avatar_emoji: Optional[str] = "🦊"
    avatar_color: Optional[str] = "#FF6B35"
    email_notifications: Optional[bool] = True

class FamilyLogin(BaseModel):
    email: str
    password: str

class FamilyResponse(BaseModel):
    id: str
    email: str
    family_name: str
    curriculum: str = "caps"
    avatar_id: str = "fox"
    avatar_emoji: str = "🦊"
    avatar_color: str = "#FF6B35"
    is_premium: bool
    is_admin: bool = False
    premium_expires: Optional[str] = None
    kids_count: int = 0
    referral_code: Optional[str] = None

class KidLoginResponse(BaseModel):
    """Response for kid login - limited access"""
    id: str
    kid_id: str
    name: str
    email: str
    grade: int
    points: int
    avatar_color: str
    family_id: str
    user_type: str = "kid"  # Always "kid" for this response

class LoginResponse(BaseModel):
    """Unified login response"""
    user_type: str  # "parent" or "kid"
    family: Optional[FamilyResponse] = None
    kid: Optional[KidLoginResponse] = None

class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    family_id: str
    session_id: str
    amount: float
    currency: str
    payment_status: str = "pending"
    metadata: Dict[str, str] = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubscriptionStatus(BaseModel):
    is_premium: bool
    expires: Optional[str] = None
    can_add_child: bool
    ai_questions_remaining: int
    max_children: int

# Free tier limits
FREE_AI_QUESTIONS_PER_DAY = 5
FREE_MAX_CHILDREN = 1

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "main_settings"
    parent_pin: str = "1234"
    family_name: str = "My Family"

class SettingsUpdate(BaseModel):
    parent_pin: Optional[str] = None
    family_name: Optional[str] = None

class PinVerify(BaseModel):
    pin: str
    mode: str  # parent or student
    family_id: Optional[str] = None

class PinVerifyResponse(BaseModel):
    valid: bool
    mode: str
    kid_id: Optional[str] = None
    kid_name: Optional[str] = None
    family_id: Optional[str] = None

# ============ NEW USER SYSTEM MODELS (Username-based) ============

class User(BaseModel):
    """Universal user model - works for both kids and adults"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str  # Required, unique
    password_hash: str
    email: Optional[str] = None  # Optional, for password recovery
    display_name: str  # Shown to others
    birthdate: str  # YYYY-MM-DD format
    avatar_emoji: str = "😊"
    avatar_color: str = "#4F46E5"
    points: int = 0
    grade: Optional[int] = None  # For students
    is_parent: bool = False  # Calculated from age
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # QR code for invites
    qr_invite_code: str = Field(default_factory=lambda: ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=12)))

class UserRegister(BaseModel):
    username: str
    password: str
    display_name: str
    birthdate: str  # YYYY-MM-DD
    email: Optional[str] = None  # Optional
    grade: Optional[int] = None
    avatar_emoji: Optional[str] = "😊"
    avatar_color: Optional[str] = "#4F46E5"

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    display_name: str
    email: Optional[str] = None
    birthdate: str
    age: int
    is_child: bool  # Under 13
    avatar_emoji: str
    avatar_color: str
    points: int
    grade: Optional[int] = None
    qr_invite_code: str
    groups: List[str] = []  # Group IDs user belongs to

class Group(BaseModel):
    """Family or Friend group"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    owner_id: str  # User who created the group
    members: List[str] = []  # User IDs
    group_type: str = "family"  # "family" or "friends"
    qr_invite_code: str = Field(default_factory=lambda: ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=10)))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    group_type: str = "family"  # "family" or "friends"

class GroupInvite(BaseModel):
    """Pending invite to join a group"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    group_id: str
    group_name: str
    from_user_id: str
    from_username: str
    to_user_id: str
    to_username: str
    status: str = "pending"  # pending, accepted, rejected
    requires_qr: bool = False  # True if cross-age-group invite
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class GroupInviteCreate(BaseModel):
    group_id: str
    to_username: str  # Username to invite

def calculate_age(birthdate: str) -> int:
    """Calculate age from birthdate string (YYYY-MM-DD)"""
    try:
        birth = datetime.strptime(birthdate, "%Y-%m-%d")
        today = datetime.now()
        age = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
        return age
    except:
        return 0

def is_child(birthdate: str) -> bool:
    """Check if user is under 13 (child)"""
    return calculate_age(birthdate) < 13

def is_same_age_group(birthdate1: str, birthdate2: str) -> bool:
    """Check if two users are in the same age group (both kids or both 13+)"""
    return is_child(birthdate1) == is_child(birthdate2)

# ============ HELPER FUNCTIONS ============

def serialize_datetime(obj):
    """Convert datetime to ISO string for MongoDB storage"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj

def serialize_doc(doc):
    """Serialize a document for MongoDB storage"""
    result = {}
    for key, value in doc.items():
        result[key] = serialize_datetime(value)
    return result

def hash_password(password: str) -> str:
    """Simple password hashing"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    """Verify password against hash"""
    return hash_password(password) == hashed

async def get_family_subscription_status(family_id: str) -> SubscriptionStatus:
    """Get subscription status for a family"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        return SubscriptionStatus(
            is_premium=False, can_add_child=True, 
            ai_questions_remaining=FREE_AI_QUESTIONS_PER_DAY, max_children=FREE_MAX_CHILDREN
        )
    
    # Check if admin email - admins get free premium forever
    if is_admin_email(family.get("email", "")):
        return SubscriptionStatus(
            is_premium=True,
            expires=None,  # Never expires for admins
            can_add_child=True,
            ai_questions_remaining=999,  # Unlimited
            max_children=99
        )
    
    is_premium = family.get("is_premium", False)
    expires = family.get("premium_expires")
    
    # Check if premium expired
    if is_premium and expires:
        expire_date = datetime.fromisoformat(expires.replace('Z', '+00:00'))
        if expire_date < datetime.now(timezone.utc):
            is_premium = False
            await db.families.update_one({"id": family_id}, {"$set": {"is_premium": False}})
    
    # Count kids
    kids_count = await db.kids.count_documents({"family_id": family_id})
    
    # AI questions remaining
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ai_date = family.get("ai_questions_date")
    ai_used = family.get("ai_questions_today", 0) if ai_date == today else 0
    
    if is_premium:
        return SubscriptionStatus(
            is_premium=True,
            expires=expires,
            can_add_child=True,
            ai_questions_remaining=999,  # Unlimited
            max_children=99
        )
    else:
        return SubscriptionStatus(
            is_premium=False,
            expires=None,
            can_add_child=kids_count < FREE_MAX_CHILDREN,
            ai_questions_remaining=max(0, FREE_AI_QUESTIONS_PER_DAY - ai_used),
            max_children=FREE_MAX_CHILDREN
        )

async def increment_ai_usage(family_id: str) -> bool:
    """Increment AI question usage. Returns False if limit reached."""
    status = await get_family_subscription_status(family_id)
    if status.is_premium:
        return True
    
    if status.ai_questions_remaining <= 0:
        return False
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    
    if family:
        ai_date = family.get("ai_questions_date")
        if ai_date != today:
            # New day, reset counter
            await db.families.update_one(
                {"id": family_id},
                {"$set": {"ai_questions_today": 1, "ai_questions_date": today}}
            )
        else:
            await db.families.update_one(
                {"id": family_id},
                {"$inc": {"ai_questions_today": 1}}
            )
    return True

# ============ USER REGISTRATION & AUTH ============

@api_router.post("/auth/register", response_model=FamilyResponse)
async def register_family(data: FamilyRegister):
    """Register a new family account"""
    # Check if email exists
    existing = await db.families.find_one({"email": data.email.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Check if admin email
    admin = is_admin_email(data.email)
    
    # Check if referral code is valid
    referred_by = None
    referrer_family = None
    if data.referral_code:
        referrer_family = await db.families.find_one({"referral_code": data.referral_code.upper()}, {"_id": 0})
        if referrer_family:
            referred_by = data.referral_code.upper()
    
    family = Family(
        email=data.email.lower(),
        password_hash=hash_password(data.password),
        family_name=data.family_name,
        curriculum=data.curriculum,
        referred_by=referred_by,
        avatar_id=data.avatar_id or "fox",
        avatar_emoji=data.avatar_emoji or "🦊",
        avatar_color=data.avatar_color or "#FF6B35",
        email_notifications=data.email_notifications if data.email_notifications is not None else True,
        is_premium=admin  # Admins get premium automatically
    )
    
    await db.families.insert_one(serialize_doc(family.model_dump()))
    
    # If valid referral, give both families 1 month free premium
    if referrer_family and not admin:
        # Give new user 1 month premium
        premium_expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.families.update_one(
            {"id": family.id},
            {"$set": {"is_premium": True, "premium_expires": premium_expires}}
        )
        
        # Give referrer 1 month premium (extend if already premium)
        referrer_expires = referrer_family.get("premium_expires")
        if referrer_expires:
            try:
                current_expiry = datetime.fromisoformat(referrer_expires.replace('Z', '+00:00'))
                if current_expiry > datetime.now(timezone.utc):
                    new_expiry = current_expiry + timedelta(days=30)
                else:
                    new_expiry = datetime.now(timezone.utc) + timedelta(days=30)
            except:
                new_expiry = datetime.now(timezone.utc) + timedelta(days=30)
        else:
            new_expiry = datetime.now(timezone.utc) + timedelta(days=30)
        
        await db.families.update_one(
            {"id": referrer_family["id"]},
            {"$set": {"is_premium": True, "premium_expires": new_expiry.isoformat()}}
        )
        
        # Record the referral
        await db.referrals.insert_one({
            "id": str(uuid.uuid4()),
            "referrer_family_id": referrer_family["id"],
            "referral_code": referred_by,
            "referred_email": data.email.lower(),
            "referred_family_id": family.id,
            "status": "rewarded",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    
    return FamilyResponse(
        id=family.id,
        email=family.email,
        family_name=family.family_name,
        curriculum=family.curriculum,
        avatar_id=family.avatar_id,
        avatar_emoji=family.avatar_emoji,
        avatar_color=family.avatar_color,
        is_premium=admin or (referred_by is not None),
        is_admin=admin,
        kids_count=0,
        referral_code=family.referral_code
    )

@api_router.post("/auth/login")
async def login_user(data: FamilyLogin):
    """Login for both parents and kids"""
    email_lower = data.email.lower()
    
    # First check if it's a kid's email
    kid = await db.kids.find_one({"email": email_lower}, {"_id": 0})
    if kid and kid.get("password_hash"):
        if verify_password(data.password, kid.get("password_hash", "")):
            # Kid login successful
            return {
                "user_type": "kid",
                "kid": {
                    "id": kid["id"],
                    "kid_id": kid["id"],
                    "name": kid["name"],
                    "email": kid.get("email", ""),
                    "grade": kid["grade"],
                    "points": kid.get("points", 0),
                    "avatar_color": kid.get("avatar_color", "#4F46E5"),
                    "family_id": kid.get("family_id", ""),
                    "user_type": "kid"
                }
            }
    
    # Check parent/family login
    family = await db.families.find_one({"email": email_lower}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(data.password, family.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if admin email
    admin = is_admin_email(family.get("email", ""))
    
    # Count kids
    kids_count = await db.kids.count_documents({"family_id": family["id"]})
    
    return {
        "user_type": "parent",
        "family": {
            "id": family["id"],
            "email": family["email"],
            "family_name": family.get("family_name", "My Family"),
            "curriculum": family.get("curriculum", "caps"),
            "avatar_id": family.get("avatar_id", "fox"),
            "avatar_emoji": family.get("avatar_emoji", "🦊"),
            "avatar_color": family.get("avatar_color", "#FF6B35"),
            "is_premium": admin or family.get("is_premium", False),
            "is_admin": admin,
            "premium_expires": None if admin else family.get("premium_expires"),
            "kids_count": kids_count,
            "referral_code": family.get("referral_code")
        }
    }

@api_router.get("/auth/family/{family_id}", response_model=FamilyResponse)
async def get_family(family_id: str):
    """Get family info"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Check if admin email
    admin = is_admin_email(family.get("email", ""))
    
    kids_count = await db.kids.count_documents({"family_id": family_id})
    
    return FamilyResponse(
        id=family["id"],
        email=family["email"],
        family_name=family.get("family_name", "My Family"),
        curriculum=family.get("curriculum", "caps"),
        is_premium=admin or family.get("is_premium", False),
        is_admin=admin,
        premium_expires=None if admin else family.get("premium_expires"),
        kids_count=kids_count
    )

@api_router.get("/subscription/status/{family_id}", response_model=SubscriptionStatus)
async def get_subscription_status(family_id: str):
    """Get subscription status for a family"""
    return await get_family_subscription_status(family_id)

# ============ NEW USER SYSTEM (Username-based) ============

@api_router.post("/users/register")
async def register_user(data: UserRegister):
    """Register a new user with username + password (no email required)"""
    username_lower = data.username.lower().strip()
    
    # Check if username exists
    existing = await db.users.find_one({"username": username_lower}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Check username format (alphanumeric, underscores, 3-20 chars)
    import re
    if not re.match(r'^[a-zA-Z0-9_]{3,20}$', data.username):
        raise HTTPException(status_code=400, detail="Username must be 3-20 characters, letters, numbers, and underscores only")
    
    # Validate birthdate
    try:
        birth = datetime.strptime(data.birthdate, "%Y-%m-%d")
        if birth > datetime.now():
            raise HTTPException(status_code=400, detail="Invalid birthdate")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid birthdate format (use YYYY-MM-DD)")
    
    age = calculate_age(data.birthdate)
    user_is_child = age < 13
    
    user = User(
        username=username_lower,
        password_hash=hash_password(data.password),
        email=data.email.lower().strip() if data.email else None,
        display_name=data.display_name,
        birthdate=data.birthdate,
        grade=data.grade,
        avatar_emoji=data.avatar_emoji or "😊",
        avatar_color=data.avatar_color or "#4F46E5",
        is_parent=not user_is_child
    )
    
    await db.users.insert_one(serialize_doc(user.model_dump()))
    
    # Get groups user belongs to
    groups = await db.groups.find({"members": user.id}, {"_id": 0}).to_list(50)
    group_ids = [g["id"] for g in groups]
    
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "email": user.email,
        "birthdate": user.birthdate,
        "age": age,
        "is_child": user_is_child,
        "avatar_emoji": user.avatar_emoji,
        "avatar_color": user.avatar_color,
        "points": user.points,
        "grade": user.grade,
        "qr_invite_code": user.qr_invite_code,
        "groups": group_ids
    }

@api_router.post("/users/login")
async def login_user_new(data: UserLogin):
    """Login with username + password"""
    username_lower = data.username.lower().strip()
    
    user = await db.users.find_one({"username": username_lower}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    age = calculate_age(user.get("birthdate", "2000-01-01"))
    user_is_child = age < 13
    
    # Get groups user belongs to
    groups = await db.groups.find({"members": user["id"]}, {"_id": 0}).to_list(50)
    group_ids = [g["id"] for g in groups]
    
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user.get("display_name", user["username"]),
        "email": user.get("email"),
        "birthdate": user.get("birthdate"),
        "age": age,
        "is_child": user_is_child,
        "avatar_emoji": user.get("avatar_emoji", "😊"),
        "avatar_color": user.get("avatar_color", "#4F46E5"),
        "points": user.get("points", 0),
        "grade": user.get("grade"),
        "qr_invite_code": user.get("qr_invite_code"),
        "groups": group_ids
    }

@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user info"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    age = calculate_age(user.get("birthdate", "2000-01-01"))
    groups = await db.groups.find({"members": user_id}, {"_id": 0}).to_list(50)
    
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user.get("display_name", user["username"]),
        "email": user.get("email"),
        "birthdate": user.get("birthdate"),
        "age": age,
        "is_child": age < 13,
        "avatar_emoji": user.get("avatar_emoji", "😊"),
        "avatar_color": user.get("avatar_color", "#4F46E5"),
        "points": user.get("points", 0),
        "grade": user.get("grade"),
        "qr_invite_code": user.get("qr_invite_code"),
        "groups": [g["id"] for g in groups]
    }

@api_router.get("/users/check-username/{username}")
async def check_username(username: str):
    """Check if username is available"""
    existing = await db.users.find_one({"username": username.lower().strip()}, {"_id": 0})
    return {"available": existing is None, "username": username.lower().strip()}

# ============ GROUPS (Family/Friends) ============

@api_router.post("/groups")
async def create_group(data: GroupCreate, user_id: str):
    """Create a new group (family or friends)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    group = Group(
        name=data.name,
        description=data.description or "",
        owner_id=user_id,
        members=[user_id],  # Creator is first member
        group_type=data.group_type
    )
    
    await db.groups.insert_one(serialize_doc(group.model_dump()))
    
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "owner_id": group.owner_id,
        "members": group.members,
        "group_type": group.group_type,
        "qr_invite_code": group.qr_invite_code
    }

@api_router.get("/groups")
async def get_user_groups(user_id: str):
    """Get all groups a user belongs to"""
    groups = await db.groups.find({"members": user_id}, {"_id": 0}).to_list(50)
    
    result = []
    for g in groups:
        # Get member details
        members = await db.users.find({"id": {"$in": g.get("members", [])}}, {"_id": 0, "id": 1, "display_name": 1, "avatar_emoji": 1, "points": 1}).to_list(50)
        result.append({
            "id": g["id"],
            "name": g["name"],
            "description": g.get("description", ""),
            "owner_id": g["owner_id"],
            "members": members,
            "group_type": g.get("group_type", "family"),
            "qr_invite_code": g.get("qr_invite_code"),
            "is_owner": g["owner_id"] == user_id
        })
    
    return result

@api_router.get("/groups/{group_id}")
async def get_group(group_id: str):
    """Get group details"""
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    members = await db.users.find({"id": {"$in": group.get("members", [])}}, {"_id": 0, "id": 1, "display_name": 1, "avatar_emoji": 1, "avatar_color": 1, "points": 1, "grade": 1}).to_list(50)
    
    return {
        "id": group["id"],
        "name": group["name"],
        "description": group.get("description", ""),
        "owner_id": group["owner_id"],
        "members": members,
        "group_type": group.get("group_type", "family"),
        "qr_invite_code": group.get("qr_invite_code")
    }

# ============ GROUP INVITES ============

@api_router.post("/groups/invite")
async def invite_to_group(data: GroupInviteCreate, from_user_id: str):
    """Invite a user to a group by username"""
    # Get the inviter
    from_user = await db.users.find_one({"id": from_user_id}, {"_id": 0})
    if not from_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get the group
    group = await db.groups.find_one({"id": data.group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if inviter is a member
    if from_user_id not in group.get("members", []):
        raise HTTPException(status_code=403, detail="You must be a member to invite others")
    
    # Get the user to invite
    to_user = await db.users.find_one({"username": data.to_username.lower().strip()}, {"_id": 0})
    if not to_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already a member
    if to_user["id"] in group.get("members", []):
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Check age groups - if different age groups, require QR code
    from_is_child = is_child(from_user.get("birthdate", "2000-01-01"))
    to_is_child = is_child(to_user.get("birthdate", "2000-01-01"))
    requires_qr = from_is_child != to_is_child
    
    # If inviter is a child, they can ONLY use QR codes
    if from_is_child:
        raise HTTPException(status_code=403, detail="Users under 13 can only invite by scanning QR codes in person")
    
    # If target is a child, require QR code
    if to_is_child:
        raise HTTPException(status_code=403, detail="To invite users under 13, they must scan your group QR code in person")
    
    # Check for existing pending invite
    existing = await db.group_invites.find_one({
        "group_id": data.group_id,
        "to_user_id": to_user["id"],
        "status": "pending"
    }, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Invite already pending")
    
    invite = GroupInvite(
        group_id=data.group_id,
        group_name=group["name"],
        from_user_id=from_user_id,
        from_username=from_user["username"],
        to_user_id=to_user["id"],
        to_username=to_user["username"],
        requires_qr=requires_qr
    )
    
    await db.group_invites.insert_one(serialize_doc(invite.model_dump()))
    
    return {"message": "Invite sent", "invite_id": invite.id, "requires_qr": requires_qr}

@api_router.get("/groups/invites/pending")
async def get_pending_invites(user_id: str):
    """Get pending invites for a user"""
    invites = await db.group_invites.find({
        "to_user_id": user_id,
        "status": "pending"
    }, {"_id": 0}).to_list(50)
    
    return invites

@api_router.post("/groups/invites/{invite_id}/accept")
async def accept_invite(invite_id: str, user_id: str):
    """Accept a group invite"""
    invite = await db.group_invites.find_one({"id": invite_id, "to_user_id": user_id}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    
    if invite["status"] != "pending":
        raise HTTPException(status_code=400, detail="Invite already processed")
    
    # Add user to group
    await db.groups.update_one(
        {"id": invite["group_id"]},
        {"$addToSet": {"members": user_id}}
    )
    
    # Update invite status
    await db.group_invites.update_one(
        {"id": invite_id},
        {"$set": {"status": "accepted"}}
    )
    
    return {"message": "Joined group successfully"}

@api_router.post("/groups/invites/{invite_id}/reject")
async def reject_invite(invite_id: str, user_id: str):
    """Reject a group invite"""
    invite = await db.group_invites.find_one({"id": invite_id, "to_user_id": user_id}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    
    await db.group_invites.update_one(
        {"id": invite_id},
        {"$set": {"status": "rejected"}}
    )
    
    return {"message": "Invite rejected"}

# ============ QR CODE JOIN (for kids and cross-age invites) ============

@api_router.post("/groups/join-qr")
async def join_group_by_qr(qr_code: str, user_id: str):
    """Join a group by scanning QR code (required for kids and cross-age invites)"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Find group by QR code
    group = await db.groups.find_one({"qr_invite_code": qr_code.upper().strip()}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Invalid QR code")
    
    # Check if already a member
    if user_id in group.get("members", []):
        raise HTTPException(status_code=400, detail="Already a member of this group")
    
    # Add user to group
    await db.groups.update_one(
        {"id": group["id"]},
        {"$addToSet": {"members": user_id}}
    )
    
    return {
        "message": "Joined group successfully",
        "group_id": group["id"],
        "group_name": group["name"]
    }

@api_router.get("/groups/{group_id}/qr-code")
async def get_group_qr_code(group_id: str, user_id: str):
    """Get QR code for a group (only members can get it)"""
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if user_id not in group.get("members", []):
        raise HTTPException(status_code=403, detail="Not a member of this group")
    
    # Return the QR code string (frontend will generate the visual QR)
    return {
        "qr_code": group.get("qr_invite_code"),
        "group_name": group["name"],
        "group_id": group["id"]
    }

@api_router.post("/groups/{group_id}/regenerate-qr")
async def regenerate_group_qr(group_id: str, user_id: str):
    """Regenerate QR code for a group (owner only)"""
    group = await db.groups.find_one({"id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if group["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the group owner can regenerate the QR code")
    
    new_qr = ''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=10))
    
    await db.groups.update_one(
        {"id": group_id},
        {"$set": {"qr_invite_code": new_qr}}
    )
    
    return {"qr_code": new_qr, "message": "QR code regenerated"}

# ============ STRIPE PAYMENT ROUTES ============

@api_router.post("/subscription/checkout")
async def create_checkout_session(request: Request, family_id: str, origin_url: str):
    """Create a Stripe checkout session for premium subscription"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    success_url = f"{origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin_url}/payment/cancel"
    
    checkout_request = CheckoutSessionRequest(
        amount=SUBSCRIPTION_PRICE,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "family_id": family_id,
            "type": "premium_subscription"
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction = PaymentTransaction(
        family_id=family_id,
        session_id=session.session_id,
        amount=SUBSCRIPTION_PRICE,
        currency="usd",
        payment_status="pending",
        metadata={"type": "premium_subscription"}
    )
    await db.payment_transactions.insert_one(serialize_doc(transaction.model_dump()))
    
    return {"checkout_url": session.url, "session_id": session.session_id}

@api_router.get("/subscription/status/check/{session_id}")
async def check_payment_status(session_id: str, request: Request):
    """Check payment status and activate subscription if paid"""
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        status = await stripe_checkout.get_checkout_status(session_id)
        
        # Find the transaction
        transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
        if not transaction:
            raise HTTPException(status_code=404, detail="Transaction not found")
        
        # Update transaction status
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": status.payment_status}}
        )
        
        # If paid, activate premium
        if status.payment_status == "paid" and transaction.get("payment_status") != "paid":
            family_id = transaction.get("family_id") or status.metadata.get("family_id")
            if family_id:
                # Set premium for 30 days
                expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                await db.families.update_one(
                    {"id": family_id},
                    {"$set": {"is_premium": True, "premium_expires": expires}}
                )
        
        return {
            "status": status.status,
            "payment_status": status.payment_status,
            "amount": status.amount_total,
            "currency": status.currency
        }
    except Exception as e:
        logging.error(f"Payment status check error: {e}")
        raise HTTPException(status_code=500, detail="Failed to check payment status")

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    host_url = str(request.base_url).rstrip('/')
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        event = await stripe_checkout.handle_webhook(body, signature)
        
        if event.payment_status == "paid":
            family_id = event.metadata.get("family_id")
            if family_id:
                expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
                await db.families.update_one(
                    {"id": family_id},
                    {"$set": {"is_premium": True, "premium_expires": expires}}
                )
                
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"payment_status": "paid"}}
                )
        
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

# ============ LEGACY AUTH (PIN-based for existing users) ============

@api_router.post("/auth/verify-pin", response_model=PinVerifyResponse)
async def verify_pin(data: PinVerify):
    """Verify PIN for parent or student mode"""
    # If family_id provided, use family-specific auth
    if data.family_id:
        family = await db.families.find_one({"id": data.family_id}, {"_id": 0})
        if data.mode == "parent":
            if family and family.get("parent_pin") == data.pin:
                return PinVerifyResponse(valid=True, mode="parent", family_id=data.family_id)
            return PinVerifyResponse(valid=False, mode="parent")
        elif data.mode == "student":
            kid = await db.kids.find_one({"pin": data.pin, "family_id": data.family_id}, {"_id": 0})
            if kid:
                return PinVerifyResponse(
                    valid=True, mode="student", 
                    kid_id=kid["id"], kid_name=kid["name"], family_id=data.family_id
                )
            return PinVerifyResponse(valid=False, mode="student")
    
    # Legacy: no family_id (for backwards compatibility)
    if data.mode == "parent":
        settings = await db.settings.find_one({"id": "main_settings"}, {"_id": 0})
        if not settings:
            default_settings = Settings()
            await db.settings.insert_one(serialize_doc(default_settings.model_dump()))
            settings = default_settings.model_dump()
        
        if settings.get("parent_pin") == data.pin:
            return PinVerifyResponse(valid=True, mode="parent")
        return PinVerifyResponse(valid=False, mode="parent")
    
    elif data.mode == "student":
        kid = await db.kids.find_one({"pin": data.pin}, {"_id": 0})
        if kid:
            return PinVerifyResponse(
                valid=True, 
                mode="student", 
                kid_id=kid["id"],
                kid_name=kid["name"]
            )
        return PinVerifyResponse(valid=False, mode="student")
    
    return PinVerifyResponse(valid=False, mode=data.mode)

# ============ KIDS ROUTES ============

@api_router.get("/kids")
async def get_kids(family_id: Optional[str] = None):
    """Get all kids, including shared kids"""
    if family_id:
        # Get kids owned by this family OR shared with this family
        kids = await db.kids.find({
            "$or": [
                {"family_id": family_id},
                {"shared_with": family_id}
            ]
        }, {"_id": 0}).to_list(100)
        
        # Mark which kids are shared (not owned)
        for kid in kids:
            kid["is_shared"] = kid.get("family_id") != family_id
    else:
        kids = await db.kids.find({}, {"_id": 0}).to_list(100)
    return kids

@api_router.get("/kids/{kid_id}")
async def get_kid(kid_id: str):
    """Get a specific kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    return kid

@api_router.post("/kids", response_model=Kid)
async def create_kid(data: KidCreate):
    """Create a new kid"""
    # Check subscription limits if family_id provided
    if data.family_id:
        status = await get_family_subscription_status(data.family_id)
        if not status.can_add_child:
            raise HTTPException(
                status_code=403, 
                detail=f"Free plan allows only {status.max_children} child. Upgrade to Premium for unlimited children!"
            )
    
    # Check if email already exists (for kid or parent)
    if data.email:
        existing_kid = await db.kids.find_one({"email": data.email.lower()}, {"_id": 0})
        existing_family = await db.families.find_one({"email": data.email.lower()}, {"_id": 0})
        if existing_kid or existing_family:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create kid data
    kid_data = data.model_dump()
    
    # Hash password if provided
    if kid_data.get("password"):
        kid_data["password_hash"] = hash_password(kid_data.pop("password"))
    else:
        kid_data.pop("password", None)
    
    # Lowercase email
    if kid_data.get("email"):
        kid_data["email"] = kid_data["email"].lower()
    
    kid = Kid(**kid_data)
    await db.kids.insert_one(serialize_doc(kid.model_dump()))
    return kid

@api_router.put("/kids/{kid_id}", response_model=Kid)
async def update_kid(kid_id: str, data: KidUpdate):
    """Update a kid"""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    # Handle password update
    if "password" in update_data:
        update_data["password_hash"] = hash_password(update_data.pop("password"))
    
    # Handle email update - check uniqueness
    if "email" in update_data:
        email_lower = update_data["email"].lower()
        existing_kid = await db.kids.find_one({"email": email_lower, "id": {"$ne": kid_id}}, {"_id": 0})
        existing_family = await db.families.find_one({"email": email_lower}, {"_id": 0})
        if existing_kid or existing_family:
            raise HTTPException(status_code=400, detail="Email already registered")
        update_data["email"] = email_lower
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    await db.kids.update_one({"id": kid_id}, {"$set": update_data})
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    return kid

@api_router.delete("/kids/{kid_id}")
async def delete_kid(kid_id: str):
    """Delete a kid"""
    result = await db.kids.delete_one({"id": kid_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Kid not found")
    return {"message": "Kid deleted"}

# ============ KID SHARING ROUTES ============

@api_router.post("/share/request")
async def create_share_request(data: ShareRequestCreate, family_id: str):
    """Create a request to share a kid with another account"""
    # Check if the target email exists as a family account
    target_family = await db.families.find_one({"email": data.to_email.lower()}, {"_id": 0})
    
    if not target_family:
        raise HTTPException(status_code=404, detail="No account found with that email. They need to register first.")
    
    if target_family["id"] == family_id:
        raise HTTPException(status_code=400, detail="You can't share with yourself")
    
    # Check if there's already a pending request
    existing = await db.share_requests.find_one({
        "from_family_id": family_id,
        "to_family_id": target_family["id"],
        "kid_name": data.kid_name,
        "status": "pending"
    }, {"_id": 0})
    
    if existing:
        raise HTTPException(status_code=400, detail="A share request is already pending for this account")
    
    # Create share request
    share_request = ShareRequest(
        from_family_id=family_id,
        to_family_id=target_family["id"],
        to_email=data.to_email.lower(),
        kid_name=data.kid_name,
        kid_email=data.kid_email
    )
    
    # Store additional kid data in the request
    request_data = share_request.model_dump()
    request_data["kid_grade"] = data.kid_grade
    request_data["kid_pin"] = data.kid_pin
    request_data["kid_password"] = data.kid_password
    request_data["avatar_color"] = data.avatar_color
    
    await db.share_requests.insert_one(serialize_doc(request_data))
    
    return {"message": f"Share request sent to {data.to_email}", "request_id": share_request.id}

@api_router.get("/share/requests/pending")
async def get_pending_requests(family_id: str):
    """Get pending share requests for a family (requests TO this family)"""
    requests = await db.share_requests.find(
        {"to_family_id": family_id, "status": "pending"},
        {"_id": 0}
    ).to_list(100)
    
    # Get requester info for each request
    for req in requests:
        from_family = await db.families.find_one({"id": req["from_family_id"]}, {"_id": 0})
        if from_family:
            req["from_family_name"] = from_family.get("family_name", "Unknown")
            req["from_email"] = from_family.get("email", "")
    
    return requests

@api_router.get("/share/requests/sent")
async def get_sent_requests(family_id: str):
    """Get share requests sent by this family"""
    requests = await db.share_requests.find(
        {"from_family_id": family_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return requests

@api_router.post("/share/requests/{request_id}/approve")
async def approve_share_request(request_id: str, family_id: str):
    """Approve a share request and create the shared kid"""
    request = await db.share_requests.find_one({"id": request_id}, {"_id": 0})
    
    if not request:
        raise HTTPException(status_code=404, detail="Share request not found")
    
    if request["to_family_id"] != family_id:
        raise HTTPException(status_code=403, detail="You can only approve requests sent to you")
    
    if request["status"] != "pending":
        raise HTTPException(status_code=400, detail="This request has already been processed")
    
    # Check if kid email already exists
    if request.get("kid_email"):
        existing_kid = await db.kids.find_one({"email": request["kid_email"].lower()}, {"_id": 0})
        existing_family = await db.families.find_one({"email": request["kid_email"].lower()}, {"_id": 0})
        if existing_kid or existing_family:
            raise HTTPException(status_code=400, detail="Kid email already registered")
    
    # Create the kid with both families having access
    kid_data = {
        "id": str(uuid.uuid4()),
        "family_id": request["from_family_id"],  # Primary owner
        "shared_with": [request["to_family_id"]],  # Shared with approver
        "name": request["kid_name"],
        "grade": request.get("kid_grade", 5),
        "pin": request.get("kid_pin", "1234"),
        "points": 0,
        "avatar_color": request.get("avatar_color", "#4F46E5"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Add email/password if provided
    if request.get("kid_email"):
        kid_data["email"] = request["kid_email"].lower()
    if request.get("kid_password"):
        kid_data["password_hash"] = hash_password(request["kid_password"])
    
    await db.kids.insert_one(serialize_doc(kid_data))
    
    # Update request status
    await db.share_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "approved"}}
    )
    
    return {"message": f"Approved! {request['kid_name']} is now shared between both accounts.", "kid_id": kid_data["id"]}

@api_router.post("/share/requests/{request_id}/reject")
async def reject_share_request(request_id: str, family_id: str):
    """Reject a share request"""
    request = await db.share_requests.find_one({"id": request_id}, {"_id": 0})
    
    if not request:
        raise HTTPException(status_code=404, detail="Share request not found")
    
    if request["to_family_id"] != family_id:
        raise HTTPException(status_code=403, detail="You can only reject requests sent to you")
    
    await db.share_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "rejected"}}
    )
    
    return {"message": "Share request rejected"}

# ============ TASKS ROUTES ============

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(kid_id: Optional[str] = None, status: Optional[str] = None):
    """Get all tasks, optionally filtered by kid_id or status"""
    query = {}
    if kid_id:
        query["kid_id"] = kid_id
    if status:
        query["status"] = status
    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return tasks

@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str):
    """Get a specific task"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@api_router.post("/tasks", response_model=Task)
async def create_task(data: TaskCreate):
    """Create a new task (student submits homework)"""
    # Verify kid exists
    kid = await db.kids.find_one({"id": data.kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    task = Task(**data.model_dump())
    await db.tasks.insert_one(serialize_doc(task.model_dump()))
    return task

@api_router.put("/tasks/{task_id}/approve")
async def approve_task(task_id: str, data: TaskApproval):
    """Approve or reject a task (parent action)"""
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = {
        "status": data.status,
        "points_awarded": data.points_awarded if data.status == "approved" else 0,
        "rating": data.rating,
        "parent_feedback": data.parent_feedback,
        "approved_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tasks.update_one({"id": task_id}, {"$set": update_data})
    
    badge_earned = None
    
    # If approved, update kid's points and add to history
    if data.status == "approved" and data.points_awarded > 0:
        await db.kids.update_one(
            {"id": task["kid_id"]},
            {"$inc": {"points": data.points_awarded}}
        )
        
        # Add to points history
        history = PointsHistory(
            kid_id=task["kid_id"],
            amount=data.points_awarded,
            reason=f"Task approved: {task['title']}",
            task_id=task_id
        )
        await db.points_history.insert_one(serialize_doc(history.model_dump()))
        
        # Update streak
        await update_streak_simple(task["kid_id"])
    
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return {"task": updated_task, "badge_earned": badge_earned}

async def update_streak_simple(kid_id: str):
    """Simple streak update for task approval"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    streak = await db.streaks.find_one({"kid_id": kid_id}, {"_id": 0})
    
    if not streak:
        new_streak = {
            "id": str(uuid.uuid4()),
            "kid_id": kid_id,
            "current_streak": 1,
            "longest_streak": 1,
            "last_study_date": today
        }
        await db.streaks.insert_one(new_streak)
        return
    
    last_date = streak.get("last_study_date")
    
    if last_date == today:
        return
    
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    
    if last_date == yesterday:
        new_current = streak.get("current_streak", 0) + 1
        new_longest = max(new_current, streak.get("longest_streak", 0))
        
        await db.streaks.update_one(
            {"kid_id": kid_id},
            {"$set": {
                "current_streak": new_current,
                "longest_streak": new_longest,
                "last_study_date": today
            }}
        )
    else:
        await db.streaks.update_one(
            {"kid_id": kid_id},
            {"$set": {
                "current_streak": 1,
                "last_study_date": today
            }}
        )

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a task"""
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted"}

# ============ REWARDS ROUTES ============

@api_router.get("/rewards", response_model=List[Reward])
async def get_rewards():
    """Get all rewards"""
    rewards = await db.rewards.find({}, {"_id": 0}).to_list(100)
    return rewards

@api_router.get("/rewards/{reward_id}", response_model=Reward)
async def get_reward(reward_id: str):
    """Get a specific reward"""
    reward = await db.rewards.find_one({"id": reward_id}, {"_id": 0})
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    return reward

@api_router.post("/rewards", response_model=Reward)
async def create_reward(data: RewardCreate):
    """Create a new reward"""
    reward = Reward(**data.model_dump())
    await db.rewards.insert_one(serialize_doc(reward.model_dump()))
    return reward

@api_router.put("/rewards/{reward_id}", response_model=Reward)
async def update_reward(reward_id: str, data: RewardCreate):
    """Update a reward"""
    await db.rewards.update_one({"id": reward_id}, {"$set": data.model_dump()})
    reward = await db.rewards.find_one({"id": reward_id}, {"_id": 0})
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    return reward

@api_router.delete("/rewards/{reward_id}")
async def delete_reward(reward_id: str):
    """Delete a reward"""
    result = await db.rewards.delete_one({"id": reward_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Reward not found")
    return {"message": "Reward deleted"}

@api_router.post("/rewards/{reward_id}/redeem", response_model=RewardRedemption)
async def redeem_reward(reward_id: str, kid_id: str):
    """Redeem a reward (student action)"""
    reward = await db.rewards.find_one({"id": reward_id}, {"_id": 0})
    if not reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    if kid["points"] < reward["points_required"]:
        raise HTTPException(status_code=400, detail="Not enough points")
    
    if reward["quantity"] == 0:
        raise HTTPException(status_code=400, detail="Reward out of stock")
    
    # Deduct points
    await db.kids.update_one(
        {"id": kid_id},
        {"$inc": {"points": -reward["points_required"]}}
    )
    
    # Update reward quantity if not unlimited
    if reward["quantity"] > 0:
        await db.rewards.update_one(
            {"id": reward_id},
            {"$inc": {"quantity": -1}}
        )
    
    # Create redemption record
    redemption = RewardRedemption(
        kid_id=kid_id,
        reward_id=reward_id,
        reward_name=reward["name"],
        points_spent=reward["points_required"]
    )
    await db.redemptions.insert_one(serialize_doc(redemption.model_dump()))
    
    # Add to points history
    history = PointsHistory(
        kid_id=kid_id,
        amount=-reward["points_required"],
        reason=f"Redeemed: {reward['name']}",
        reward_id=reward_id
    )
    await db.points_history.insert_one(serialize_doc(history.model_dump()))
    
    return redemption

@api_router.get("/redemptions", response_model=List[RewardRedemption])
async def get_redemptions(kid_id: Optional[str] = None, status: Optional[str] = None):
    """Get all redemptions"""
    query = {}
    if kid_id:
        query["kid_id"] = kid_id
    if status:
        query["status"] = status
    redemptions = await db.redemptions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return redemptions

@api_router.put("/redemptions/{redemption_id}/status")
async def update_redemption_status(redemption_id: str, status: str):
    """Update redemption status (parent marks as given)"""
    await db.redemptions.update_one({"id": redemption_id}, {"$set": {"status": status}})
    return {"message": "Status updated"}

# ============ CHAT ROUTES ============

@api_router.post("/chat")
async def chat_with_ai(data: ChatRequest):
    """Chat with AI homework helper"""
    # Get kid info for context
    kid = await db.kids.find_one({"id": data.kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Get family info for curriculum
    family = None
    curriculum_name = "general education standards"
    curriculum_id = "other"
    if kid.get("family_id"):
        family = await db.families.find_one({"id": kid["family_id"]}, {"_id": 0})
        if family:
            curriculum_id = family.get("curriculum", "other")
    
    # Curriculum display names
    curriculum_names = {
        "caps": "South African CAPS curriculum",
        "common_core": "US Common Core standards",
        "uk_national": "UK National Curriculum",
        "australian": "Australian Curriculum",
        "cbse": "Indian CBSE curriculum",
        "cambridge": "Cambridge International curriculum",
        "ib": "International Baccalaureate (IB) programme",
        "canadian": "Canadian provincial standards",
        "german": "German educational standards",
        "french": "French national curriculum",
        "other": "general education standards"
    }
    curriculum_name = curriculum_names.get(curriculum_id, "general education standards")
    
    # Build system message based on kid's grade and curriculum
    grade_text = f"Grade {kid['grade']}"
    subject_text = f" about {data.subject}" if data.subject else ""
    
    system_message = f"""You are a friendly, encouraging homework helper for {kid['name']}, a {grade_text} student following the {curriculum_name}.

IMPORTANT RULES - YOU MUST FOLLOW THESE:
1. NEVER give direct answers to homework problems
2. NEVER solve problems completely for the student
3. ALWAYS guide them to figure it out themselves
4. Ask questions to help them think through problems
5. Teach methods and approaches, not solutions
6. If they're stuck, give hints - not answers
7. Celebrate their effort and progress!

Your teaching approach:
- Ask "What do you think the first step is?"
- Say "Let's break this down together..."
- Use "What happens if we try...?"
- Encourage with "You're on the right track!"
- For Maths: Teach the METHOD, let them do the calculation
- For language subjects: Help them understand grammar rules and vocabulary, don't do it for them
- For essays/writing: Ask guiding questions, don't write for them

Adapt your examples and context to be relevant to the student's curriculum ({curriculum_name}).

If they ask you to just give the answer, kindly explain that you're here to help them LEARN, and learning means figuring things out with guidance.

If they share a picture of homework, analyze it and help them understand what's being asked, then guide them through the thinking process.

Keep responses age-appropriate for {grade_text}. Be warm, patient, and encouraging.
Current subject focus{subject_text}."""

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"study-helper-{data.kid_id}-{datetime.now().strftime('%Y%m%d')}",
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=data.message)
        response = await chat.send_message(user_message)
        
        # Save user message
        user_chat = ChatMessage(
            kid_id=data.kid_id,
            role="user",
            content=data.message,
            subject=data.subject
        )
        await db.chat_history.insert_one(serialize_doc(user_chat.model_dump()))
        
        # Save assistant response
        assistant_chat = ChatMessage(
            kid_id=data.kid_id,
            role="assistant",
            content=response,
            subject=data.subject
        )
        await db.chat_history.insert_one(serialize_doc(assistant_chat.model_dump()))
        
        return {"response": response}
    except Exception as e:
        logging.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get AI response")

# ============ IMAGE UPLOAD ============

@api_router.post("/upload/image")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image and return a data URL"""
    try:
        contents = await file.read()
        base64_encoded = base64.b64encode(contents).decode('utf-8')
        
        # Determine mime type
        content_type = file.content_type or 'image/jpeg'
        data_url = f"data:{content_type};base64,{base64_encoded}"
        
        return {"image_url": data_url, "filename": file.filename}
    except Exception as e:
        logging.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image")

@api_router.get("/chat/history")
async def get_chat_history(kid_id: str, limit: int = 50):
    """Get chat history for a kid"""
    messages = await db.chat_history.find(
        {"kid_id": kid_id}, 
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return list(reversed(messages))

@api_router.delete("/chat/history/{kid_id}")
async def clear_chat_history(kid_id: str):
    """Clear chat history for a kid"""
    await db.chat_history.delete_many({"kid_id": kid_id})
    return {"message": "Chat history cleared"}

# ============ POINTS HISTORY ROUTES ============

@api_router.get("/points/history", response_model=List[PointsHistory])
async def get_points_history(kid_id: str):
    """Get points history for a kid"""
    history = await db.points_history.find(
        {"kid_id": kid_id}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    return history

# ============ SETTINGS ROUTES ============

@api_router.get("/settings", response_model=Settings)
async def get_settings():
    """Get app settings"""
    settings = await db.settings.find_one({"id": "main_settings"}, {"_id": 0})
    if not settings:
        default_settings = Settings()
        await db.settings.insert_one(serialize_doc(default_settings.model_dump()))
        return default_settings
    return settings

@api_router.put("/settings", response_model=Settings)
async def update_settings(data: SettingsUpdate):
    """Update app settings"""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    await db.settings.update_one(
        {"id": "main_settings"},
        {"$set": update_data},
        upsert=True
    )
    settings = await db.settings.find_one({"id": "main_settings"}, {"_id": 0})
    return settings

# ============ SUBJECTS ============

CAPS_SUBJECTS = {
    4: ["English", "Afrikaans", "Mathematics", "Life Skills", "Natural Sciences and Technology", "Social Sciences"],
    5: ["English", "Afrikaans", "Mathematics", "Life Skills", "Natural Sciences and Technology", "Social Sciences"],
    6: ["English", "Afrikaans", "Mathematics", "Life Skills", "Natural Sciences and Technology", "Social Sciences"],
    7: ["English", "Afrikaans", "Mathematics", "Life Orientation", "Natural Sciences", "Technology", "Social Sciences", "Economic and Management Sciences", "Creative Arts"],
    8: ["English", "Afrikaans", "Mathematics", "Life Orientation", "Natural Sciences", "Technology", "Social Sciences", "Economic and Management Sciences", "Creative Arts"],
    9: ["English", "Afrikaans", "Mathematics", "Life Orientation", "Natural Sciences", "Technology", "Social Sciences", "Economic and Management Sciences", "Creative Arts"]
}

@api_router.get("/subjects/{grade}")
async def get_subjects(grade: int):
    """Get CAPS subjects for a grade"""
    if grade in CAPS_SUBJECTS:
        return {"subjects": CAPS_SUBJECTS[grade]}
    return {"subjects": CAPS_SUBJECTS.get(7, [])}

# ============ DASHBOARD STATS ============

@api_router.get("/stats/kid/{kid_id}")
async def get_kid_stats(kid_id: str):
    """Get stats for a kid's dashboard"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Get task counts
    total_tasks = await db.tasks.count_documents({"kid_id": kid_id})
    approved_tasks = await db.tasks.count_documents({"kid_id": kid_id, "status": "approved"})
    pending_tasks = await db.tasks.count_documents({"kid_id": kid_id, "status": "pending"})
    
    # Get recent tasks
    recent_tasks = await db.tasks.find(
        {"kid_id": kid_id}, 
        {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(5)
    
    # Get pending redemptions
    pending_redemptions = await db.redemptions.count_documents({"kid_id": kid_id, "status": "pending"})
    
    return {
        "points": kid.get("points", 0),
        "total_tasks": total_tasks,
        "approved_tasks": approved_tasks,
        "pending_tasks": pending_tasks,
        "pending_redemptions": pending_redemptions,
        "recent_tasks": recent_tasks
    }

@api_router.get("/stats/parent")
async def get_parent_stats():
    """Get stats for parent dashboard"""
    # Get all kids
    kids = await db.kids.find({}, {"_id": 0}).to_list(100)
    
    # Get pending tasks
    pending_tasks = await db.tasks.find(
        {"status": "pending"}, 
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get pending redemptions
    pending_redemptions = await db.redemptions.find(
        {"status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    return {
        "kids": kids,
        "pending_tasks": pending_tasks,
        "pending_redemptions": pending_redemptions,
        "total_pending_tasks": len(pending_tasks),
        "total_pending_redemptions": len(pending_redemptions)
    }

# ============ BADGE DEFINITIONS ============

BADGE_TIERS = {
    1: {"name": "Bronze", "tasks_required": 5, "points_bonus": 10},
    2: {"name": "Silver", "tasks_required": 15, "points_bonus": 25},
    3: {"name": "Gold", "tasks_required": 30, "points_bonus": 50},
    4: {"name": "Master", "tasks_required": 50, "points_bonus": 100}  # + 10 booster packs worth
}

BADGE_TYPES = {
    "Mathematics": "maths_master",
    "English": "english_expert",
    "Afrikaans": "afrikaans_ace",
    "Natural Sciences": "science_star",
    "Social Sciences": "social_scholar",
    "Life Skills": "life_skills_legend",
    "Life Orientation": "life_skills_legend",
    "Technology": "tech_titan",
    "Creative Arts": "creative_champion",
    "Economic and Management Sciences": "business_brain"
}

# ============ STUDY TIMER ROUTES ============

@api_router.post("/study/session")
async def create_study_session(data: StudySessionCreate):
    """Record a completed study session"""
    kid = await db.kids.find_one({"id": data.kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Calculate points: 1 point per 5 minutes studied
    base_points = data.actual_minutes // 5
    
    # Bonus for meeting goal
    goal_bonus = 5 if data.actual_minutes >= data.goal_minutes else 0
    
    # Check streak bonus
    streak = await db.streaks.find_one({"kid_id": data.kid_id}, {"_id": 0})
    streak_bonus = 0
    if streak and streak.get("current_streak", 0) > 0:
        # Small streak bonus: 1 extra point per streak day (max 5)
        streak_bonus = min(streak.get("current_streak", 0), 5)
    
    total_points = base_points + goal_bonus + streak_bonus
    
    session = StudySession(
        kid_id=data.kid_id,
        subject=data.subject,
        goal_minutes=data.goal_minutes,
        actual_minutes=data.actual_minutes,
        points_earned=total_points,
        completed=data.actual_minutes >= data.goal_minutes
    )
    
    await db.study_sessions.insert_one(serialize_doc(session.model_dump()))
    
    # Update kid's points
    await db.kids.update_one(
        {"id": data.kid_id},
        {"$inc": {"points": total_points}}
    )
    
    # Add to points history
    history = PointsHistory(
        kid_id=data.kid_id,
        amount=total_points,
        reason=f"Study session: {data.actual_minutes}min {data.subject}"
    )
    await db.points_history.insert_one(serialize_doc(history.model_dump()))
    
    # Update streak
    await update_streak(data.kid_id)
    
    return {
        "session": session,
        "points_earned": total_points,
        "breakdown": {
            "base": base_points,
            "goal_bonus": goal_bonus,
            "streak_bonus": streak_bonus
        }
    }

@api_router.get("/study/sessions/{kid_id}")
async def get_study_sessions(kid_id: str, limit: int = 20):
    """Get study sessions for a kid"""
    sessions = await db.study_sessions.find(
        {"kid_id": kid_id},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return sessions

# ============ STREAK ROUTES ============

async def update_streak(kid_id: str):
    """Update study streak for a kid"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    streak = await db.streaks.find_one({"kid_id": kid_id}, {"_id": 0})
    
    if not streak:
        # Create new streak
        new_streak = StudyStreak(
            kid_id=kid_id,
            current_streak=1,
            longest_streak=1,
            last_study_date=today
        )
        await db.streaks.insert_one(serialize_doc(new_streak.model_dump()))
        return new_streak
    
    last_date = streak.get("last_study_date")
    
    if last_date == today:
        # Already studied today
        return streak
    
    # Check if yesterday
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    
    if last_date == yesterday:
        # Continue streak
        new_current = streak.get("current_streak", 0) + 1
        new_longest = max(new_current, streak.get("longest_streak", 0))
        
        await db.streaks.update_one(
            {"kid_id": kid_id},
            {"$set": {
                "current_streak": new_current,
                "longest_streak": new_longest,
                "last_study_date": today
            }}
        )
    else:
        # Streak broken, start fresh
        await db.streaks.update_one(
            {"kid_id": kid_id},
            {"$set": {
                "current_streak": 1,
                "last_study_date": today
            }}
        )
    
    return await db.streaks.find_one({"kid_id": kid_id}, {"_id": 0})

@api_router.get("/streak/{kid_id}")
async def get_streak(kid_id: str):
    """Get streak for a kid"""
    streak = await db.streaks.find_one({"kid_id": kid_id}, {"_id": 0})
    if not streak:
        return {"current_streak": 0, "longest_streak": 0, "last_study_date": None}
    return streak

# ============ BADGE ROUTES ============

async def check_and_award_badges(kid_id: str, subject: str):
    """Check if kid earned a new badge tier"""
    badge_type = BADGE_TYPES.get(subject)
    if not badge_type:
        return None
    
    # Count approved tasks in this subject
    task_count = await db.tasks.count_documents({
        "kid_id": kid_id,
        "subject": subject,
        "status": "approved"
    })
    
    # Get current badge
    badge = await db.badges.find_one({
        "kid_id": kid_id,
        "badge_type": badge_type
    }, {"_id": 0})
    
    current_tier = badge.get("tier", 0) if badge else 0
    
    # Check for tier upgrade
    new_tier = 0
    for tier, requirements in BADGE_TIERS.items():
        if task_count >= requirements["tasks_required"]:
            new_tier = tier
    
    if new_tier > current_tier:
        # Award new badge tier!
        if badge:
            await db.badges.update_one(
                {"kid_id": kid_id, "badge_type": badge_type},
                {"$set": {
                    "tier": new_tier,
                    "tasks_completed": task_count,
                    "earned_at": datetime.now(timezone.utc).isoformat()
                }}
            )
        else:
            new_badge = Badge(
                kid_id=kid_id,
                badge_type=badge_type,
                tier=new_tier,
                tasks_completed=task_count
            )
            await db.badges.insert_one(serialize_doc(new_badge.model_dump()))
        
        # Award bonus points
        bonus = BADGE_TIERS[new_tier]["points_bonus"]
        await db.kids.update_one(
            {"id": kid_id},
            {"$inc": {"points": bonus}}
        )
        
        # Add to history
        tier_name = BADGE_TIERS[new_tier]["name"]
        history = PointsHistory(
            kid_id=kid_id,
            amount=bonus,
            reason=f"Badge earned: {tier_name} {badge_type.replace('_', ' ').title()}"
        )
        await db.points_history.insert_one(serialize_doc(history.model_dump()))
        
        return {"badge_type": badge_type, "new_tier": new_tier, "tier_name": tier_name, "bonus": bonus}
    
    return None

@api_router.get("/badges/{kid_id}")
async def get_badges(kid_id: str):
    """Get all badges for a kid"""
    badges = await db.badges.find({"kid_id": kid_id}, {"_id": 0}).to_list(100)
    return {"badges": badges, "badge_tiers": BADGE_TIERS, "badge_types": BADGE_TYPES}

# ============ WEEKLY CHALLENGES ============

@api_router.post("/challenges")
async def create_challenge(data: WeeklyChallengeCreate):
    """Create a weekly challenge (parent action)"""
    challenge = WeeklyChallenge(**data.model_dump())
    await db.challenges.insert_one(serialize_doc(challenge.model_dump()))
    return challenge

@api_router.get("/challenges")
async def get_challenges(kid_id: Optional[str] = None, active_only: bool = True):
    """Get challenges"""
    query = {}
    if active_only:
        query["status"] = "active"
    
    challenges = await db.challenges.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Filter for specific kid or all-kids challenges
    if kid_id:
        challenges = [c for c in challenges if c.get("target_kid_id") is None or c.get("target_kid_id") == kid_id]
    
    return challenges

@api_router.post("/challenges/{challenge_id}/complete")
async def complete_challenge(challenge_id: str, kid_id: str):
    """Mark a challenge as completed by a kid"""
    challenge = await db.challenges.find_one({"id": challenge_id}, {"_id": 0})
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge not found")
    
    if kid_id in challenge.get("completed_by", []):
        raise HTTPException(status_code=400, detail="Already completed this challenge")
    
    # Add kid to completed list
    await db.challenges.update_one(
        {"id": challenge_id},
        {"$push": {"completed_by": kid_id}}
    )
    
    # Award points
    points = challenge.get("points_reward", 0)
    await db.kids.update_one(
        {"id": kid_id},
        {"$inc": {"points": points}}
    )
    
    # Add to history
    history = PointsHistory(
        kid_id=kid_id,
        amount=points,
        reason=f"Challenge completed: {challenge['title']}"
    )
    await db.points_history.insert_one(serialize_doc(history.model_dump()))
    
    return {"message": "Challenge completed!", "points_earned": points}

@api_router.delete("/challenges/{challenge_id}")
async def delete_challenge(challenge_id: str):
    """Delete a challenge"""
    await db.challenges.delete_one({"id": challenge_id})
    return {"message": "Challenge deleted"}

# ============ TYPING PRACTICE ============

TYPING_TEXTS = [
    "The quick brown fox jumps over the lazy dog.",
    "Pack my box with five dozen liquor jugs.",
    "How vexingly quick daft zebras jump!",
    "The five boxing wizards jump quickly.",
    "Sphinx of black quartz, judge my vow.",
    "Two driven jocks help fax my big quiz.",
    "The jay, pig, fox, zebra and my wolves quack!",
    "Sympathizing would fix Quaker objectives.",
    "A wizard's job is to vex chumps quickly in fog.",
    "Watch Jeopardy, Alex Trebek's fun TV quiz game."
]

@api_router.get("/typing/text")
async def get_typing_text():
    """Get a random typing practice text"""
    import random
    return {"text": random.choice(TYPING_TEXTS)}

@api_router.post("/typing/session")
async def create_typing_session(data: TypingSessionCreate):
    """Record a typing session"""
    kid = await db.kids.find_one({"id": data.kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Calculate points: Based on WPM and accuracy
    # Base: 1 point per 10 WPM
    # Accuracy bonus: +50% if accuracy > 95%, +25% if > 90%
    base_points = data.wpm // 10
    
    accuracy_multiplier = 1.0
    if data.accuracy >= 95:
        accuracy_multiplier = 1.5
    elif data.accuracy >= 90:
        accuracy_multiplier = 1.25
    
    total_points = int(base_points * accuracy_multiplier)
    
    session = TypingSession(
        kid_id=data.kid_id,
        wpm=data.wpm,
        accuracy=data.accuracy,
        duration_seconds=data.duration_seconds,
        points_earned=total_points
    )
    
    await db.typing_sessions.insert_one(serialize_doc(session.model_dump()))
    
    # Update kid's points
    if total_points > 0:
        await db.kids.update_one(
            {"id": data.kid_id},
            {"$inc": {"points": total_points}}
        )
        
        history = PointsHistory(
            kid_id=data.kid_id,
            amount=total_points,
            reason=f"Typing practice: {data.wpm} WPM, {data.accuracy:.0f}% accuracy"
        )
        await db.points_history.insert_one(serialize_doc(history.model_dump()))
    
    # Update streak
    await update_streak(data.kid_id)
    
    return {"session": session, "points_earned": total_points}

@api_router.get("/typing/stats/{kid_id}")
async def get_typing_stats(kid_id: str):
    """Get typing stats for a kid"""
    sessions = await db.typing_sessions.find(
        {"kid_id": kid_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    if not sessions:
        return {"best_wpm": 0, "avg_wpm": 0, "avg_accuracy": 0, "total_sessions": 0}
    
    best_wpm = max(s.get("wpm", 0) for s in sessions)
    avg_wpm = sum(s.get("wpm", 0) for s in sessions) // len(sessions)
    avg_accuracy = sum(s.get("accuracy", 0) for s in sessions) / len(sessions)
    
    return {
        "best_wpm": best_wpm,
        "avg_wpm": avg_wpm,
        "avg_accuracy": round(avg_accuracy, 1),
        "total_sessions": len(sessions),
        "recent_sessions": sessions[:10]
    }

# ============ LEADERBOARD ============

@api_router.get("/leaderboard")
async def get_leaderboard():
    """Get leaderboard of all kids"""
    kids = await db.kids.find({}, {"_id": 0}).to_list(100)
    
    leaderboard = []
    for kid in kids:
        # Get stats
        tasks_completed = await db.tasks.count_documents({"kid_id": kid["id"], "status": "approved"})
        streak_data = await db.streaks.find_one({"kid_id": kid["id"]}, {"_id": 0})
        badges = await db.badges.find({"kid_id": kid["id"]}, {"_id": 0}).to_list(100)
        typing_stats = await db.typing_sessions.find({"kid_id": kid["id"]}, {"_id": 0}).to_list(1)
        
        best_wpm = 0
        if typing_stats:
            all_typing = await db.typing_sessions.find({"kid_id": kid["id"]}, {"_id": 0}).to_list(100)
            best_wpm = max((s.get("wpm", 0) for s in all_typing), default=0)
        
        leaderboard.append({
            "id": kid["id"],
            "name": kid["name"],
            "grade": kid["grade"],
            "avatar_color": kid.get("avatar_color", "#4F46E5"),
            "points": kid.get("points", 0),
            "tasks_completed": tasks_completed,
            "current_streak": streak_data.get("current_streak", 0) if streak_data else 0,
            "badges_count": len(badges),
            "best_wpm": best_wpm
        })
    
    # Sort by points
    leaderboard.sort(key=lambda x: x["points"], reverse=True)
    
    return leaderboard

# ============ AI POINT ESTIMATION ============

@api_router.post("/tasks/estimate-points", response_model=TaskPointEstimate)
async def estimate_task_points(data: TaskCreate):
    """AI estimates points for a task before submission"""
    kid = await db.kids.find_one({"id": data.kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    try:
        system_message = """You are a homework evaluation assistant. Based on the task description, estimate how many points (1-30) this homework submission deserves. Consider:
- Complexity of the task
- Level of detail in the description
- Evidence of understanding/learning
- Effort shown

Respond ONLY with a JSON object like: {"points": 15, "reasoning": "Brief reason"}
No other text."""

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"point-estimate-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            system_message=system_message
        ).with_model("openai", "gpt-5.2")
        
        prompt = f"""Task: {data.title}
Subject: {data.subject}
Description: {data.description}
Grade: {kid['grade']}"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        
        # Parse JSON response
        import json
        try:
            result = json.loads(response)
            return TaskPointEstimate(
                estimated_points=min(max(result.get("points", 10), 1), 30),
                reasoning=result.get("reasoning", "Based on task complexity")
            )
        except:
            return TaskPointEstimate(estimated_points=10, reasoning="Standard task submission")
            
    except Exception as e:
        logging.error(f"Estimation error: {e}")
        return TaskPointEstimate(estimated_points=10, reasoning="Standard task submission")

# ============ REFERRAL ROUTES ============

@api_router.get("/referral/stats/{family_id}")
async def get_referral_stats(family_id: str):
    """Get referral statistics for a family"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Count successful referrals
    referrals = await db.referrals.find({
        "referrer_family_id": family_id, 
        "status": "rewarded"
    }, {"_id": 0}).to_list(100)
    
    return {
        "referral_code": family.get("referral_code"),
        "total_referrals": len(referrals),
        "months_earned": len(referrals),  # Each referral = 1 month
        "referrals": [{"email": r.get("referred_email", ""), "date": r.get("created_at")} for r in referrals]
    }

@api_router.get("/referral/validate/{code}")
async def validate_referral_code(code: str):
    """Check if a referral code is valid"""
    family = await db.families.find_one({"referral_code": code.upper()}, {"_id": 0})
    if family:
        return {"valid": True, "family_name": family.get("family_name")}
    return {"valid": False}

# ============ CERTIFICATE ROUTES ============

CERTIFICATE_MILESTONES = [
    {"points": 100, "title": "Rising Star", "description": "Earned 100 points"},
    {"points": 250, "title": "Super Learner", "description": "Earned 250 points"},
    {"points": 500, "title": "Knowledge Champion", "description": "Earned 500 points"},
    {"points": 1000, "title": "Master Scholar", "description": "Earned 1000 points"},
    {"points": 2500, "title": "Academic Legend", "description": "Earned 2500 points"},
]

@api_router.get("/certificates/{kid_id}")
async def get_certificates(kid_id: str):
    """Get all certificates earned by a kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    certificates = await db.certificates.find({"kid_id": kid_id}, {"_id": 0}).sort("issued_at", -1).to_list(100)
    
    # Check for new milestone certificates
    current_points = kid.get("points", 0)
    existing_milestones = [c.get("achievement_title") for c in certificates if c.get("achievement_type") == "points_milestone"]
    
    new_certificates = []
    for milestone in CERTIFICATE_MILESTONES:
        if current_points >= milestone["points"] and milestone["title"] not in existing_milestones:
            cert = {
                "id": str(uuid.uuid4()),
                "kid_id": kid_id,
                "kid_name": kid.get("name", "Student"),
                "achievement_type": "points_milestone",
                "achievement_title": milestone["title"],
                "achievement_description": milestone["description"],
                "points_at_time": current_points,
                "issued_at": datetime.now(timezone.utc).isoformat()
            }
            await db.certificates.insert_one(serialize_doc(cert))
            new_certificates.append(cert)
    
    # Fetch updated list
    if new_certificates:
        certificates = await db.certificates.find({"kid_id": kid_id}, {"_id": 0}).sort("issued_at", -1).to_list(100)
    
    return {"certificates": certificates, "new_certificates": new_certificates}

@api_router.get("/certificate/{certificate_id}/pdf")
async def get_certificate_pdf(certificate_id: str):
    """Generate a printable certificate PDF"""
    cert = await db.certificates.find_one({"id": certificate_id}, {"_id": 0})
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
    
    # Generate HTML certificate
    issued_date = cert.get("issued_at", "")[:10] if cert.get("issued_at") else datetime.now().strftime("%Y-%m-%d")
    
    html_content = f'''
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Open+Sans&display=swap');
            body {{
                font-family: 'Open Sans', sans-serif;
                margin: 0;
                padding: 40px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
            }}
            .certificate {{
                background: white;
                border: 8px solid #d4af37;
                border-radius: 20px;
                padding: 60px;
                max-width: 800px;
                text-align: center;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            }}
            .header {{
                color: #d4af37;
                font-size: 14px;
                letter-spacing: 4px;
                text-transform: uppercase;
                margin-bottom: 10px;
            }}
            .title {{
                font-family: 'Playfair Display', serif;
                font-size: 48px;
                color: #333;
                margin: 20px 0;
            }}
            .subtitle {{
                font-size: 18px;
                color: #666;
                margin-bottom: 30px;
            }}
            .name {{
                font-family: 'Playfair Display', serif;
                font-size: 42px;
                color: #4F46E5;
                margin: 30px 0;
                border-bottom: 3px solid #d4af37;
                padding-bottom: 10px;
                display: inline-block;
            }}
            .achievement {{
                font-size: 24px;
                color: #333;
                margin: 30px 0;
            }}
            .description {{
                font-size: 16px;
                color: #666;
                margin: 20px 0;
            }}
            .date {{
                font-size: 14px;
                color: #999;
                margin-top: 40px;
            }}
            .badge {{
                font-size: 60px;
                margin: 20px 0;
            }}
        </style>
    </head>
    <body>
        <div class="certificate">
            <div class="header">Study Helper Academy</div>
            <div class="title">Certificate of Achievement</div>
            <div class="subtitle">This certificate is proudly presented to</div>
            <div class="name">{cert.get("kid_name", "Student")}</div>
            <div class="badge">🏆</div>
            <div class="achievement">{cert.get("achievement_title", "Achievement")}</div>
            <div class="description">{cert.get("achievement_description", "")}</div>
            <div class="date">Awarded on {issued_date}</div>
        </div>
    </body>
    </html>
    '''
    
    return StreamingResponse(
        io.StringIO(html_content),
        media_type="text/html",
        headers={"Content-Disposition": f"inline; filename=certificate_{certificate_id}.html"}
    )


# ============ PROFILE/SETTINGS ROUTES ============

class ProfileUpdate(BaseModel):
    family_name: Optional[str] = None
    avatar_id: Optional[str] = None
    avatar_emoji: Optional[str] = None
    avatar_color: Optional[str] = None
    email_notifications: Optional[bool] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@api_router.put("/profile/{family_id}")
async def update_profile(family_id: str, data: ProfileUpdate):
    """Update family profile"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    update_data = {}
    if data.family_name is not None:
        update_data["family_name"] = data.family_name
    if data.avatar_id is not None:
        update_data["avatar_id"] = data.avatar_id
    if data.avatar_emoji is not None:
        update_data["avatar_emoji"] = data.avatar_emoji
    if data.avatar_color is not None:
        update_data["avatar_color"] = data.avatar_color
    if data.email_notifications is not None:
        update_data["email_notifications"] = data.email_notifications
    
    if update_data:
        await db.families.update_one({"id": family_id}, {"$set": update_data})
    
    # Get updated family
    updated_family = await db.families.find_one({"id": family_id}, {"_id": 0})
    admin = is_admin_email(updated_family.get("email", ""))
    kids_count = await db.kids.count_documents({"family_id": family_id})
    
    return {
        "id": updated_family["id"],
        "email": updated_family["email"],
        "family_name": updated_family.get("family_name", "My Family"),
        "curriculum": updated_family.get("curriculum", "caps"),
        "avatar_id": updated_family.get("avatar_id", "fox"),
        "avatar_emoji": updated_family.get("avatar_emoji", "🦊"),
        "avatar_color": updated_family.get("avatar_color", "#FF6B35"),
        "is_premium": admin or updated_family.get("is_premium", False),
        "is_admin": admin,
        "premium_expires": None if admin else updated_family.get("premium_expires"),
        "kids_count": kids_count,
        "referral_code": updated_family.get("referral_code")
    }

@api_router.post("/profile/{family_id}/change-password")
async def change_password(family_id: str, data: PasswordChange):
    """Change family password"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    # Verify current password
    if not verify_password(data.current_password, family.get("password_hash", "")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Update password
    new_hash = hash_password(data.new_password)
    await db.families.update_one({"id": family_id}, {"$set": {"password_hash": new_hash}})
    
    return {"message": "Password changed successfully"}


# ============ DAILY REWARDS ROUTES ============

@api_router.get("/daily-rewards/{kid_id}")
async def get_daily_rewards(kid_id: str):
    """Get daily reward status for a kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Get or create reward record
    reward = await db.daily_rewards.find_one({"kid_id": kid_id}, {"_id": 0})
    
    today = datetime.now(timezone.utc).date().isoformat()
    
    if not reward:
        reward = {
            "kid_id": kid_id,
            "current_streak": 0,
            "last_claim_date": None,
            "total_claimed": 0,
            "can_claim_today": True
        }
    else:
        # Check if already claimed today
        last_claim = reward.get("last_claim_date")
        can_claim = last_claim != today
        reward["can_claim_today"] = can_claim
        
        # Check if streak should reset (missed a day)
        if last_claim:
            last_date = datetime.fromisoformat(last_claim).date()
            today_date = datetime.now(timezone.utc).date()
            days_diff = (today_date - last_date).days
            
            if days_diff > 1:
                # Missed a day, reset streak
                reward["current_streak"] = 0
    
    return reward

@api_router.post("/daily-rewards/{kid_id}/claim")
async def claim_daily_reward(kid_id: str):
    """Claim daily reward for a kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Get or create reward record
    reward = await db.daily_rewards.find_one({"kid_id": kid_id}, {"_id": 0})
    
    if not reward:
        reward = {
            "id": str(uuid.uuid4()),
            "kid_id": kid_id,
            "current_streak": 0,
            "last_claim_date": None,
            "total_claimed": 0
        }
        await db.daily_rewards.insert_one(reward)
    
    # Check if already claimed today
    if reward.get("last_claim_date") == today:
        raise HTTPException(status_code=400, detail="Already claimed today's reward")
    
    # Check if streak should reset
    last_claim = reward.get("last_claim_date")
    if last_claim:
        last_date = datetime.fromisoformat(last_claim).date()
        today_date = datetime.now(timezone.utc).date()
        days_diff = (today_date - last_date).days
        
        if days_diff > 1:
            reward["current_streak"] = 0
    
    # Calculate new streak (max 7)
    new_streak = min((reward.get("current_streak", 0) + 1), 7)
    
    # Day rewards: 5, 10, 15, 20, 30, 40, 100
    day_points = [5, 10, 15, 20, 30, 40, 100]
    points_earned = day_points[new_streak - 1]
    
    # Update reward record
    await db.daily_rewards.update_one(
        {"kid_id": kid_id},
        {"$set": {
            "current_streak": new_streak if new_streak < 7 else 0,  # Reset after day 7
            "last_claim_date": today,
            "total_claimed": reward.get("total_claimed", 0) + points_earned
        }}
    )
    
    # Award points to kid
    await db.kids.update_one(
        {"id": kid_id},
        {"$inc": {"points": points_earned}}
    )
    
    return {
        "current_streak": new_streak if new_streak < 7 else 0,
        "last_claim_date": today,
        "total_claimed": reward.get("total_claimed", 0) + points_earned,
        "points_earned": points_earned,
        "can_claim_today": False
    }

# ============ SUBJECT MASTERY ROUTES ============

@api_router.get("/mastery/{kid_id}")
async def get_subject_mastery(kid_id: str):
    """Get subject mastery levels for a kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Get all completed tasks for this kid grouped by subject
    pipeline = [
        {"$match": {"kid_id": kid_id, "status": "approved"}},
        {"$group": {
            "_id": "$subject",
            "completed_count": {"$sum": 1},
            "total_points": {"$sum": "$points"}
        }}
    ]
    
    results = await db.tasks.aggregate(pipeline).to_list(100)
    
    # Calculate mastery level for each subject
    # Bronze: 5 tasks, Silver: 15 tasks, Gold: 30 tasks, Master: 50 tasks
    mastery_levels = []
    for result in results:
        subject = result["_id"]
        count = result["completed_count"]
        
        if count >= 50:
            level = "master"
            progress = 100
            next_level = None
            tasks_needed = 0
        elif count >= 30:
            level = "gold"
            progress = int((count - 30) / 20 * 100)
            next_level = "master"
            tasks_needed = 50 - count
        elif count >= 15:
            level = "silver"
            progress = int((count - 15) / 15 * 100)
            next_level = "gold"
            tasks_needed = 30 - count
        elif count >= 5:
            level = "bronze"
            progress = int((count - 5) / 10 * 100)
            next_level = "silver"
            tasks_needed = 15 - count
        else:
            level = "none"
            progress = int(count / 5 * 100)
            next_level = "bronze"
            tasks_needed = 5 - count
        
        mastery_levels.append({
            "subject": subject,
            "level": level,
            "completed_tasks": count,
            "total_points": result["total_points"],
            "progress_to_next": progress,
            "next_level": next_level,
            "tasks_needed": tasks_needed
        })
    
    return {"mastery": mastery_levels}

# ============ HOMEWORK PHOTO SCANNER ============

class HomeworkScanRequest(BaseModel):
    kid_id: str
    image_base64: str
    subject: Optional[str] = None

class HomeworkScanResponse(BaseModel):
    extracted_text: str
    suggested_task: Optional[dict] = None
    explanation: Optional[str] = None

@api_router.post("/homework/scan")
async def scan_homework(data: HomeworkScanRequest):
    """Scan homework photo, extract text, create task, and provide explanation"""
    kid = await db.kids.find_one({"id": data.kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Rate limiting check
    if not check_rate_limit(data.kid_id, "ai_question"):
        raise HTTPException(status_code=429, detail="Please wait a few seconds before scanning again")
    
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY)
        
        # First, extract text from the image
        extraction_prompt = """Look at this homework image and extract all the text/questions you can see.
        Format your response as:
        EXTRACTED TEXT:
        [list all questions/problems you see]
        
        SUBJECT: [identify the subject - Math, English, Science, etc.]
        
        ESTIMATED TIME: [estimate how long this homework would take in minutes]"""
        
        messages = [UserMessage(
            content=extraction_prompt,
            images=[f"data:image/jpeg;base64,{data.image_base64}"]
        )]
        
        extraction_response = await chat.send_async("gpt-4o", messages)
        extracted_text = extraction_response.content
        
        # Parse subject from response
        subject = data.subject or "General"
        if "SUBJECT:" in extracted_text:
            try:
                subject_line = [l for l in extracted_text.split('\n') if 'SUBJECT:' in l][0]
                subject = subject_line.split('SUBJECT:')[1].strip()
            except:
                pass
        
        # Parse estimated time
        estimated_time = 30  # default
        if "ESTIMATED TIME:" in extracted_text:
            try:
                time_line = [l for l in extracted_text.split('\n') if 'ESTIMATED TIME:' in l][0]
                time_str = time_line.split('ESTIMATED TIME:')[1].strip()
                # Extract number from string
                import re
                numbers = re.findall(r'\d+', time_str)
                if numbers:
                    estimated_time = int(numbers[0])
            except:
                pass
        
        # Now get an explanation/help for the homework (Socratic method for kids)
        explanation_prompt = f"""A Grade {kid.get('grade', 5)} student needs help understanding this homework.
        
        The extracted homework is:
        {extracted_text}
        
        Provide a helpful explanation that:
        1. Explains the KEY CONCEPTS needed to solve this
        2. Gives HINTS on how to approach each problem
        3. Does NOT give direct answers (use Socratic method)
        4. Uses simple language appropriate for Grade {kid.get('grade', 5)}
        5. Encourages the student
        
        Keep it friendly and encouraging!"""
        
        explanation_messages = [UserMessage(content=explanation_prompt)]
        explanation_response = await chat.send_async("gpt-4o-mini", explanation_messages)
        explanation = explanation_response.content
        
        # Create a suggested task
        suggested_task = {
            "title": f"{subject} Homework",
            "description": extracted_text[:500] if len(extracted_text) > 500 else extracted_text,
            "subject": subject,
            "estimated_points": min(max(estimated_time // 10, 5), 50),  # 5-50 points based on time
            "estimated_minutes": estimated_time
        }
        
        return {
            "extracted_text": extracted_text,
            "suggested_task": suggested_task,
            "explanation": explanation
        }
        
    except Exception as e:
        logger.error(f"Homework scan error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to scan homework: {str(e)}")

@api_router.post("/homework/create-task")
async def create_task_from_scan(kid_id: str, title: str, description: str, subject: str, points: int = 10):
    """Create a task from scanned homework"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Rate limiting
    if not check_rate_limit(kid_id, "task_submit"):
        raise HTTPException(status_code=429, detail="Please wait before submitting another task")
    
    task = {
        "id": str(uuid.uuid4()),
        "kid_id": kid_id,
        "family_id": kid.get("family_id"),
        "title": title,
        "description": description,
        "subject": subject,
        "points": points,
        "status": "pending",
        "source": "photo_scan",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tasks.insert_one(task)
    
    return {"message": "Task created successfully", "task_id": task["id"]}

# ============ MULTIPLE CHALLENGES ============

class ChallengeCreate(BaseModel):
    title: str
    description: str
    target_type: str  # "tasks", "points", "streak"
    target_value: int
    reward_points: int
    end_date: str
    kid_ids: List[str]  # Can assign to multiple kids

@api_router.post("/challenges/bulk-create")
async def create_multiple_challenges(family_id: str, challenges: List[ChallengeCreate]):
    """Create multiple challenges at once"""
    family = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not family:
        raise HTTPException(status_code=404, detail="Family not found")
    
    created_challenges = []
    
    for challenge_data in challenges:
        # Create a challenge for each kid
        for kid_id in challenge_data.kid_ids:
            kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
            if not kid:
                continue
                
            challenge = {
                "id": str(uuid.uuid4()),
                "family_id": family_id,
                "kid_id": kid_id,
                "kid_name": kid.get("name", ""),
                "title": challenge_data.title,
                "description": challenge_data.description,
                "target_type": challenge_data.target_type,
                "target_value": challenge_data.target_value,
                "current_value": 0,
                "reward_points": challenge_data.reward_points,
                "status": "active",
                "start_date": datetime.now(timezone.utc).isoformat(),
                "end_date": challenge_data.end_date,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            
            await db.challenges.insert_one(challenge)
            created_challenges.append(challenge)
    
    return {
        "message": f"Created {len(created_challenges)} challenges",
        "challenges": created_challenges
    }

# ============ PARENT PROGRESS REPORTS ============

@api_router.get("/progress-report/{kid_id}")
async def get_progress_report(kid_id: str, days: int = 7):
    """Get comprehensive progress report for a kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    
    # Calculate date range
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=days)
    start_iso = start_date.isoformat()
    
    # Get completed tasks in period
    tasks = await db.tasks.find({
        "kid_id": kid_id,
        "status": "approved",
        "created_at": {"$gte": start_iso}
    }, {"_id": 0}).to_list(100)
    
    # Calculate stats
    total_tasks = len(tasks)
    total_points = sum(t.get("points", 0) for t in tasks)
    
    # Group by subject
    subject_stats = {}
    for task in tasks:
        subject = task.get("subject", "General")
        if subject not in subject_stats:
            subject_stats[subject] = {"count": 0, "points": 0}
        subject_stats[subject]["count"] += 1
        subject_stats[subject]["points"] += task.get("points", 0)
    
    # Get streak info
    streak = await db.streaks.find_one({"kid_id": kid_id}, {"_id": 0})
    current_streak = streak.get("current_streak", 0) if streak else 0
    max_streak = streak.get("max_streak", 0) if streak else 0
    
    # Get badges earned in period
    badges = await db.badges.find({
        "kid_id": kid_id,
        "earned_at": {"$gte": start_iso}
    }, {"_id": 0}).to_list(100)
    
    # Get daily rewards claimed
    daily_rewards = await db.daily_rewards.find_one({"kid_id": kid_id}, {"_id": 0})
    rewards_streak = daily_rewards.get("current_streak", 0) if daily_rewards else 0
    total_bonus_points = daily_rewards.get("total_claimed", 0) if daily_rewards else 0
    
    # Get challenges progress
    challenges = await db.challenges.find({
        "kid_id": kid_id,
        "status": {"$in": ["active", "completed"]}
    }, {"_id": 0}).to_list(50)
    
    completed_challenges = len([c for c in challenges if c.get("status") == "completed"])
    active_challenges = len([c for c in challenges if c.get("status") == "active"])
    
    # Get mastery levels
    mastery_data = await get_subject_mastery(kid_id)
    
    # Calculate overall grade/score
    performance_score = min(100, (total_tasks * 5) + (current_streak * 2) + (len(badges) * 10))
    
    if performance_score >= 90:
        grade = "A+"
        feedback = "Outstanding work! Keep it up! 🌟"
    elif performance_score >= 80:
        grade = "A"
        feedback = "Excellent progress! You're doing great! 🎉"
    elif performance_score >= 70:
        grade = "B"
        feedback = "Good job! Keep pushing forward! 💪"
    elif performance_score >= 60:
        grade = "C"
        feedback = "Nice effort! Let's aim higher next week! 📈"
    else:
        grade = "D"
        feedback = "Let's work together to improve! You can do it! 🤗"
    
    return {
        "kid_name": kid.get("name"),
        "period": f"Last {days} days",
        "report_date": datetime.now(timezone.utc).isoformat(),
        
        "summary": {
            "performance_score": performance_score,
            "grade": grade,
            "feedback": feedback,
            "total_points_earned": total_points,
            "current_total_points": kid.get("points", 0)
        },
        
        "tasks": {
            "completed": total_tasks,
            "by_subject": subject_stats
        },
        
        "streaks": {
            "current": current_streak,
            "max": max_streak,
            "daily_rewards_streak": rewards_streak
        },
        
        "achievements": {
            "badges_earned": len(badges),
            "badge_names": [b.get("name") for b in badges],
            "challenges_completed": completed_challenges,
            "challenges_active": active_challenges
        },
        
        "mastery": mastery_data.get("mastery", []),
        
        "bonus_points": {
            "from_daily_rewards": total_bonus_points,
            "from_badges": len(badges) * 10,
            "from_challenges": completed_challenges * 25
        },
        
        "recommendations": [
            f"Focus on {min(subject_stats.items(), key=lambda x: x[1]['count'])[0] if subject_stats else 'any subject'} to improve balance" if subject_stats else "Start completing homework tasks!",
            "Keep the streak going!" if current_streak > 0 else "Try to study every day to build a streak!",
            "Claim daily rewards for bonus points!" if rewards_streak < 3 else "Great job claiming daily rewards!"
        ]
    }

@api_router.post("/progress-report/{kid_id}/send-email")
async def send_progress_report_email(kid_id: str, email: str):
    """Send progress report to parent email (placeholder - would need email service)"""
    # Get the report
    report = await get_progress_report(kid_id, 7)
    
    # In a real implementation, you would send an email here
    # For now, we'll just return the report data
    
    return {
        "message": "Progress report generated (email sending requires email service integration)",
        "report": report,
        "email": email
    }






# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
