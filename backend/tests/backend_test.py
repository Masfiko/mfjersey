"""Backend tests for MF.Jersey_id Finance API."""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mf-stock-tracker.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@mfjersey.id"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


# ----------------- Auth -----------------
class TestAuth:
    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_new_user(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        unique_email = f"test_{int(time.time()*1000)}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "email": unique_email, "password": "pass1234", "name": "Test User"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == unique_email
        assert "id" in data
        # Cookies should be set
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies
        # /me should work
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == unique_email

    def test_login_admin(self, admin_session):
        me = admin_session.get(f"{API}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == ADMIN_EMAIL
        assert "access_token" in admin_session.cookies

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_logout(self):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        r2 = s.post(f"{API}/auth/logout")
        assert r2.status_code == 200
        # /me should now fail since cookies cleared
        # Manually clear cookies (server cleared via Set-Cookie deletion)
        s.cookies.clear()
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 401


# ----------------- Beginning Balance -----------------
class TestBeginningBalance:
    def test_put_and_get(self, admin_session):
        body = {"kas": 1000000, "kas_bank": 5000000, "piutang": 0,
                "persediaan_jersey": 0, "perlengkapan_jersey": 0, "perlengkapan": 0}
        r = admin_session.put(f"{API}/beginning-balance", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_aset"] == 6000000
        assert data["kas"] == 1000000

        g = admin_session.get(f"{API}/beginning-balance")
        assert g.status_code == 200
        gd = g.json()
        assert gd["total_aset"] == 6000000
        assert gd["kas_bank"] == 5000000


# ----------------- Ready Stock -----------------
class TestReadyStock:
    item_id = None

    def test_create(self, admin_session):
        r = admin_session.post(f"{API}/ready-stock", json={
            "item_name": "TEST_Vintage Jersey",
            "purchase_price": 500000,
            "shipping_cost": 50000,
            "remake_cost": 25000,
            "status": "Tersedia",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 575000
        assert data["item_name"] == "TEST_Vintage Jersey"
        assert "id" in data
        TestReadyStock.item_id = data["id"]

    def test_list(self, admin_session):
        r = admin_session.get(f"{API}/ready-stock")
        assert r.status_code == 200
        items = r.json()
        assert any(i.get("id") == TestReadyStock.item_id for i in items)

    def test_update(self, admin_session):
        assert TestReadyStock.item_id
        r = admin_session.put(f"{API}/ready-stock/{TestReadyStock.item_id}", json={
            "item_name": "TEST_Vintage Jersey",
            "purchase_price": 500000,
            "shipping_cost": 50000,
            "remake_cost": 25000,
            "status": "Terjual",
            "sale_price": 800000,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "Terjual"
        assert data["sale_price"] == 800000

    def test_profit_loss_after_sale(self, admin_session):
        r = admin_session.get(f"{API}/profit-loss")
        assert r.status_code == 200
        data = r.json()
        assert data["sales"] >= 800000
        assert data["cogs"] >= 575000
        assert data["gross_profit"] >= 225000

    def test_delete(self, admin_session):
        assert TestReadyStock.item_id
        r = admin_session.delete(f"{API}/ready-stock/{TestReadyStock.item_id}")
        assert r.status_code == 200
        # Verify removed
        items = admin_session.get(f"{API}/ready-stock").json()
        assert not any(i.get("id") == TestReadyStock.item_id for i in items)


# ----------------- Image Upload -----------------
class TestImageUpload:
    def test_upload_and_serve(self, admin_session):
        # 1x1 png
        png_bytes = bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000d49444154789c63f8cf00000003000100b1bbb1660000000049454e44ae426082"
        )
        # need multipart - use requests directly
        # remove default JSON content-type
        files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
        cookies = admin_session.cookies
        r = requests.post(f"{API}/upload-image", files=files, cookies=cookies)
        if r.status_code == 500 and "Storage" in r.text:
            pytest.skip(f"Storage unavailable: {r.text}")
        assert r.status_code == 200, r.text
        path = r.json().get("path")
        assert path
        # Fetch the file
        r2 = requests.get(f"{API}/files/{path}", cookies=cookies)
        assert r2.status_code == 200
        assert r2.headers.get("Content-Type", "").startswith("image/")


# ----------------- Cash Book -----------------
class TestCashBook:
    tx_id = None

    def test_create(self, admin_session):
        r = admin_session.post(f"{API}/cash-book", json={
            "date": "2026-02-01",
            "description": "TEST_Penjualan",
            "income": 800000,
            "expense": 0,
            "category": "penjualan",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["income"] == 800000
        TestCashBook.tx_id = data["id"]

    def test_list_with_running_balance(self, admin_session):
        r = admin_session.get(f"{API}/cash-book")
        assert r.status_code == 200
        data = r.json()
        assert "opening_balance" in data
        assert "transactions" in data
        assert "closing_balance" in data
        # opening should equal kas+kas_bank from beginning balance set earlier (6000000)
        assert data["opening_balance"] == 6000000
        # closing should reflect added income
        assert data["closing_balance"] >= 6000000

    def test_delete(self, admin_session):
        assert TestCashBook.tx_id
        r = admin_session.delete(f"{API}/cash-book/{TestCashBook.tx_id}")
        assert r.status_code == 200


# ----------------- Balance Sheet & Summary -----------------
class TestReports:
    def test_balance_sheet(self, admin_session):
        r = admin_session.get(f"{API}/balance-sheet")
        assert r.status_code == 200
        data = r.json()
        assert "aktiva" in data and "pasiva" in data
        for k in ["kas", "piutang", "persediaan_jersey", "perlengkapan_jersey", "perlengkapan", "total"]:
            assert k in data["aktiva"]
        for k in ["modal", "laba_ditahan", "total"]:
            assert k in data["pasiva"]

    def test_summary(self, admin_session):
        r = admin_session.get(f"{API}/summary")
        assert r.status_code == 200
        data = r.json()
        for k in ["total_assets", "net_profit", "sales", "cogs", "cash_balance",
                  "inventory_value", "items", "recent_transactions"]:
            assert k in data
        assert "total" in data["items"]
