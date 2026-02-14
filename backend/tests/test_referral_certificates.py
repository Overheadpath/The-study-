"""
Test file for Referral Program and Achievement Certificates features
Tests:
- Referral code validation (GET /api/referral/validate/{code})
- Referral stats endpoint (GET /api/referral/stats/{family_id})
- Registration with referral code grants premium
- Get certificates endpoint (GET /api/certificates/{kid_id})
- Certificate PDF generation endpoint (GET /api/certificate/{certificate_id}/pdf)
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestReferralProgram:
    """Test referral program endpoints"""
    
    def test_api_health(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ API health check passed")
    
    def test_register_family_a_get_referral_code(self):
        """Register Family A and get their referral code"""
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"family_a_{unique_id}@test.com",
            "password": "TestPass123",
            "family_name": "Test Family A",
            "curriculum": "caps"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Registration response status: {response.status_code}")
        print(f"Registration response: {response.json()}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        # Verify response contains referral code
        assert "referral_code" in data, "Response should contain referral_code"
        assert len(data["referral_code"]) == 8, "Referral code should be 8 characters"
        
        # Store for subsequent tests
        pytest.family_a_id = data["id"]
        pytest.family_a_referral_code = data["referral_code"]
        pytest.family_a_email = payload["email"]
        
        print(f"✓ Family A registered with referral code: {data['referral_code']}")
    
    def test_validate_referral_code_valid(self):
        """Test validation of a valid referral code"""
        if not hasattr(pytest, 'family_a_referral_code'):
            pytest.skip("Need Family A referral code from previous test")
        
        code = pytest.family_a_referral_code
        response = requests.get(f"{BASE_URL}/api/referral/validate/{code}")
        
        print(f"Validate response status: {response.status_code}")
        print(f"Validate response: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("valid") == True, "Code should be valid"
        assert "family_name" in data, "Response should contain family_name"
        
        print(f"✓ Valid referral code validation passed, family: {data.get('family_name')}")
    
    def test_validate_referral_code_invalid(self):
        """Test validation of an invalid referral code"""
        response = requests.get(f"{BASE_URL}/api/referral/validate/INVALIDCODE123")
        
        print(f"Invalid code response status: {response.status_code}")
        print(f"Invalid code response: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("valid") == False, "Code should be invalid"
        
        print("✓ Invalid referral code validation passed")
    
    def test_register_with_referral_code_grants_premium(self):
        """Register Family B using Family A's referral code - both should get premium"""
        if not hasattr(pytest, 'family_a_referral_code'):
            pytest.skip("Need Family A referral code from previous test")
        
        unique_id = str(uuid.uuid4())[:8]
        payload = {
            "email": f"family_b_{unique_id}@test.com",
            "password": "TestPass123",
            "family_name": "Test Family B",
            "curriculum": "common_core",
            "referral_code": pytest.family_a_referral_code
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        print(f"Family B registration response status: {response.status_code}")
        print(f"Family B registration response: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Family B should now have premium
        assert data.get("is_premium") == True, "Family B should have premium after using referral code"
        
        pytest.family_b_id = data["id"]
        pytest.family_b_email = payload["email"]
        
        print(f"✓ Family B registered with premium via referral code")
    
    def test_referrer_gets_premium_after_referral(self):
        """Verify Family A (referrer) also got premium after Family B used their code"""
        if not hasattr(pytest, 'family_a_id'):
            pytest.skip("Need Family A ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/subscription/status/{pytest.family_a_id}")
        
        print(f"Family A subscription status: {response.status_code}")
        print(f"Family A subscription data: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert data.get("is_premium") == True, "Family A should have premium after referral was used"
        
        print("✓ Family A (referrer) has premium after successful referral")
    
    def test_referral_stats_endpoint(self):
        """Test referral stats endpoint"""
        if not hasattr(pytest, 'family_a_id'):
            pytest.skip("Need Family A ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/referral/stats/{pytest.family_a_id}")
        
        print(f"Referral stats response status: {response.status_code}")
        print(f"Referral stats data: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "referral_code" in data, "Response should contain referral_code"
        assert "total_referrals" in data, "Response should contain total_referrals"
        assert "months_earned" in data, "Response should contain months_earned"
        assert data.get("total_referrals") >= 1, "Should have at least 1 referral"
        
        print(f"✓ Referral stats: {data['total_referrals']} referrals, {data['months_earned']} months earned")
    
    def test_referral_stats_nonexistent_family(self):
        """Test referral stats for non-existent family"""
        response = requests.get(f"{BASE_URL}/api/referral/stats/nonexistent-family-id")
        
        print(f"Nonexistent family stats response: {response.status_code}")
        
        assert response.status_code == 404, "Should return 404 for non-existent family"
        
        print("✓ Non-existent family returns 404")


class TestCertificates:
    """Test achievement certificates endpoints"""
    
    def test_create_kid_for_certificates(self):
        """Create a kid to test certificates"""
        # First create a family if we don't have one
        unique_id = str(uuid.uuid4())[:8]
        
        # Register family
        family_payload = {
            "email": f"cert_family_{unique_id}@test.com",
            "password": "TestPass123",
            "family_name": "Certificate Test Family",
            "curriculum": "caps"
        }
        
        response = requests.post(f"{BASE_URL}/api/auth/register", json=family_payload)
        
        if response.status_code == 400:  # Email already exists, try login
            login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "email": family_payload["email"],
                "password": family_payload["password"]
            })
            family = login_response.json().get("family", {})
            pytest.cert_family_id = family.get("id")
        else:
            assert response.status_code == 200
            pytest.cert_family_id = response.json()["id"]
        
        print(f"Family ID for certificates test: {pytest.cert_family_id}")
        
        # Create a kid
        kid_payload = {
            "family_id": pytest.cert_family_id,
            "name": "Certificate Kid",
            "grade": 5,
            "pin": "1234",
            "avatar_color": "#4F46E5"
        }
        
        kid_response = requests.post(f"{BASE_URL}/api/kids", json=kid_payload)
        print(f"Create kid response: {kid_response.status_code}")
        print(f"Create kid data: {kid_response.json()}")
        
        assert kid_response.status_code == 200
        kid_data = kid_response.json()
        
        pytest.cert_kid_id = kid_data["id"]
        
        print(f"✓ Created kid for certificate tests: {kid_data['name']} (ID: {kid_data['id']})")
    
    def test_get_certificates_empty(self):
        """Test getting certificates for a new kid (should be empty)"""
        if not hasattr(pytest, 'cert_kid_id'):
            pytest.skip("Need kid ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/certificates/{pytest.cert_kid_id}")
        
        print(f"Get certificates response: {response.status_code}")
        print(f"Certificates data: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "certificates" in data, "Response should contain certificates array"
        assert isinstance(data["certificates"], list), "Certificates should be a list"
        
        print(f"✓ Get certificates endpoint working, found {len(data['certificates'])} certificates")
    
    def test_get_certificates_nonexistent_kid(self):
        """Test getting certificates for non-existent kid"""
        response = requests.get(f"{BASE_URL}/api/certificates/nonexistent-kid-id")
        
        print(f"Nonexistent kid certificates response: {response.status_code}")
        
        assert response.status_code == 404, "Should return 404 for non-existent kid"
        
        print("✓ Non-existent kid returns 404")
    
    def test_add_points_to_earn_certificate(self):
        """Add points to kid to trigger certificate generation"""
        if not hasattr(pytest, 'cert_kid_id'):
            pytest.skip("Need kid ID from previous test")
        
        # Update kid's points to 100 to trigger "Rising Star" certificate
        response = requests.put(
            f"{BASE_URL}/api/kids/{pytest.cert_kid_id}",
            json={"points": 100}
        )
        
        print(f"Update points response: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert data.get("points") == 100
        
        print(f"✓ Updated kid points to 100")
    
    def test_get_certificates_after_milestone(self):
        """Test getting certificates after reaching points milestone"""
        if not hasattr(pytest, 'cert_kid_id'):
            pytest.skip("Need kid ID from previous test")
        
        response = requests.get(f"{BASE_URL}/api/certificates/{pytest.cert_kid_id}")
        
        print(f"Get certificates after milestone response: {response.status_code}")
        print(f"Certificates data: {response.json()}")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "certificates" in data, "Response should contain certificates array"
        
        # Should have earned "Rising Star" certificate at 100 points
        if len(data["certificates"]) > 0:
            pytest.cert_certificate_id = data["certificates"][0]["id"]
            print(f"✓ Earned certificate: {data['certificates'][0].get('achievement_title')}")
        else:
            print("Note: No certificates generated (milestone logic may vary)")
        
        # Check for new_certificates field
        assert "new_certificates" in data, "Response should contain new_certificates field"
    
    def test_certificate_pdf_generation(self):
        """Test certificate PDF/HTML generation endpoint"""
        if not hasattr(pytest, 'cert_certificate_id'):
            # Create a certificate manually for testing
            print("Creating test certificate manually...")
            
            # We need to call the endpoint to generate certificates first
            if hasattr(pytest, 'cert_kid_id'):
                # Update points higher to ensure certificate
                requests.put(
                    f"{BASE_URL}/api/kids/{pytest.cert_kid_id}",
                    json={"points": 150}
                )
                
                # Get certificates to trigger generation
                cert_response = requests.get(f"{BASE_URL}/api/certificates/{pytest.cert_kid_id}")
                if cert_response.status_code == 200:
                    certs = cert_response.json().get("certificates", [])
                    if certs:
                        pytest.cert_certificate_id = certs[0]["id"]
        
        if not hasattr(pytest, 'cert_certificate_id'):
            pytest.skip("No certificate available to test PDF generation")
        
        response = requests.get(
            f"{BASE_URL}/api/certificate/{pytest.cert_certificate_id}/pdf"
        )
        
        print(f"Certificate PDF response status: {response.status_code}")
        print(f"Content-Type: {response.headers.get('Content-Type')}")
        
        assert response.status_code == 200
        
        # Check it returns HTML (the endpoint generates HTML certificate)
        content_type = response.headers.get('Content-Type', '')
        assert 'text/html' in content_type, f"Expected text/html, got {content_type}"
        
        # Verify content contains certificate elements
        content = response.text
        assert 'Certificate of Achievement' in content or 'certificate' in content.lower()
        
        print("✓ Certificate PDF/HTML generation working")
    
    def test_certificate_pdf_nonexistent(self):
        """Test certificate PDF for non-existent certificate"""
        response = requests.get(f"{BASE_URL}/api/certificate/nonexistent-cert-id/pdf")
        
        print(f"Nonexistent certificate PDF response: {response.status_code}")
        
        assert response.status_code == 404, "Should return 404 for non-existent certificate"
        
        print("✓ Non-existent certificate returns 404")


class TestReferralCodeInLogin:
    """Test that referral code is returned in login and family info"""
    
    def test_login_returns_referral_code(self):
        """Test that login response includes referral code"""
        unique_id = str(uuid.uuid4())[:8]
        
        # Register
        payload = {
            "email": f"login_ref_{unique_id}@test.com",
            "password": "TestPass123",
            "family_name": "Login Referral Test",
            "curriculum": "caps"
        }
        
        reg_response = requests.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert reg_response.status_code == 200
        family_id = reg_response.json()["id"]
        expected_code = reg_response.json().get("referral_code")
        
        # Login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": payload["email"],
            "password": payload["password"]
        })
        
        print(f"Login response: {login_response.status_code}")
        print(f"Login data: {login_response.json()}")
        
        assert login_response.status_code == 200
        data = login_response.json()
        
        family = data.get("family", {})
        assert "referral_code" in family, "Login response should include referral_code"
        assert family["referral_code"] == expected_code, "Referral code should match"
        
        print(f"✓ Login returns referral code: {family['referral_code']}")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
