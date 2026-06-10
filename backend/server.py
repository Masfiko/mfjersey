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
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="lax", max_age=86400, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
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
    supplies_used: Optional[List[dict]] = None  # [{kode, qty, name?}]
    pelloff: Optional[float] = 0  # additional cost added to modal at sale time


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


class BebanIn(BaseModel):
    name: str
    amount: float = 0
    date: Optional[str] = None  # YYYY-MM-DD


class JerseySupplyIn(BaseModel):
    kode: str
    name: str
    harga: float = 0
    pcs: int = 1


class PenjualanIn(BaseModel):
    ready_stock_id: str
    sale_price: float
    sold_date: Optional[str] = None  # YYYY-MM-DD, defaults to today
    supplies_used: Optional[List[dict]] = None  # [{kode, qty}]
    pelloff: Optional[float] = 0  # additional cost added to modal


# ----------------------------------------------------------------------------
# Period helpers
# ----------------------------------------------------------------------------
def _period_range(period: Optional[str], ym: Optional[str], year: Optional[str]):
    """Return (start_iso, end_iso) inclusive YYYY-MM-DD strings or (None, None) for all."""
    today = datetime.now(timezone.utc).date()
    if ym:
        try:
            y, m = ym.split("-")
            y, m = int(y), int(m)
            start = datetime(y, m, 1).date()
            end = datetime(y + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1).date() - timedelta(days=1)
            return start.isoformat(), end.isoformat()
        except Exception:
            return None, None
    if year:
        try:
            y = int(year)
            return datetime(y, 1, 1).date().isoformat(), datetime(y, 12, 31).date().isoformat()
        except Exception:
            return None, None
    if period == "this_month":
        start = today.replace(day=1)
        next_m = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        end = next_m - timedelta(days=1)
        return start.isoformat(), end.isoformat()
    if period == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        start = last_prev.replace(day=1)
        return start.isoformat(), last_prev.isoformat()
    if period == "this_year":
        return datetime(today.year, 1, 1).date().isoformat(), datetime(today.year, 12, 31).date().isoformat()
    return None, None


def _in_range(d: str, start: Optional[str], end: Optional[str]) -> bool:
    if not d:
        return False
    if start and d < start:
        return False
    if end and d > end:
        return False
    return True


# ----------------------------------------------------------------------------
# Brute force protection
# ----------------------------------------------------------------------------
LOCKOUT_THRESHOLD = 5
LOCKOUT_WINDOW = timedelta(minutes=15)


async def _check_lockout(identifier: str):
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    count = int(rec.get("count", 0))
    last = rec.get("last_failed_at")
    if count >= LOCKOUT_THRESHOLD and last:
        try:
            last_dt = datetime.fromisoformat(last)
            elapsed = datetime.now(timezone.utc) - last_dt
            if elapsed < LOCKOUT_WINDOW:
                remaining = int((LOCKOUT_WINDOW - elapsed).total_seconds() // 60) + 1
                raise HTTPException(
                    status_code=429,
                    detail=f"Terlalu banyak percobaan gagal. Coba lagi dalam {remaining} menit.",
                )
        except ValueError:
            pass


async def _record_failed_login(identifier: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {
            "$inc": {"count": 1},
            "$set": {"last_failed_at": datetime.now(timezone.utc).isoformat()},
        },
        upsert=True,
    )


async def _clear_login_attempts(identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


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
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {
        "id": user_id, "email": email, "name": body.name, "role": "user",
        "access_token": access, "refresh_token": refresh,
    }


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower().strip()
    # Scope by email only so k8s proxy IP rotation doesn't fragment the counter.
    identifier = f"email:{email}"
    await _check_lockout(identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await _record_failed_login(identifier)
        raise HTTPException(status_code=401, detail="Email atau password salah")
    await _clear_login_attempts(identifier)
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {
        "id": user_id, "email": user["email"], "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "access_token": access, "refresh_token": refresh,
    }


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


class RefreshIn(BaseModel):
    refresh_token: Optional[str] = None


@api.post("/auth/refresh")
async def refresh_token_endpoint(request: Request, response: Response, body: Optional[RefreshIn] = None):
    # Accept refresh token from cookie OR request body
    token = request.cookies.get("refresh_token")
    if not token and body:
        token = body.refresh_token
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token tidak tersedia")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token tidak valid")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User tidak ditemukan")
        user_id = str(user["_id"])
        email = user["email"]
        access = create_access_token(user_id, email)
        refresh = create_refresh_token(user_id)
        set_auth_cookies(response, access, refresh)
        return {"ok": True, "access_token": access, "refresh_token": refresh}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesi habis. Silakan login ulang.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token tidak valid")


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----------------------------------------------------------------------------
# Ready Stock endpoints
# ----------------------------------------------------------------------------
def _ready_total(item: dict) -> float:
    return float(item.get("purchase_price", 0)) + float(item.get("shipping_cost", 0)) + float(item.get("remake_cost", 0))


def _supplies_used_cost(item: dict, supplies_lookup: dict) -> float:
    total = 0.0
    for s in (item.get("supplies_used") or []):
        kode = s.get("kode")
        qty = int(s.get("qty", 0) or 0)
        info = supplies_lookup.get(kode)
        if info and qty > 0:
            total += float(info.get("harga", 0)) * qty
    return total


def _full_cogs(item: dict, supplies_lookup: dict) -> float:
    """Total COGS for a sold item: base + supplies used + pelloff."""
    if (item.get("status") or "").lower() != "terjual":
        return _ready_total(item)
    return (
        _ready_total(item)
        + _supplies_used_cost(item, supplies_lookup)
        + float(item.get("pelloff", 0) or 0)
    )


async def _supplies_lookup(user_id: str) -> dict:
    out = {}
    async for s in db.jersey_supplies.find({"user_id": user_id}):
        out[s.get("kode")] = {"name": s.get("name"), "harga": float(s.get("harga", 0))}
    return out


def _clean_ready(item: dict) -> dict:
    item.pop("_id", None)
    item["total"] = _ready_total(item)
    return item


def _short_date(iso_or_date: Optional[str]) -> str:
    if not iso_or_date:
        return datetime.now(timezone.utc).date().isoformat()
    return iso_or_date[:10]


async def _sync_ready_stock_txs(item: dict, user_id: str):
    """Ensure derived cash-book entries (pembelian + optional penjualan) match the item."""
    total_cost = _ready_total(item)
    name = item.get("item_name", "Item")
    item_id = item["id"]
    # Pembelian (always exists)
    pembelian_doc = {
        "user_id": user_id,
        "ready_stock_id": item_id,
        "kind": "pembelian",
        "category": "pembelian",
        "date": _short_date(item.get("created_at")),
        "description": f"Pembelian {name}",
        "income": 0,
        "expense": total_cost,
        "auto": True,
    }
    existing = await db.transactions.find_one({"ready_stock_id": item_id, "kind": "pembelian"})
    if existing:
        pembelian_doc["id"] = existing["id"]
        pembelian_doc["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
        await db.transactions.update_one({"id": existing["id"]}, {"$set": pembelian_doc})
    else:
        pembelian_doc["id"] = str(uuid.uuid4())
        pembelian_doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.transactions.insert_one(pembelian_doc)

    # Penjualan (only when status == terjual and sale_price > 0)
    is_sold = item.get("status", "").lower() == "terjual"
    sale_price = float(item.get("sale_price", 0) or 0)
    existing_sale = await db.transactions.find_one({"ready_stock_id": item_id, "kind": "penjualan"})
    if is_sold and sale_price > 0:
        penjualan_doc = {
            "user_id": user_id,
            "ready_stock_id": item_id,
            "kind": "penjualan",
            "category": "penjualan",
            "date": _short_date(item.get("sold_date")),
            "description": f"Penjualan {name}",
            "income": sale_price,
            "expense": 0,
            "auto": True,
        }
        if existing_sale:
            penjualan_doc["id"] = existing_sale["id"]
            penjualan_doc["created_at"] = existing_sale.get("created_at", datetime.now(timezone.utc).isoformat())
            await db.transactions.update_one({"id": existing_sale["id"]}, {"$set": penjualan_doc})
        else:
            penjualan_doc["id"] = str(uuid.uuid4())
            penjualan_doc["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.transactions.insert_one(penjualan_doc)
    elif existing_sale:
        await db.transactions.delete_one({"id": existing_sale["id"]})


async def _validate_supplies_used(user_id: str, supplies_used, exclude_item_id: Optional[str] = None):
    """Ensure each kode exists and total qty across all sold items <= base pcs."""
    if not supplies_used:
        return
    # Pre-load all supplies by kode
    supplies = {}
    async for s in db.jersey_supplies.find({"user_id": user_id}):
        supplies[s.get("kode")] = s
    # Pre-load used map excluding the item being saved
    used_map = {}
    cursor = db.ready_stock.find({
        "user_id": user_id,
        "status": {"$regex": "^terjual$", "$options": "i"},
        "supplies_used": {"$exists": True, "$ne": None},
    })
    async for it in cursor:
        if exclude_item_id and it.get("id") == exclude_item_id:
            continue
        for s in (it.get("supplies_used") or []):
            k = s.get("kode")
            q = int(s.get("qty", 0) or 0)
            if k and q:
                used_map[k] = used_map.get(k, 0) + q
    # Validate each line
    for line in supplies_used:
        kode = (line.get("kode") or "").strip()
        qty = int(line.get("qty", 0) or 0)
        if not kode or qty <= 0:
            continue
        if kode not in supplies:
            raise HTTPException(status_code=400, detail=f"Kode '{kode}' tidak ditemukan di Perlengkapan Jersey")
        base = int(supplies[kode].get("pcs", 0) or 0)
        already_used = used_map.get(kode, 0)
        if already_used + qty > base:
            available = base - already_used
            raise HTTPException(
                status_code=400,
                detail=f"Stok '{kode}' tidak cukup. Tersisa {available} pcs.",
            )


@api.get("/ready-stock")
async def list_ready_stock(user: dict = Depends(get_current_user)):
    items = await db.ready_stock.find({"user_id": user["id"]}).sort("created_at", -1).to_list(1000)
    return [_clean_ready(i) for i in items]


@api.post("/ready-stock")
async def create_ready_stock(body: ReadyStockIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    if doc.get("status", "").lower() == "terjual":
        await _validate_supplies_used(user["id"], doc.get("supplies_used"))
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.ready_stock.insert_one(doc)
    await _sync_ready_stock_txs(doc, user["id"])
    return _clean_ready(doc)


@api.put("/ready-stock/{item_id}")
async def update_ready_stock(item_id: str, body: ReadyStockIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    if doc.get("status", "").lower() == "terjual":
        await _validate_supplies_used(user["id"], doc.get("supplies_used"), exclude_item_id=item_id)
    res = await db.ready_stock.update_one(
        {"id": item_id, "user_id": user["id"]},
        {"$set": doc},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    item = await db.ready_stock.find_one({"id": item_id, "user_id": user["id"]})
    await _sync_ready_stock_txs(item, user["id"])
    return _clean_ready(item)


@api.delete("/ready-stock/{item_id}")
async def delete_ready_stock(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.ready_stock.delete_one({"id": item_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item tidak ditemukan")
    await db.transactions.delete_many({"ready_stock_id": item_id, "user_id": user["id"]})
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
# Beban (Operational Expenses)
# ----------------------------------------------------------------------------
async def _sync_beban_tx(beban: dict, user_id: str):
    name = beban.get("name", "Beban")
    amount = float(beban.get("amount", 0) or 0)
    beban_id = beban["id"]
    date = beban.get("date") or datetime.now(timezone.utc).date().isoformat()
    doc = {
        "user_id": user_id,
        "beban_id": beban_id,
        "kind": "beban",
        "category": "biaya",
        "date": date,
        "description": f"Beban: {name}",
        "income": 0,
        "expense": amount,
        "auto": True,
    }
    existing = await db.transactions.find_one({"beban_id": beban_id, "kind": "beban"})
    if existing:
        doc["id"] = existing["id"]
        doc["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
        await db.transactions.update_one({"id": existing["id"]}, {"$set": doc})
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.transactions.insert_one(doc)


@api.get("/beban")
async def list_beban(
    user: dict = Depends(get_current_user),
    period: Optional[str] = Query(None),
    ym: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
):
    start, end = _period_range(period, ym, year)
    items = await db.beban.find({"user_id": user["id"]}).sort("created_at", -1).to_list(2000)
    result = []
    for i in items:
        i.pop("_id", None)
        if not start or _in_range((i.get("date") or "")[:10], start, end):
            result.append(i)
    return result


@api.post("/beban")
async def create_beban(body: BebanIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.beban.insert_one(doc)
    await _sync_beban_tx(doc, user["id"])
    doc.pop("_id", None)
    return doc


@api.put("/beban/{beban_id}")
async def update_beban(beban_id: str, body: BebanIn, user: dict = Depends(get_current_user)):
    res = await db.beban.update_one(
        {"id": beban_id, "user_id": user["id"]},
        {"$set": body.model_dump()},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Beban tidak ditemukan")
    doc = await db.beban.find_one({"id": beban_id, "user_id": user["id"]})
    await _sync_beban_tx(doc, user["id"])
    doc.pop("_id", None)
    return doc


@api.delete("/beban/{beban_id}")
async def delete_beban(beban_id: str, user: dict = Depends(get_current_user)):
    res = await db.beban.delete_one({"id": beban_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Beban tidak ditemukan")
    await db.transactions.delete_many({"beban_id": beban_id, "user_id": user["id"]})
    return {"ok": True}


# ----------------------------------------------------------------------------
# Perlengkapan Jersey (Jersey Supplies inventory)
# ----------------------------------------------------------------------------
def _supply_total(item: dict) -> float:
    return float(item.get("harga", 0)) * int(item.get("pcs", 0) or 0)


def _clean_supply(item: dict) -> dict:
    item.pop("_id", None)
    item["total"] = _supply_total(item)
    return item


async def _sync_supply_tx(item: dict, user_id: str):
    total = _supply_total(item)
    name = item.get("name", "Perlengkapan")
    item_id = item["id"]
    doc = {
        "user_id": user_id,
        "supply_id": item_id,
        "kind": "supply",
        "category": "pembelian",
        "date": (item.get("created_at") or datetime.now(timezone.utc).isoformat())[:10],
        "description": f"Perlengkapan: {name} ({item.get('pcs', 0)} pcs)",
        "income": 0,
        "expense": total,
        "auto": True,
    }
    existing = await db.transactions.find_one({"supply_id": item_id, "kind": "supply"})
    if existing:
        doc["id"] = existing["id"]
        doc["created_at"] = existing.get("created_at", datetime.now(timezone.utc).isoformat())
        await db.transactions.update_one({"id": existing["id"]}, {"$set": doc})
    else:
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.transactions.insert_one(doc)


async def _supplies_used_map(user_id: str) -> dict:
    """Return { kode: total_qty_used } across all Terjual ready_stock items."""
    cursor = db.ready_stock.find({
        "user_id": user_id,
        "status": {"$regex": "^terjual$", "$options": "i"},
        "supplies_used": {"$exists": True, "$ne": None},
    })
    used = {}
    async for item in cursor:
        for s in (item.get("supplies_used") or []):
            kode = s.get("kode")
            qty = int(s.get("qty", 0) or 0)
            if kode and qty:
                used[kode] = used.get(kode, 0) + qty
    return used


@api.get("/jersey-supplies")
async def list_supplies(user: dict = Depends(get_current_user)):
    items = await db.jersey_supplies.find({"user_id": user["id"]}).sort("created_at", -1).to_list(2000)
    used_map = await _supplies_used_map(user["id"])
    result = []
    for i in items:
        cleaned = _clean_supply(i)
        used = int(used_map.get(cleaned.get("kode") or "", 0))
        cleaned["pcs_used"] = used
        cleaned["pcs_left"] = max(0, int(cleaned.get("pcs", 0) or 0) - used)
        result.append(cleaned)
    return result


@api.post("/jersey-supplies")
async def create_supply(body: JerseySupplyIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["kode"] = (doc.get("kode") or "").strip()
    if not doc["kode"]:
        raise HTTPException(status_code=400, detail="Kode barang wajib diisi")
    if await db.jersey_supplies.find_one({"user_id": user["id"], "kode": doc["kode"]}):
        raise HTTPException(status_code=400, detail=f"Kode '{doc['kode']}' sudah dipakai")
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = user["id"]
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.jersey_supplies.insert_one(doc)
    await _sync_supply_tx(doc, user["id"])
    return _clean_supply(doc)


@api.put("/jersey-supplies/{item_id}")
async def update_supply(item_id: str, body: JerseySupplyIn, user: dict = Depends(get_current_user)):
    payload = body.model_dump()
    payload["kode"] = (payload.get("kode") or "").strip()
    if not payload["kode"]:
        raise HTTPException(status_code=400, detail="Kode barang wajib diisi")
    dup = await db.jersey_supplies.find_one({
        "user_id": user["id"], "kode": payload["kode"], "id": {"$ne": item_id},
    })
    if dup:
        raise HTTPException(status_code=400, detail=f"Kode '{payload['kode']}' sudah dipakai")
    res = await db.jersey_supplies.update_one(
        {"id": item_id, "user_id": user["id"]},
        {"$set": payload},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Perlengkapan tidak ditemukan")
    doc = await db.jersey_supplies.find_one({"id": item_id, "user_id": user["id"]})
    await _sync_supply_tx(doc, user["id"])
    return _clean_supply(doc)


@api.delete("/jersey-supplies/{item_id}")
async def delete_supply(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.jersey_supplies.delete_one({"id": item_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Perlengkapan tidak ditemukan")
    await db.transactions.delete_many({"supply_id": item_id, "user_id": user["id"]})
    return {"ok": True}


# ----------------------------------------------------------------------------
# Penjualan (Sales) — view & flow over Ready Stock
# ----------------------------------------------------------------------------
@api.get("/penjualan")
async def list_penjualan(
    user: dict = Depends(get_current_user),
    period: Optional[str] = Query(None),
    ym: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
):
    start, end = _period_range(period, ym, year)
    items = await db.ready_stock.find({
        "user_id": user["id"],
        "status": {"$regex": "^terjual$", "$options": "i"},
    }).sort("sold_date", -1).to_list(2000)

    supplies_lookup = await _supplies_lookup(user["id"])

    result = []
    for i in items:
        i.pop("_id", None)
        sd = (i.get("sold_date") or "")[:10]
        if start and not _in_range(sd, start, end):
            continue
        base_cost = _ready_total(i)
        supplies_cost = _supplies_used_cost(i, supplies_lookup)
        pelloff = float(i.get("pelloff", 0) or 0)
        cogs = base_cost + supplies_cost + pelloff
        sale_price = float(i.get("sale_price", 0) or 0)
        # Enrich supplies_used with name + line cost
        enriched = []
        for s in (i.get("supplies_used") or []):
            kode = s.get("kode")
            info = supplies_lookup.get(kode, {})
            qty = int(s.get("qty", 0) or 0)
            enriched.append({
                "kode": kode,
                "qty": qty,
                "name": info.get("name") or kode,
                "harga": float(info.get("harga", 0)),
                "subtotal": float(info.get("harga", 0)) * qty,
            })
        result.append({
            "id": i["id"],
            "ready_stock_id": i["id"],
            "item_name": i.get("item_name"),
            "image_path": i.get("image_path"),
            "purchase_price": float(i.get("purchase_price", 0) or 0),
            "shipping_cost": float(i.get("shipping_cost", 0) or 0),
            "remake_cost": float(i.get("remake_cost", 0) or 0),
            "base_cost": base_cost,
            "supplies_cost": supplies_cost,
            "pelloff": pelloff,
            "cogs": cogs,
            "sale_price": sale_price,
            "profit": sale_price - cogs,
            "sold_date": sd,
            "supplies_used": enriched,
        })
    return result


@api.post("/penjualan")
async def create_penjualan(body: PenjualanIn, user: dict = Depends(get_current_user)):
    item = await db.ready_stock.find_one({"id": body.ready_stock_id, "user_id": user["id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Item Ready Stock tidak ditemukan")
    if (item.get("status") or "").lower() == "terjual":
        raise HTTPException(status_code=400, detail="Item ini sudah terjual")
    supplies_used = body.supplies_used or []
    await _validate_supplies_used(user["id"], supplies_used, exclude_item_id=body.ready_stock_id)
    sold_date = body.sold_date or datetime.now(timezone.utc).date().isoformat()
    update = {
        "status": "Terjual",
        "sale_price": float(body.sale_price or 0),
        "sold_date": sold_date,
        "supplies_used": supplies_used,
        "pelloff": float(body.pelloff or 0),
    }
    await db.ready_stock.update_one(
        {"id": body.ready_stock_id, "user_id": user["id"]},
        {"$set": update},
    )
    item.update(update)
    await _sync_ready_stock_txs(item, user["id"])
    return {"ok": True, "id": body.ready_stock_id}


@api.delete("/penjualan/{ready_stock_id}")
async def revert_penjualan(ready_stock_id: str, user: dict = Depends(get_current_user)):
    item = await db.ready_stock.find_one({"id": ready_stock_id, "user_id": user["id"]})
    if not item:
        raise HTTPException(status_code=404, detail="Penjualan tidak ditemukan")
    update = {
        "status": "Tersedia",
        "sale_price": 0,
        "sold_date": None,
        "supplies_used": [],
        "pelloff": 0,
    }
    await db.ready_stock.update_one(
        {"id": ready_stock_id, "user_id": user["id"]},
        {"$set": update},
    )
    item.update(update)
    await _sync_ready_stock_txs(item, user["id"])
    return {"ok": True}


# Pelloff log: list of sold items that had a pelloff cost
@api.get("/penjualan/pelloff")
async def list_pelloff(
    user: dict = Depends(get_current_user),
    period: Optional[str] = Query(None),
    ym: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
):
    start, end = _period_range(period, ym, year)
    items = await db.ready_stock.find({
        "user_id": user["id"],
        "status": {"$regex": "^terjual$", "$options": "i"},
        "pelloff": {"$gt": 0},
    }).sort("sold_date", -1).to_list(2000)
    result = []
    for i in items:
        i.pop("_id", None)
        sd = (i.get("sold_date") or "")[:10]
        if start and not _in_range(sd, start, end):
            continue
        result.append({
            "id": i["id"],
            "ready_stock_id": i["id"],
            "item_name": i.get("item_name"),
            "image_path": i.get("image_path"),
            "sold_date": sd,
            "sale_price": float(i.get("sale_price", 0) or 0),
            "pelloff": float(i.get("pelloff", 0) or 0),
        })
    return result


@api.put("/penjualan/{ready_stock_id}/pelloff")
async def update_pelloff(
    ready_stock_id: str,
    body: dict,
    user: dict = Depends(get_current_user),
):
    pelloff = float(body.get("pelloff", 0) or 0)
    if pelloff < 0:
        raise HTTPException(status_code=400, detail="Pelloff tidak boleh negatif")
    item = await db.ready_stock.find_one({"id": ready_stock_id, "user_id": user["id"]})
    if not item or (item.get("status") or "").lower() != "terjual":
        raise HTTPException(status_code=404, detail="Penjualan tidak ditemukan")
    await db.ready_stock.update_one(
        {"id": ready_stock_id, "user_id": user["id"]},
        {"$set": {"pelloff": pelloff}},
    )
    return {"ok": True, "pelloff": pelloff}


# ----------------------------------------------------------------------------
# Bank Cash Book
# ----------------------------------------------------------------------------
@api.get("/cash-book")
async def list_cash_book(
    user: dict = Depends(get_current_user),
    period: Optional[str] = Query(None),
    ym: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
):
    start, end = _period_range(period, ym, year)
    txs = await db.transactions.find({"user_id": user["id"]}).sort("date", 1).to_list(5000)
    bb = await db.beginning_balance.find_one({"user_id": user["id"]}) or {}
    bb_total = float(bb.get("kas", 0)) + float(bb.get("kas_bank", 0))

    opening_balance = bb_total
    in_period = []
    for tx in txs:
        tx.pop("_id", None)
        d = tx.get("date", "")
        if start and d and d < start:
            opening_balance += float(tx.get("income", 0)) - float(tx.get("expense", 0))
        elif _in_range(d, start, end):
            in_period.append(tx)
        # txs after period are ignored for the listing

    balance = opening_balance
    result = []
    for tx in in_period:
        balance += float(tx.get("income", 0)) - float(tx.get("expense", 0))
        tx["balance"] = balance
        result.append(tx)
    return {
        "opening_balance": opening_balance,
        "transactions": result,
        "closing_balance": balance,
        "period": {"start": start, "end": end},
    }


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
async def profit_loss(
    user: dict = Depends(get_current_user),
    period: Optional[str] = Query(None),
    ym: Optional[str] = Query(None),
    year: Optional[str] = Query(None),
):
    start, end = _period_range(period, ym, year)
    # Sales = sum of sale_price for terjual items in period
    items = await db.ready_stock.find({"user_id": user["id"]}).to_list(2000)
    supplies_lookup = await _supplies_lookup(user["id"])
    sold = []
    for i in items:
        if i.get("status", "").lower() != "terjual":
            continue
        sd = (i.get("sold_date") or "")[:10]
        if not start or _in_range(sd, start, end):
            sold.append(i)
    sales = sum(float(i.get("sale_price", 0) or 0) for i in sold)
    cogs = sum(_full_cogs(i, supplies_lookup) for i in sold)
    gross_profit = sales - cogs

    txs = await db.transactions.find({"user_id": user["id"]}).to_list(5000)
    in_period_txs = [t for t in txs if not start or _in_range(t.get("date", ""), start, end)]
    expenses_list = [t for t in in_period_txs if t.get("category") == "biaya"]
    other_income_list = [t for t in in_period_txs if t.get("category") == "pendapatan_lain"]
    total_expenses = sum(float(t.get("expense", 0) or 0) for t in expenses_list)
    other_income = sum(float(t.get("income", 0) or 0) for t in other_income_list)

    net_profit = gross_profit - total_expenses + other_income

    return {
        "period": {"start": start, "end": end},
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

    txs = await db.transactions.find({"user_id": user["id"]}).to_list(5000)
    net_cash_change = sum(float(t.get("income", 0) or 0) - float(t.get("expense", 0) or 0) for t in txs)

    # Current jersey inventory value = sum of total cost for not sold items
    items = await db.ready_stock.find({"user_id": user["id"]}).to_list(2000)
    current_inventory = sum(_ready_total(i) for i in items if i.get("status", "").lower() != "terjual")

    # Current perlengkapan_jersey value = sum of remaining stock (harga × pcs_left)
    supplies = await db.jersey_supplies.find({"user_id": user["id"]}).to_list(2000)
    used_map = await _supplies_used_map(user["id"])
    supplies_value = 0.0
    for s in supplies:
        pcs = int(s.get("pcs", 0) or 0)
        used = int(used_map.get(s.get("kode") or "", 0))
        pcs_left = max(0, pcs - used)
        supplies_value += float(s.get("harga", 0)) * pcs_left

    kas = float(bb.get("kas", 0)) + float(bb.get("kas_bank", 0)) + net_cash_change
    piutang = float(bb.get("piutang", 0))
    persediaan_jersey = float(bb.get("persediaan_jersey", 0)) + current_inventory
    perlengkapan_jersey = float(bb.get("perlengkapan_jersey", 0)) + supplies_value
    perlengkapan = float(bb.get("perlengkapan", 0))
    total_aktiva = kas + piutang + persediaan_jersey + perlengkapan_jersey + perlengkapan

    # P&L for retained earnings (all-time)
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


@api.get("/dashboard-chart")
async def dashboard_chart(user: dict = Depends(get_current_user)):
    """Return last 6 months income vs expense aggregated."""
    today = datetime.now(timezone.utc).date()
    buckets = []
    for i in range(5, -1, -1):
        # walk back i months
        y, m = today.year, today.month
        for _ in range(i):
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        start = datetime(y, m, 1).date()
        next_y, next_m = (y + 1, 1) if m == 12 else (y, m + 1)
        end = datetime(next_y, next_m, 1).date() - timedelta(days=1)
        buckets.append({
            "key": f"{y:04d}-{m:02d}",
            "label": start.strftime("%b %Y"),
            "start": start.isoformat(),
            "end": end.isoformat(),
            "income": 0.0,
            "expense": 0.0,
        })

    txs = await db.transactions.find({"user_id": user["id"]}).to_list(5000)
    for tx in txs:
        d = (tx.get("date") or "")[:10]
        if not d:
            continue
        for b in buckets:
            if b["start"] <= d <= b["end"]:
                b["income"] += float(tx.get("income", 0) or 0)
                b["expense"] += float(tx.get("expense", 0) or 0)
                break
    return {"months": buckets}


# ----------------------------------------------------------------------------
# Startup
# ----------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.ready_stock.create_index([("user_id", 1)])
    await db.transactions.create_index([("user_id", 1), ("date", 1)])
    await db.transactions.create_index([("ready_stock_id", 1)])
    await db.transactions.create_index([("beban_id", 1)])
    await db.transactions.create_index([("supply_id", 1)])
    await db.beban.create_index([("user_id", 1)])
    await db.jersey_supplies.create_index([("user_id", 1)])
    await db.login_attempts.create_index("identifier")
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
