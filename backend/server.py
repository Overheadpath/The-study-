from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import io
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import base64
import hashlib

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

class FamilyLogin(BaseModel):
    email: str
    password: str

class FamilyResponse(BaseModel):
    id: str
    email: str
    family_name: str
    curriculum: str = "caps"
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
            "is_premium": admin or family.get("is_premium", False),
            "is_admin": admin,
            "premium_expires": None if admin else family.get("premium_expires"),
            "kids_count": kids_count
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
