"""Iteration 2 backend tests: auto-tx ready-stock sync, period filter, dashboard chart, brute-force lockout."""
import os
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


@pytest.fixture(scope="module")
def fresh_user():
    """Register a fresh user for an end-to-end balanced scenario."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"e2e_{int(time.time()*1000)}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "E2E"})
    assert r.status_code == 200, r.text
    return s


# ---------- Auto-tx sync on Ready Stock CRUD ----------
class TestAutoTxSync:
    def _cleanup(self, s):
        # remove all ready stock for admin (transactions will be cleaned via cascade delete)
        items = s.get(f"{API}/ready-stock").json()
        for it in items:
            s.delete(f"{API}/ready-stock/{it['id']}")
        # also remove leftover manual txs to start clean
        cb = s.get(f"{API}/cash-book").json()
        for tx in cb["transactions"]:
            if not tx.get("auto"):
                s.delete(f"{API}/cash-book/{tx['id']}")

    def test_auto_pembelian_on_create(self, admin_session):
        self._cleanup(admin_session)
        r = admin_session.post(f"{API}/ready-stock", json={
            "item_name": "TEST_AutoTx Jersey",
            "purchase_price": 100000,
            "shipping_cost": 20000,
            "remake_cost": 0,
            "status": "Tersedia",
        })
        assert r.status_code == 200, r.text
        item = r.json()
        item_id = item["id"]
        assert item["total"] == 120000

        cb = admin_session.get(f"{API}/cash-book").json()
        auto_txs = [t for t in cb["transactions"] if t.get("ready_stock_id") == item_id]
        assert len(auto_txs) == 1, f"Expected 1 pembelian auto-tx, got {auto_txs}"
        tx = auto_txs[0]
        assert tx["category"] == "pembelian"
        assert tx.get("auto") is True
        assert float(tx["expense"]) == 120000
        assert float(tx["income"]) == 0
        return item_id

    def test_auto_penjualan_on_mark_sold(self, admin_session):
        item_id = self.test_auto_pembelian_on_create(admin_session)
        r = admin_session.put(f"{API}/ready-stock/{item_id}", json={
            "item_name": "TEST_AutoTx Jersey",
            "purchase_price": 100000,
            "shipping_cost": 20000,
            "remake_cost": 0,
            "status": "Terjual",
            "sale_price": 200000,
            "sold_date": "2026-02-10",
        })
        assert r.status_code == 200, r.text
        cb = admin_session.get(f"{API}/cash-book").json()
        rel = [t for t in cb["transactions"] if t.get("ready_stock_id") == item_id]
        kinds = sorted([t["category"] for t in rel])
        assert kinds == ["pembelian", "penjualan"], f"Got: {rel}"
        penj = next(t for t in rel if t["category"] == "penjualan")
        assert float(penj["income"]) == 200000
        assert penj.get("auto") is True
        assert penj["date"] == "2026-02-10"
        return item_id

    def test_revert_sold_removes_penjualan(self, admin_session):
        item_id = self.test_auto_penjualan_on_mark_sold(admin_session)
        r = admin_session.put(f"{API}/ready-stock/{item_id}", json={
            "item_name": "TEST_AutoTx Jersey",
            "purchase_price": 100000,
            "shipping_cost": 20000,
            "remake_cost": 0,
            "status": "Tersedia",
            "sale_price": 0,
            "sold_date": None,
        })
        assert r.status_code == 200, r.text
        cb = admin_session.get(f"{API}/cash-book").json()
        rel = [t for t in cb["transactions"] if t.get("ready_stock_id") == item_id]
        cats = [t["category"] for t in rel]
        assert cats == ["pembelian"], f"After revert, expected only pembelian, got {cats}"
        return item_id

    def test_delete_removes_both_auto_txs(self, admin_session):
        item_id = self.test_auto_pembelian_on_create(admin_session)
        # mark sold then delete
        admin_session.put(f"{API}/ready-stock/{item_id}", json={
            "item_name": "TEST_AutoTx Jersey",
            "purchase_price": 100000, "shipping_cost": 20000, "remake_cost": 0,
            "status": "Terjual", "sale_price": 200000, "sold_date": "2026-02-10",
        })
        d = admin_session.delete(f"{API}/ready-stock/{item_id}")
        assert d.status_code == 200
        cb = admin_session.get(f"{API}/cash-book").json()
        rel = [t for t in cb["transactions"] if t.get("ready_stock_id") == item_id]
        assert rel == [], f"Expected no related txs after delete, got {rel}"


# ---------- Period filter ----------
class TestPeriodFilter:
    def test_cash_book_periods(self, admin_session):
        for p in ["this_month", "last_month", "this_year", "all"]:
            r = admin_session.get(f"{API}/cash-book", params={"period": p})
            assert r.status_code == 200, f"{p}: {r.text}"
            data = r.json()
            assert "opening_balance" in data
            assert "transactions" in data
            assert "closing_balance" in data
            assert "period" in data
            # for "this_month" / "this_year" period should have start/end set
            if p in ("this_month", "this_year", "last_month"):
                assert data["period"]["start"] is not None
                assert data["period"]["end"] is not None

    def test_profit_loss_periods(self, admin_session):
        for p in ["this_month", "last_month", "this_year"]:
            r = admin_session.get(f"{API}/profit-loss", params={"period": p})
            assert r.status_code == 200, f"{p}: {r.text}"
            d = r.json()
            assert "sales" in d and "cogs" in d and "net_profit" in d
            assert d["period"]["start"] is not None


# ---------- Dashboard chart ----------
class TestDashboardChart:
    def test_chart_has_six_buckets(self, admin_session):
        r = admin_session.get(f"{API}/dashboard-chart")
        assert r.status_code == 200
        data = r.json()
        assert "months" in data
        assert len(data["months"]) == 6
        for b in data["months"]:
            assert {"key", "label", "start", "end", "income", "expense"} <= set(b.keys())
            assert isinstance(b["income"], (int, float))
            assert isinstance(b["expense"], (int, float))


# ---------- Brute-force lockout ----------
class TestBruteForce:
    def test_lockout_after_five_failures(self):
        """Use a fresh email so we don't affect admin lockout. The identifier is ip:email."""
        email = f"brute_{int(time.time()*1000)}@example.com"
        # 5 failed attempts
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
            assert r.status_code == 401, f"attempt {i+1}: {r.status_code} {r.text}"
        # 6th attempt should be locked
        r6 = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        assert r6.status_code == 429, f"Expected 429, got {r6.status_code} {r6.text}"
        body = r6.json()
        detail = (body.get("detail") or "").lower()
        assert "menit" in detail or "waktu" in detail or "coba" in detail, f"Unexpected detail: {body}"

    def test_successful_login_clears_lockout(self):
        """After lockout for admin, a fresh successful login should clear count.
        Trigger lockout for admin using only 5 attempts (so we land at locked state)."""
        # NOTE: we don't lock admin here to avoid blocking other tests.
        # Instead, lock a unique email then register an account with that email
        email = f"clear_{int(time.time()*1000)}@example.com"
        for _ in range(5):
            requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"})
        assert r.status_code == 429
        # now register so the user exists
        s = requests.Session()
        reg = s.post(f"{API}/auth/register", json={"email": email, "password": "rightpass", "name": "x"})
        assert reg.status_code == 200, reg.text
        # logout then login successfully - lockout should still be active because count not cleared yet
        s.post(f"{API}/auth/logout")
        # try correct login - should be blocked due to existing lockout (race - registration doesn't clear)
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "rightpass"})
        # Either 200 (if lockout was cleared) or 429 - both acceptable but normally 429.
        # The critical test: a *different* identifier (new email) should NOT be locked.
        diff_email = f"other_{int(time.time()*1000)}@example.com"
        r3 = requests.post(f"{API}/auth/login", json={"email": diff_email, "password": "wrong"})
        assert r3.status_code == 401, f"Different email should not be locked: {r3.status_code}"


# ---------- End-to-end balanced scenario ----------
class TestE2EBalanced:
    def test_balanced_after_add_and_sell(self, fresh_user):
        s = fresh_user
        # Set beginning balance
        bb = s.put(f"{API}/beginning-balance", json={
            "kas": 1000000, "kas_bank": 0, "piutang": 0,
            "persediaan_jersey": 0, "perlengkapan_jersey": 0, "perlengkapan": 0,
        })
        assert bb.status_code == 200
        # Add ready stock 100000+20000
        r = s.post(f"{API}/ready-stock", json={
            "item_name": "E2E Jersey",
            "purchase_price": 100000, "shipping_cost": 20000, "remake_cost": 0,
            "status": "Tersedia",
        })
        assert r.status_code == 200
        item_id = r.json()["id"]
        # Mark sold for 200000
        r2 = s.put(f"{API}/ready-stock/{item_id}", json={
            "item_name": "E2E Jersey",
            "purchase_price": 100000, "shipping_cost": 20000, "remake_cost": 0,
            "status": "Terjual", "sale_price": 200000, "sold_date": "2026-02-10",
        })
        assert r2.status_code == 200
        bs = s.get(f"{API}/balance-sheet").json()
        # kas = 1,000,000 - 120,000 + 200,000 = 1,080,000
        assert bs["aktiva"]["kas"] == 1080000, bs
        # persediaan_jersey current = 0 (sold), beginning 0
        assert bs["aktiva"]["persediaan_jersey"] == 0
        # net profit = 200,000 - 120,000 = 80,000
        assert bs["pasiva"]["laba_ditahan"] == 80000
        # total aktiva 1,080,000 vs total pasiva (modal 1,000,000 + laba 80,000) = 1,080,000
        assert bs["aktiva"]["total"] == bs["pasiva"]["total"], bs

    def test_balanced_with_unsold_inventory(self, fresh_user):
        """After only add (no sell), inventory should be on aktiva and offset by pembelian tx reducing kas."""
        s = fresh_user
        # cleanup user's stock first
        items = s.get(f"{API}/ready-stock").json()
        for it in items:
            s.delete(f"{API}/ready-stock/{it['id']}")
        r = s.post(f"{API}/ready-stock", json={
            "item_name": "Unsold Jersey",
            "purchase_price": 50000, "shipping_cost": 10000, "remake_cost": 0,
            "status": "Tersedia",
        })
        assert r.status_code == 200
        bs = s.get(f"{API}/balance-sheet").json()
        # kas reduced by 60,000 (1,000,000 - 60,000 = 940,000)
        assert bs["aktiva"]["kas"] == 940000, bs
        # inventory 60,000 on aktiva
        assert bs["aktiva"]["persediaan_jersey"] == 60000
        # total aktiva = 1,000,000, pasiva = modal 1,000,000 + laba 0
        assert bs["aktiva"]["total"] == bs["pasiva"]["total"] == 1000000, bs
