"""
Tests for Daily Rewards and Subject Mastery features
- Daily Rewards: GET /api/daily-rewards/{kid_id}, POST /api/daily-rewards/{kid_id}/claim
- Subject Mastery: GET /api/mastery/{kid_id}
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from iteration_6.json
TEST_EMAIL = "cert_family_73e12cb4@test.com"
TEST_PASSWORD = "TestPass123"


class TestAPIHealth:
    """Basic health check"""
    
    def test_api_health(self):
        """API should be running and healthy"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print("✓ API health check passed")


class TestLogin:
    """Login tests to get kid_id for daily rewards testing"""
    
    def test_login_success(self):
        """Login with test credentials to get family and kid data"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "user_type" in data
        assert data["user_type"] == "parent"
        assert "family" in data
        print(f"✓ Login successful - Family ID: {data['family']['id']}")
        return data


class TestDailyRewards:
    """Tests for Daily Rewards feature"""
    
    @pytest.fixture
    def kid_id(self):
        """Get a kid ID from the test family"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["family"]["id"]
        
        # Get kids for this family
        kids_response = requests.get(f"{BASE_URL}/api/kids", params={"family_id": family_id})
        assert kids_response.status_code == 200
        kids = kids_response.json()
        
        if not kids:
            pytest.skip("No kids found for test family")
        
        return kids[0]["id"]
    
    def test_get_daily_rewards_status(self, kid_id):
        """GET /api/daily-rewards/{kid_id} - Get daily reward status"""
        response = requests.get(f"{BASE_URL}/api/daily-rewards/{kid_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Verify expected fields
        assert "current_streak" in data
        assert "last_claim_date" in data or data.get("last_claim_date") is None
        assert "total_claimed" in data
        assert "can_claim_today" in data
        
        print(f"✓ Daily rewards status retrieved - Streak: {data['current_streak']}, Can claim: {data['can_claim_today']}")
        return data
    
    def test_get_daily_rewards_404_for_invalid_kid(self):
        """GET /api/daily-rewards/{kid_id} - Returns 404 for non-existent kid"""
        response = requests.get(f"{BASE_URL}/api/daily-rewards/nonexistent-kid-id")
        assert response.status_code == 404
        print("✓ Returns 404 for invalid kid ID")
    
    def test_claim_daily_reward(self, kid_id):
        """POST /api/daily-rewards/{kid_id}/claim - Claim daily reward"""
        # First check if can claim
        status_response = requests.get(f"{BASE_URL}/api/daily-rewards/{kid_id}")
        status_data = status_response.json()
        
        if not status_data.get("can_claim_today", True):
            # Already claimed - verify it returns 400
            response = requests.post(f"{BASE_URL}/api/daily-rewards/{kid_id}/claim")
            assert response.status_code == 400
            assert "already" in response.json().get("detail", "").lower()
            print("✓ Already claimed - correctly returns 400")
        else:
            # Can claim
            response = requests.post(f"{BASE_URL}/api/daily-rewards/{kid_id}/claim")
            assert response.status_code == 200, f"Failed to claim: {response.text}"
            
            data = response.json()
            assert "points_earned" in data
            assert "current_streak" in data
            assert "can_claim_today" in data
            assert data["can_claim_today"] == False  # Just claimed
            
            print(f"✓ Claimed daily reward - Points earned: {data['points_earned']}, New streak: {data['current_streak']}")
    
    def test_claim_daily_reward_404_for_invalid_kid(self):
        """POST /api/daily-rewards/{kid_id}/claim - Returns 404 for non-existent kid"""
        response = requests.post(f"{BASE_URL}/api/daily-rewards/nonexistent-kid-id/claim")
        assert response.status_code == 404
        print("✓ Claim returns 404 for invalid kid ID")


class TestSubjectMastery:
    """Tests for Subject Mastery feature"""
    
    @pytest.fixture
    def kid_id(self):
        """Get a kid ID from the test family"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["family"]["id"]
        
        kids_response = requests.get(f"{BASE_URL}/api/kids", params={"family_id": family_id})
        assert kids_response.status_code == 200
        kids = kids_response.json()
        
        if not kids:
            pytest.skip("No kids found for test family")
        
        return kids[0]["id"]
    
    def test_get_subject_mastery(self, kid_id):
        """GET /api/mastery/{kid_id} - Get subject mastery levels"""
        response = requests.get(f"{BASE_URL}/api/mastery/{kid_id}")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "mastery" in data
        assert isinstance(data["mastery"], list)
        
        # If there are mastery entries, verify structure
        for mastery in data["mastery"]:
            assert "subject" in mastery
            assert "level" in mastery
            assert "completed_tasks" in mastery
            assert "progress_to_next" in mastery
            # Level should be one of these
            assert mastery["level"] in ["none", "bronze", "silver", "gold", "master"]
        
        print(f"✓ Subject mastery retrieved - {len(data['mastery'])} subjects with mastery data")
        return data
    
    def test_get_subject_mastery_404_for_invalid_kid(self):
        """GET /api/mastery/{kid_id} - Returns 404 for non-existent kid"""
        response = requests.get(f"{BASE_URL}/api/mastery/nonexistent-kid-id")
        assert response.status_code == 404
        print("✓ Mastery returns 404 for invalid kid ID")


class TestSettingsAppearance:
    """Test Settings page components (dark mode is frontend-only)"""
    
    def test_profile_endpoint_exists(self):
        """Verify profile update endpoint exists"""
        # Login first
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["family"]["id"]
        
        # Try to get profile (via family endpoint)
        response = requests.get(f"{BASE_URL}/api/auth/family/{family_id}")
        assert response.status_code == 200
        data = response.json()
        assert "family_name" in data
        print(f"✓ Profile data retrieved for family: {data['family_name']}")
    
    def test_password_change_endpoint_exists(self):
        """Verify password change endpoint exists and validates"""
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["family"]["id"]
        
        # Try with wrong current password - should fail with 400
        response = requests.post(f"{BASE_URL}/api/profile/{family_id}/change-password", json={
            "current_password": "wrongpassword",
            "new_password": "newpassword123"
        })
        assert response.status_code == 400
        print("✓ Password change endpoint validates current password correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
