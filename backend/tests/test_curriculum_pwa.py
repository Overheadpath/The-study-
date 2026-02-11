"""
Test suite for Global Curriculum Support and PWA features
Tests:
- Registration with curriculum selection
- Login returns curriculum
- PWA manifest.json accessibility
- Service worker accessibility
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestPWAFeatures:
    """PWA manifest and service worker tests"""
    
    def test_manifest_json_accessible(self):
        """Test that manifest.json is accessible at /manifest.json"""
        response = requests.get(f"{BASE_URL}/manifest.json")
        assert response.status_code == 200, f"manifest.json not accessible: {response.status_code}"
        
        data = response.json()
        assert "name" in data, "manifest.json missing 'name' field"
        assert data["name"] == "Study Helper", f"Unexpected app name: {data['name']}"
        assert "icons" in data, "manifest.json missing 'icons' field"
        assert len(data["icons"]) > 0, "manifest.json has no icons"
        assert "display" in data, "manifest.json missing 'display' field"
        assert data["display"] == "standalone", f"Unexpected display mode: {data['display']}"
        print(f"✓ manifest.json accessible with {len(data['icons'])} icons")
    
    def test_service_worker_accessible(self):
        """Test that service-worker.js is accessible"""
        response = requests.get(f"{BASE_URL}/service-worker.js")
        assert response.status_code == 200, f"service-worker.js not accessible: {response.status_code}"
        
        content = response.text
        assert "CACHE_NAME" in content, "service-worker.js missing CACHE_NAME"
        assert "install" in content, "service-worker.js missing install event"
        assert "fetch" in content, "service-worker.js missing fetch event"
        print("✓ service-worker.js accessible and contains required event handlers")


class TestCurriculumRegistration:
    """Tests for curriculum selection during registration"""
    
    def test_register_with_caps_curriculum(self):
        """Test registration with CAPS (South Africa) curriculum"""
        unique_email = f"test_caps_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "CAPS Test Family",
            "curriculum": "caps"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert "id" in data, "Response missing 'id'"
        assert data["email"] == unique_email, f"Email mismatch: {data['email']}"
        assert data["curriculum"] == "caps", f"Curriculum mismatch: {data.get('curriculum')}"
        assert data["family_name"] == "CAPS Test Family", f"Family name mismatch: {data['family_name']}"
        print(f"✓ Registered with CAPS curriculum: {unique_email}")
        
        return data["id"]
    
    def test_register_with_common_core_curriculum(self):
        """Test registration with Common Core (US) curriculum"""
        unique_email = f"test_cc_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "Common Core Family",
            "curriculum": "common_core"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["curriculum"] == "common_core", f"Curriculum mismatch: {data.get('curriculum')}"
        print(f"✓ Registered with Common Core curriculum: {unique_email}")
    
    def test_register_with_uk_national_curriculum(self):
        """Test registration with UK National curriculum"""
        unique_email = f"test_uk_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "UK Test Family",
            "curriculum": "uk_national"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["curriculum"] == "uk_national", f"Curriculum mismatch: {data.get('curriculum')}"
        print(f"✓ Registered with UK National curriculum: {unique_email}")
    
    def test_register_with_cbse_curriculum(self):
        """Test registration with CBSE (India) curriculum"""
        unique_email = f"test_cbse_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "CBSE Test Family",
            "curriculum": "cbse"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["curriculum"] == "cbse", f"Curriculum mismatch: {data.get('curriculum')}"
        print(f"✓ Registered with CBSE curriculum: {unique_email}")
    
    def test_register_with_ib_curriculum(self):
        """Test registration with IB (International Baccalaureate) curriculum"""
        unique_email = f"test_ib_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "IB Test Family",
            "curriculum": "ib"
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        assert data["curriculum"] == "ib", f"Curriculum mismatch: {data.get('curriculum')}"
        print(f"✓ Registered with IB curriculum: {unique_email}")
    
    def test_register_default_curriculum(self):
        """Test registration without specifying curriculum defaults to CAPS"""
        unique_email = f"test_default_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "Default Curriculum Family"
            # No curriculum specified
        })
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Should default to 'caps'
        assert data["curriculum"] == "caps", f"Default curriculum should be 'caps', got: {data.get('curriculum')}"
        print(f"✓ Default curriculum is 'caps' when not specified")


class TestCurriculumLogin:
    """Tests for curriculum returned in login response"""
    
    def test_login_returns_curriculum(self):
        """Test that login response includes curriculum field"""
        # First register a user with specific curriculum
        unique_email = f"test_login_curr_{uuid.uuid4().hex[:8]}@test.com"
        
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "Login Curriculum Test",
            "curriculum": "cambridge"
        })
        assert reg_response.status_code == 200, f"Registration failed: {reg_response.text}"
        
        # Now login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": unique_email,
            "password": "TestPass123"
        })
        
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        data = login_response.json()
        
        assert "curriculum" in data, "Login response missing 'curriculum' field"
        assert data["curriculum"] == "cambridge", f"Curriculum mismatch in login: {data.get('curriculum')}"
        print(f"✓ Login returns curriculum: {data['curriculum']}")
    
    def test_get_family_returns_curriculum(self):
        """Test that GET /auth/family/{id} returns curriculum"""
        # Register a user
        unique_email = f"test_family_curr_{uuid.uuid4().hex[:8]}@test.com"
        
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "Family Curriculum Test",
            "curriculum": "german"
        })
        assert reg_response.status_code == 200
        family_id = reg_response.json()["id"]
        
        # Get family info
        get_response = requests.get(f"{BASE_URL}/api/auth/family/{family_id}")
        
        assert get_response.status_code == 200, f"Get family failed: {get_response.text}"
        data = get_response.json()
        
        assert "curriculum" in data, "Family response missing 'curriculum' field"
        assert data["curriculum"] == "german", f"Curriculum mismatch: {data.get('curriculum')}"
        print(f"✓ GET family returns curriculum: {data['curriculum']}")


class TestAllCurriculums:
    """Test all 11 supported curriculums"""
    
    CURRICULUMS = [
        ("caps", "South Africa"),
        ("common_core", "United States"),
        ("uk_national", "United Kingdom"),
        ("australian", "Australia"),
        ("cbse", "India"),
        ("cambridge", "International"),
        ("ib", "International"),
        ("canadian", "Canada"),
        ("german", "Germany"),
        ("french", "France"),
        ("other", "Worldwide")
    ]
    
    @pytest.mark.parametrize("curriculum_id,country", CURRICULUMS)
    def test_register_with_curriculum(self, curriculum_id, country):
        """Test registration with each supported curriculum"""
        unique_email = f"test_{curriculum_id}_{uuid.uuid4().hex[:6]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": f"{country} Test Family",
            "curriculum": curriculum_id
        })
        
        assert response.status_code == 200, f"Registration with {curriculum_id} failed: {response.text}"
        data = response.json()
        
        assert data["curriculum"] == curriculum_id, f"Curriculum mismatch for {curriculum_id}: {data.get('curriculum')}"
        print(f"✓ {curriculum_id} ({country}) curriculum registration works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
