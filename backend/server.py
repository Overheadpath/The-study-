from datetime import datetime, timezone
import logging
import os
from pathlib import Path
from typing import List, Optional
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StatusCheckCreate(BaseModel):
    client_name: str


class Storage:
    """Small storage layer so app can run even when MongoDB isn't configured."""

    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
        self.collection = None
        self.memory_store: List[dict] = []
        self.mode = "memory"

        mongo_url = os.getenv("MONGO_URL")
        db_name = os.getenv("DB_NAME")

        if mongo_url and db_name:
            self.client = AsyncIOMotorClient(mongo_url)
            self.collection = self.client[db_name].status_checks
            self.mode = "mongo"
            logger.info("Storage mode: mongo")
        else:
            logger.warning(
                "MONGO_URL/DB_NAME not set. Falling back to in-memory storage mode."
            )

    async def insert_status(self, status_obj: StatusCheck) -> None:
        doc = status_obj.model_dump()
        doc["timestamp"] = doc["timestamp"].isoformat()

        if self.mode == "mongo" and self.collection is not None:
            await self.collection.insert_one(doc)
            return

        self.memory_store.append(doc)

    async def list_statuses(self) -> List[dict]:
        if self.mode == "mongo" and self.collection is not None:
            rows = await self.collection.find({}, {"_id": 0}).to_list(1000)
        else:
            rows = list(self.memory_store)

        for row in rows:
            ts = row.get("timestamp")
            if isinstance(ts, str):
                row["timestamp"] = datetime.fromisoformat(ts)

        return rows

    async def close(self) -> None:
        if self.client is not None:
            self.client.close()


storage = Storage()

# Create the main app without a prefix
app = FastAPI()
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Hello World", "storage_mode": storage.mode}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    if not input.client_name.strip():
        raise HTTPException(status_code=400, detail="client_name cannot be empty")

    status_obj = StatusCheck(client_name=input.client_name.strip())
    await storage.insert_status(status_obj)
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    return await storage.list_statuses()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    await storage.close()
