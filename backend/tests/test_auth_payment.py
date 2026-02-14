"""
Test suite for Authentication and Payment flows
- User registration with email/password/family_name
- User login with email/password
- Stripe checkout flow
- Payment verification
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data
TEST_EMAIL = f"test_agent_{uuid.uuid4().hex[:8]}@test.com"
TEST_PASSWORD = "TestPass123"
TEST_FAMILY_NAME = "Test Family"

class TestHealthCheck:
    """Basic health check"""
    
    def test_api_health(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        print(f"SUCCESS: API health check passed - {data}")


class TestUserRegistration:
    """User registration flow tests"""
    
    def test_register_new_user(self):
        """Test registering a new family account"""
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "family_name": TEST_FAMILY_NAME
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data, "Response missing 'id'"
        assert "email" in data, "Response missing 'email'"
        assert "family_name" in data, "Response missing 'family_name'"
        assert "is_premium" in data, "Response missing 'is_premium'"
        
        # Verify values
        assert data["email"] == TEST_EMAIL.lower()
        assert data["family_name"] == TEST_FAMILY_NAME
        assert data["is_premium"] == False
        
        print(f"SUCCESS: User registered - {data['email']}, ID: {data['id']}")
        
        # Store for later tests
        pytest.family_id = data["id"]
        return data
    
    def test_register_duplicate_email(self):
        """Test registering with existing email fails"""
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "family_name": "Another Family"
        }
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        
        assert response.status_code == 400, "Should fail for duplicate email"
        data = response.json()
        assert "already registered" in data.get("detail", "").lower()
        print(f"SUCCESS: Duplicate email rejected correctly")


class TestUserLogin:
    """User login flow tests"""
    
    def test_login_success(self):
        """Test login with valid credentials"""
        payload = {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert "email" in data
        assert "family_name" in data
        assert "is_premium" in data
        
        # Verify values
        assert data["email"] == TEST_EMAIL.lower()
        assert data["family_name"] == TEST_FAMILY_NAME
        
        print(f"SUCCESS: Login successful - {data['email']}")
        
        # Store for later tests
        pytest.family_id = data["id"]
        return data
    
    def test_login_wrong_password(self):
        """Test login with wrong password fails"""
        payload = {
            "email": TEST_EMAIL,
            "password": "WrongPassword123"
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 401, "Should fail for wrong password"
        data = response.json()
        assert "invalid" in data.get("detail", "").lower()
        print(f"SUCCESS: Wrong password rejected correctly")
    
    def test_login_nonexistent_email(self):
        """Test login with non-existent email fails"""
        payload = {
            "email": "nonexistent@test.com",
            "password": TEST_PASSWORD
        }
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        
        assert response.status_code == 401, "Should fail for non-existent email"
        print(f"SUCCESS: Non-existent email rejected correctly")


class TestFamilyInfo:
    """Family info retrieval tests"""
    
    def test_get_family_info(self):
        """Test getting family info by ID"""
        # First login to get family_id
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["id"]
        
        # Get family info
        response = requests.get(f"{BASE_URL}/api/auth/family/{family_id}")
        
        assert response.status_code == 200, f"Get family failed: {response.text}"
        data = response.json()
        
        assert data["id"] == family_id
        assert data["email"] == TEST_EMAIL.lower()
        print(f"SUCCESS: Family info retrieved - {data['family_name']}")
    
    def test_get_nonexistent_family(self):
        """Test getting non-existent family returns 404"""
        response = requests.get(f"{BASE_URL}/api/auth/family/nonexistent-id")
        
        assert response.status_code == 404
        print(f"SUCCESS: Non-existent family returns 404")


class TestSubscriptionStatus:
    """Subscription status tests"""
    
    def test_get_subscription_status(self):
        """Test getting subscription status for a family"""
        # First login to get family_id
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["id"]
        
        # Get subscription status
        response = requests.get(f"{BASE_URL}/api/subscription/status/{family_id}")
        
        assert response.status_code == 200, f"Get subscription failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "is_premium" in data
        assert "can_add_child" in data
        assert "ai_questions_remaining" in data
        assert "max_children" in data
        
        # Free tier should have these values
        assert data["is_premium"] == False
        assert data["max_children"] == 1
        assert data["ai_questions_remaining"] == 5
        
        print(f"SUCCESS: Subscription status retrieved - Premium: {data['is_premium']}")


class TestStripeCheckout:
    """Stripe checkout flow tests"""
    
    def test_create_checkout_session(self):
        """Test creating a Stripe checkout session"""
        # First login to get family_id
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert login_response.status_code == 200
        family_id = login_response.json()["id"]
        
        # Create checkout session
        origin_url = "https://learn-earn-18.preview.emergentagent.com"
        response = requests.post(
            f"{BASE_URL}/api/subscription/checkout?family_id={family_id}&origin_url={origin_url}"
        )
        
        assert response.status_code == 200, f"Checkout creation failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "checkout_url" in data, "Response missing 'checkout_url'"
        assert "session_id" in data, "Response missing 'session_id'"
        
        # Verify checkout URL is a valid Stripe URL
        assert "stripe.com" in data["checkout_url"] or "checkout" in data["checkout_url"]
        
        print(f"SUCCESS: Checkout session created - Session ID: {data['session_id'][:20]}...")
        
        # Store for later tests
        pytest.checkout_session_id = data["session_id"]
        return data
    
    def test_checkout_nonexistent_family(self):
        """Test checkout for non-existent family fails"""
        origin_url = "https://learn-earn-18.preview.emergentagent.com"
        response = requests.post(
            f"{BASE_URL}/api/subscription/checkout?family_id=nonexistent-id&origin_url={origin_url}"
        )
        
        assert response.status_code == 404
        print(f"SUCCESS: Checkout for non-existent family returns 404")


class TestPaymentVerification:
    """Payment verification tests"""
    
    def test_check_payment_status_invalid_session(self):
        """Test checking payment status with invalid session ID"""
        response = requests.get(f"{BASE_URL}/api/subscription/status/check/invalid-session-id")
        
        # Should return error status for invalid session (404, 500, or 520 from Cloudflare)
        assert response.status_code in [404, 500, 520], f"Unexpected status: {response.status_code}"
        print(f"SUCCESS: Invalid session ID handled correctly - Status: {response.status_code}")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_family(self):
        """Note: No direct delete endpoint for families, but test data is isolated"""
        print(f"INFO: Test family created with email: {TEST_EMAIL}")
        print(f"INFO: This test data will remain in DB but is isolated by unique email")


# Run tests in order
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
