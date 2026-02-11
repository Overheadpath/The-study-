from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

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
    name: str
    grade: int
    pin: str
    points: int = 0
    avatar_color: str = "#4F46E5"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class KidCreate(BaseModel):
    name: str
    grade: int
    pin: str
    avatar_color: Optional[str] = "#4F46E5"

class KidUpdate(BaseModel):
    name: Optional[str] = None
    grade: Optional[int] = None
    pin: Optional[str] = None
    avatar_color: Optional[str] = None
    points: Optional[int] = None

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

class PinVerifyResponse(BaseModel):
    valid: bool
    mode: str
    kid_id: Optional[str] = None
    kid_name: Optional[str] = None

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

# ============ AUTH ROUTES ============

@api_router.post("/auth/verify-pin", response_model=PinVerifyResponse)
async def verify_pin(data: PinVerify):
    """Verify PIN for parent or student mode"""
    if data.mode == "parent":
        settings = await db.settings.find_one({"id": "main_settings"}, {"_id": 0})
        if not settings:
            # Create default settings
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

@api_router.get("/kids", response_model=List[Kid])
async def get_kids():
    """Get all kids"""
    kids = await db.kids.find({}, {"_id": 0}).to_list(100)
    return kids

@api_router.get("/kids/{kid_id}", response_model=Kid)
async def get_kid(kid_id: str):
    """Get a specific kid"""
    kid = await db.kids.find_one({"id": kid_id}, {"_id": 0})
    if not kid:
        raise HTTPException(status_code=404, detail="Kid not found")
    return kid

@api_router.post("/kids", response_model=Kid)
async def create_kid(data: KidCreate):
    """Create a new kid"""
    kid = Kid(**data.model_dump())
    await db.kids.insert_one(serialize_doc(kid.model_dump()))
    return kid

@api_router.put("/kids/{kid_id}", response_model=Kid)
async def update_kid(kid_id: str, data: KidUpdate):
    """Update a kid"""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
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

@api_router.put("/tasks/{task_id}/approve", response_model=Task)
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
    
    updated_task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    return updated_task

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
    
    # Build system message based on kid's grade and subject
    grade_text = f"Grade {kid['grade']}"
    subject_text = f" about {data.subject}" if data.subject else ""
    
    system_message = f"""You are a friendly, encouraging homework helper for {kid['name']}, a {grade_text} student in South Africa following the CAPS curriculum at St George's Grammar School.

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
- For Afrikaans: Help them understand grammar rules, don't translate for them
- For essays/writing: Ask guiding questions, don't write for them

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
