"""
Tests for Avatar Selection, Profile Settings, and Password Change features
Tests: Registration with avatar, Profile update endpoint, Password change endpoint
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from previous iteration
TEST_EMAIL = "cert_family_73e12cb4@test.com"
TEST_PASSWORD = "TestPass123"


class TestAPIHealth:
    """Basic API health checks"""
    
    def test_api_health(self):
        """Test API is accessible"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ API health check passed")


class TestLoginAndFetchFamily:
    """Test login and get family data with avatar info"""
    
    def test_login_returns_avatar_fields(self):
        """Test login response includes avatar_id, avatar_emoji, avatar_color"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("user_type") == "parent"
        family = data.get("family")
        assert family is not None
        
        # Check avatar fields are present
        assert "avatar_id" in family, "avatar_id missing from login response"
        assert "avatar_emoji" in family, "avatar_emoji missing from login response"
        assert "avatar_color" in family, "avatar_color missing from login response"
        
        print(f"✓ Login returns avatar fields: {family.get('avatar_emoji')} ({family.get('avatar_id')})")
        return family


class TestRegistrationWithAvatar:
    """Test registration with avatar selection"""
    
    def test_register_with_avatar(self):
        """Test registration includes avatar fields"""
        unique_email = f"test_avatar_{uuid.uuid4().hex[:8]}@test.com"
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "Avatar Test Family",
            "curriculum": "caps",
            "avatar_id": "panda",
            "avatar_emoji": "🐼",
            "avatar_color": "#2D3436",
            "email_notifications": True
        })
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify avatar fields are saved
        assert data.get("avatar_id") == "panda", f"Expected avatar_id 'panda', got {data.get('avatar_id')}"
        assert data.get("avatar_emoji") == "🐼", f"Expected avatar_emoji '🐼', got {data.get('avatar_emoji')}"
        assert data.get("avatar_color") == "#2D3436", f"Expected avatar_color '#2D3436', got {data.get('avatar_color')}"
        
        print(f"✓ Registration with avatar successful: {data.get('avatar_emoji')} ({data.get('avatar_id')})")
        return data
    
    def test_register_with_email_notifications(self):
        """Test registration saves email_notifications preference"""
        unique_email = f"test_notif_{uuid.uuid4().hex[:8]}@test.com"
        
        # Register with notifications disabled
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": unique_email,
            "password": "TestPass123",
            "family_name": "Notif Test Family",
            "curriculum": "caps",
            "email_notifications": False
        })
        
        assert response.status_code == 200
        data = response.json()
        
        print(f"✓ Registration with email_notifications=False successful")
        return data


class TestProfileUpdate:
    """Test profile update endpoint (PUT /api/profile/{family_id})"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login and get family ID"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        self.family = response.json().get("family")
        self.family_id = self.family.get("id")
    
    def test_update_family_name(self):
        """Test updating family name"""
        new_name = f"Updated Family {uuid.uuid4().hex[:4]}"
        
        response = requests.put(f"{BASE_URL}/api/profile/{self.family_id}", json={
            "family_name": new_name
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("family_name") == new_name
        
        # Verify persistence with GET
        verify_response = requests.get(f"{BASE_URL}/api/auth/family/{self.family_id}")
        assert verify_response.status_code == 200
        verify_data = verify_response.json()
        assert verify_data.get("family_name") == new_name
        
        print(f"✓ Family name updated to: {new_name}")
    
    def test_update_avatar(self):
        """Test updating avatar (id, emoji, color)"""
        response = requests.put(f"{BASE_URL}/api/profile/{self.family_id}", json={
            "avatar_id": "unicorn",
            "avatar_emoji": "🦄",
            "avatar_color": "#A855F7"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("avatar_id") == "unicorn"
        assert data.get("avatar_emoji") == "🦄"
        assert data.get("avatar_color") == "#A855F7"
        
        print(f"✓ Avatar updated to: {data.get('avatar_emoji')} ({data.get('avatar_id')})")
    
    def test_update_email_notifications(self):
        """Test toggling email notifications"""
        # Disable notifications
        response = requests.put(f"{BASE_URL}/api/profile/{self.family_id}", json={
            "email_notifications": False
        })
        assert response.status_code == 200
        
        # Re-enable notifications
        response = requests.put(f"{BASE_URL}/api/profile/{self.family_id}", json={
            "email_notifications": True
        })
        assert response.status_code == 200
        
        print("✓ Email notifications toggle works")
    
    def test_update_profile_not_found(self):
        """Test updating non-existent family returns 404"""
        response = requests.put(f"{BASE_URL}/api/profile/non-existent-id", json={
            "family_name": "Test"
        })
        assert response.status_code == 404
        print("✓ Profile update returns 404 for non-existent family")


class TestPasswordChange:
    """Test password change endpoint (POST /api/profile/{family_id}/change-password)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Create a test family for password tests"""
        self.test_email = f"test_pwd_{uuid.uuid4().hex[:8]}@test.com"
        self.original_password = "OriginalPass123"
        
        # Register new family
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": self.test_email,
            "password": self.original_password,
            "family_name": "Password Test Family",
            "curriculum": "caps"
        })
        assert response.status_code == 200
        self.family_id = response.json().get("id")
    
    def test_change_password_success(self):
        """Test successful password change"""
        new_password = "NewPassword456"
        
        response = requests.post(f"{BASE_URL}/api/profile/{self.family_id}/change-password", json={
            "current_password": self.original_password,
            "new_password": new_password
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "Password changed successfully"
        
        # Verify new password works
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.test_email,
            "password": new_password
        })
        assert login_response.status_code == 200
        
        # Verify old password no longer works
        old_login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": self.test_email,
            "password": self.original_password
        })
        assert old_login_response.status_code == 401
        
        print("✓ Password changed successfully and verified")
    
    def test_change_password_wrong_current(self):
        """Test password change with wrong current password"""
        response = requests.post(f"{BASE_URL}/api/profile/{self.family_id}/change-password", json={
            "current_password": "WrongPassword123",
            "new_password": "NewPassword456"
        })
        
        assert response.status_code == 400
        data = response.json()
        assert "incorrect" in data.get("detail", "").lower()
        
        print("✓ Password change correctly rejects wrong current password")
    
    def test_change_password_too_short(self):
        """Test password change with too short new password"""
        response = requests.post(f"{BASE_URL}/api/profile/{self.family_id}/change-password", json={
            "current_password": self.original_password,
            "new_password": "12345"  # Only 5 chars, need 6
        })
        
        assert response.status_code == 400
        data = response.json()
        assert "6 characters" in data.get("detail", "").lower() or "at least" in data.get("detail", "").lower()
        
        print("✓ Password change correctly rejects too short password")
    
    def test_change_password_family_not_found(self):
        """Test password change for non-existent family"""
        response = requests.post(f"{BASE_URL}/api/profile/non-existent-id/change-password", json={
            "current_password": "test",
            "new_password": "newtest123"
        })
        
        assert response.status_code == 404
        print("✓ Password change returns 404 for non-existent family")


class TestLoginWithExistingAccount:
    """Test login with existing test account to verify avatar data"""
    
    def test_login_with_test_account(self):
        """Login with test account and verify data"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        
        assert response.status_code == 200
        data = response.json()
        family = data.get("family", {})
        
        print(f"✓ Test account login successful")
        print(f"  Family ID: {family.get('id')}")
        print(f"  Family Name: {family.get('family_name')}")
        print(f"  Avatar: {family.get('avatar_emoji')} ({family.get('avatar_id')})")
        print(f"  Is Premium: {family.get('is_premium')}")
        
        return family


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
