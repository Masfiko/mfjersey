from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Annotated

import bcrypt
import jwt
from bson import ObjectId
from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    Depends,
    Request,
    Response,
    UploadFile,
    File,
    Form,
    Query,
    Header,
)
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, BeforeValidator

# ----------------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("mfjersey")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@mfjersey.id")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = os.environ.get("APP_NAME", "mfjersey")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="MF.Jersey_id Finance API")
api = APIRouter(prefix="/api")

# ----------------------------------------------------------------------------
# Auth helpers
# ----------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=False,
                        samesite="lax", max_age=86400, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False,
                        samesite="lax", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Tidak terautentikasi")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        user["id"] = str(user["_id"])
        del user["_id"]
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token kadaluarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


# ----------------------------------------------------------------------------
# Storage helpers
# ----------------------------------------------------------------------------
storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        logger.info("Storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage tidak tersedia")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if r.status_code == 403:
        global storage_key
        storage_key = None
        key = init_storage()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    r.raise_for_status()
    return r.json()


def get_object(path: str):
    key = init_storage()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 403:
        global storage_key
        storage_key = None
        key = init_storage()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


# ----------------------------------------------------------------------------
# Pydantic models
# ----------------------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=4)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ReadyStockIn(BaseModel):
    item_name: str
    purchase_price: float = 0
    shipping_cost: float = 0
    remake_cost: float = 0
    status: str = "Tersedia"
    image_path: Optional[str] = None
    sale_price: Optional[float] = 0
    sold_date: Optional[str] = None


class BeginningBalanceIn(BaseModel):
    kas: float = 0
    kas_bank: float = 0
    piutang: float = 0
    persediaan_jersey: float = 0
    perlengkapan_jersey: float = 0
    perlengkapan: float = 0


class TransactionIn(BaseModel):
    date: str  # ISO date YYYY-MM-DD
    description: str
    income: float = 0
    expense: float = 0
    category: str = "lainnya"  # penjualan, pembelian, biaya, pendapatan_lain, lainnya


# ----------------------------------------------------------------------------
# Auth endpoints
# ----------------------------------------------------------------------------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    doc = {
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    user_id = str(res.inserted_id)
    set_auth_cookies(response, create_access_token(user_id, email), create_refresh_token(user_id))
    return {"id": user_id, "email": email, "name": body.name, "role": "user"}


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    user_id = str(user["_id"])
    set_auth_cookies(response, create_access_token(user_id, email), create_refresh_token(user_id))
    return {"id": user_id, "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user")}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----------------------------------------------------------------------------
# Ready Stock endpoints
# ----------------------------------------------------------------------------
def _ready_total(item: dict) -> float:
    return float(item.get("purchase_price", 0)) + float(item.get("shipping_cost", 0)) + float(item.get("remake_cost", 0))


def _clean_ready(item: dict) -> dict:
    item.pop("_id", None)
    item["total"] = _ready_total(item)
    return item


@api.get("/ready-stock")
async def list_ready_stock(user: dict = Depends(get_current_user)):
    items = await db.ready_stock.find({"user_id": user["id"]}).sort("created_at", -1).to_list(1000)
    return [_clean_ready(i) for i in items]


@api.post("/ready-stock")
async def create_ready_stock(body: ReadyStockIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.ready_stock.insert_one(doc)
    return _clean_ready(doc)


@api.put("/ready-stock/{item_id}")
async def update_ready_stock(item_id: str, body: ReadyStockIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    res = await db.ready_stock.update_one(
        {"id": item_id, "user_id": user["id"]},
        {"$set": doc},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    item = await db.ready_stock.find_one({"id": item_id, "user_id": user["id"]})
    return _clean_ready(item)


@api.delete("/ready-stock/{item_id}")
async def delete_ready_stock(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.ready_stock.delete_one({"id": item_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    return {"ok": True}


# Image upload
@api.post("/upload-image")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename or "img.png").split(".")[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        ext = "png"
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Ukuran file maksimum 5MB")
    content_type = file.content_type or f"image/{ext}"
    result = put_object(path, data, content_type)
    await db.files.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "storage_path": result["path"],
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"path": result["path"]}


@api.get("/files/{path:path}")
async def serve_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    # Allow auth via query (?auth=token) for <img src=...>
    if auth:
        try:
            jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Token tidak valid")
    else:
        await get_current_user(request)
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    data, ct = get_object(path)
    return FastResponse(content=data, media_type=record.get("content_type", ct))


# ----------------------------------------------------------------------------
# Beginning Balance
# ----------------------------------------------------------------------------
def _empty_balance(user_id: str) -> dict:
    return {
        "user_id": user_id,
        "kas": 0, "kas_bank": 0, "piutang": 0,
        "persediaan_jersey": 0, "perlengkapan_jersey": 0, "perlengkapan": 0,
    }


def _clean_balance(doc: dict) -> dict:
    doc.pop("_id", None)
    total = sum(float(doc.get(k, 0)) for k in
                ["kas", "kas_bank", "piutang", "persediaan_jersey", "perlengkapan_jersey", "perlengkapan"])
    doc["total_aset"] = total
    return doc


@api.get("/beginning-balance")
async def get_beginning_balance(user: dict = Depends(get_current_user)):
    doc = await db.beginning_balance.find_one({"user_id": user["id"]})
    if not doc:
        doc = _empty_balance(user["id"])
    return _clean_balance(doc)


@api.put("/beginning-balance")
async def update_beginning_balance(body: BeginningBalanceIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["user_id"] = user["id"]
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.beginning_balance.update_one(
        {"user_id": user["id"]},
        {"$set": doc},
        upsert=True,
    )
    return _clean_balance(doc)


# ----------------------------------------------------------------------------
# Bank Cash Book
# ----------------------------------------------------------------------------
@api.get("/cash-book")
async def list_cash_book(user: dict = Depends(get_current_user)):
    txs = await db.transactions.find({"user_id": user["id"]}).sort("date", 1).to_list(2000)
    # Compute running balance using beginning balance kas+kas_bank
    bb = await db.beginning_balance.find_one({"user_id": user["id"]}) or {}
    balance = float(bb.get("kas", 0)) + float(bb.get("kas_bank", 0))
    result = []
    for tx in txs:
        tx.pop("_id", None)
        balance += float(tx.get("income", 0)) - float(tx.get("expense", 0))
        tx["balance"] = balance
        result.append(tx)
    return {"opening_balance": float(bb.get("kas", 0)) + float(bb.get("kas_bank", 0)),
            "transactions": result, "closing_balance": balance}


@api.post("/cash-book")
async def create_transaction(body: TransactionIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.put("/cash-book/{tx_id}")
async def update_transaction(tx_id: str, body: TransactionIn, user: dict = Depends(get_current_user)):
    res = await db.transactions.update_one(
        {"id": tx_id, "user_id": user["id"]},
        {"$set": body.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return {"ok": True}


@api.delete("/cash-book/{tx_id}")
async def delete_transaction(tx_id: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tx_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Transaksi tidak ditemukan")
    return {"ok": True}


# ----------------------------------------------------------------------------
# Profit & Loss
# ----------------------------------------------------------------------------
@api.get("/profit-loss")
async def profit_loss(user: dict = Depends(get_current_user)):
    # Sales = sum of sale_price for terjual items
    items = await db.ready_stock.find({"user_id": user["id"]}).to_list(2000)
    sold = [i for i in items if (i.get("status", "").lower() == "terjual")]
    sales = sum(float(i.get("sale_price", 0) or 0) for i in sold)
    cogs = sum(_ready_total(i) for i in sold)
    gross_profit = sales - cogs

    txs = await db.transactions.find({"user_id": user["id"]}).to_list(2000)
    expenses_list = [t for t in txs if t.get("category") == "biaya"]
    other_income_list = [t for t in txs if t.get("category") == "pendapatan_lain"]
    total_expenses = sum(float(t.get("expense", 0) or 0) for t in expenses_list)
    other_income = sum(float(t.get("income", 0) or 0) for t in other_income_list)

    net_profit = gross_profit - total_expenses + other_income

    return {
        "sales": sales,
        "cogs": cogs,
        "gross_profit": gross_profit,
        "expenses": [
            {"description": t.get("description", ""), "amount": float(t.get("expense", 0) or 0),
             "date": t.get("date", "")}
            for t in expenses_list
        ],
        "total_expenses": total_expenses,
        "other_income": other_income,
        "other_income_items": [
            {"description": t.get("description", ""), "amount": float(t.get("income", 0) or 0),
             "date": t.get("date", "")}
            for t in other_income_list
        ],
        "net_profit": net_profit,
        "items_sold_count": len(sold),
    }


# ----------------------------------------------------------------------------
# Balance Sheet (Neraca)
# ----------------------------------------------------------------------------
@api.get("/balance-sheet")
async def balance_sheet(user: dict = Depends(get_current_user)):
    bb = await db.beginning_balance.find_one({"user_id": user["id"]}) or _empty_balance(user["id"])

    txs = await db.transactions.find({"user_id": user["id"]}).to_list(2000)
    net_cash_change = sum(float(t.get("income", 0) or 0) - float(t.get("expense", 0) or 0) for t in txs)

    # Current jersey inventory value = sum of total cost for not sold items
    items = await db.ready_stock.find({"user_id": user["id"]}).to_list(2000)
    inventory_value = sum(_ready_total(i) for i in items if i.get("status", "").lower() != "terjual")

    kas = float(bb.get("kas", 0)) + float(bb.get("kas_bank", 0)) + net_cash_change
    piutang = float(bb.get("piutang", 0))
    persediaan_jersey = inventory_value if inventory_value > 0 else float(bb.get("persediaan_jersey", 0))
    perlengkapan_jersey = float(bb.get("perlengkapan_jersey", 0))
    perlengkapan = float(bb.get("perlengkapan", 0))
    total_aktiva = kas + piutang + persediaan_jersey + perlengkapan_jersey + perlengkapan

    # P&L for retained earnings
    pl = await profit_loss(user)
    initial_capital = (float(bb.get("kas", 0)) + float(bb.get("kas_bank", 0)) +
                       float(bb.get("piutang", 0)) + float(bb.get("persediaan_jersey", 0)) +
                       float(bb.get("perlengkapan_jersey", 0)) + float(bb.get("perlengkapan", 0)))
    laba_ditahan = pl["net_profit"]
    total_pasiva = initial_capital + laba_ditahan

    return {
        "aktiva": {
            "kas": kas,
            "piutang": piutang,
            "persediaan_jersey": persediaan_jersey,
            "perlengkapan_jersey": perlengkapan_jersey,
            "perlengkapan": perlengkapan,
            "total": total_aktiva,
        },
        "pasiva": {
            "modal": initial_capital,
            "laba_ditahan": laba_ditahan,
            "total": total_pasiva,
        },
    }


# ----------------------------------------------------------------------------
# Summary (Dashboard)
# ----------------------------------------------------------------------------
@api.get("/summary")
async def summary(user: dict = Depends(get_current_user)):
    pl = await profit_loss(user)
    bs = await balance_sheet(user)
    items = await db.ready_stock.find({"user_id": user["id"]}).to_list(2000)
    total_items = len(items)
    available = sum(1 for i in items if i.get("status", "").lower() == "tersedia")
    sold = sum(1 for i in items if i.get("status", "").lower() == "terjual")
    txs = await db.transactions.find({"user_id": user["id"]}).sort("date", -1).to_list(5)
    for t in txs:
        t.pop("_id", None)
    return {
        "total_assets": bs["aktiva"]["total"],
        "net_profit": pl["net_profit"],
        "sales": pl["sales"],
        "cogs": pl["cogs"],
        "cash_balance": bs["aktiva"]["kas"],
        "inventory_value": bs["aktiva"]["persediaan_jersey"],
        "items": {"total": total_items, "available": available, "sold": sold},
        "recent_transactions": txs,
    }


# ----------------------------------------------------------------------------
# Startup
# ----------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.ready_stock.create_index([("user_id", 1)])
    await db.transactions.create_index([("user_id", 1), ("date", 1)])
    await db.files.create_index([("storage_path", 1)])
    # Seed admin
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "email": ADMIN_EMAIL,
            "name": "Admin MF.Jersey_id",
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin seeded: {ADMIN_EMAIL}")
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
        )
    init_storage()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
