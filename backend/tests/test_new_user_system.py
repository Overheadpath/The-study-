"""
Test suite for New Username-based Authentication System
Tests: User Registration, Login, Username Check, Groups, QR Join
"""
import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def random_string(length=8):
    """Generate random string for unique test data"""
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))


class TestUserRegistration:
    """Test user registration flow (username/password - no email required)"""
    
    def test_register_child_user(self):
        """Test registration of child user (under 13)"""
        username = f"test_child_{random_string()}"
        response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Test Child",
            "birthdate": "2015-06-15",  # ~10 years old
            "grade": 5,
            "avatar_emoji": "🎓",
            "avatar_color": "#FF6B35"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["username"] == username
        assert data["display_name"] == "Test Child"
        assert data["is_child"] == True
        assert data["age"] < 13
        assert data["grade"] == 5
        assert data["qr_invite_code"] is not None
        assert len(data["qr_invite_code"]) > 0
        
        # Store for cleanup
        self.created_user_id = data["id"]
        return data
    
    def test_register_adult_user(self):
        """Test registration of adult user (13+)"""
        username = f"test_adult_{random_string()}"
        response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Test Adult",
            "birthdate": "1990-03-20",  # Adult
            "email": f"testadult_{random_string()}@test.com",  # Optional email
            "avatar_emoji": "👨",
            "avatar_color": "#3B82F6"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["is_child"] == False
        assert data["age"] >= 13
        assert data["email"] is not None
        return data
    
    def test_register_without_email(self):
        """Test registration works without email (optional field)"""
        username = f"test_noemail_{random_string()}"
        response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "No Email User",
            "birthdate": "2014-01-15"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] is None
    
    def test_register_duplicate_username_fails(self):
        """Test that registering with existing username fails"""
        username = f"test_dup_{random_string()}"
        
        # First registration should succeed
        response1 = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "First User",
            "birthdate": "2010-01-01"
        })
        assert response1.status_code == 200
        
        # Second registration with same username should fail
        response2 = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "DifferentPass456",
            "display_name": "Second User",
            "birthdate": "2010-01-01"
        })
        assert response2.status_code == 400
        assert "already taken" in response2.json()["detail"].lower()
    
    def test_register_invalid_username_format(self):
        """Test that invalid username format is rejected"""
        # Username too short
        response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": "ab",  # Less than 3 chars
            "password": "TestPass123",
            "display_name": "Short Name",
            "birthdate": "2010-01-01"
        })
        assert response.status_code == 400
        
        # Username with invalid characters
        response2 = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": "user@name!",  # Invalid chars
            "password": "TestPass123",
            "display_name": "Invalid User",
            "birthdate": "2010-01-01"
        })
        assert response2.status_code == 400


class TestUserLogin:
    """Test user login flow (username + password)"""
    
    def test_login_success(self):
        """Test successful login returns user data"""
        # First register a user
        username = f"test_login_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Login Test User",
            "birthdate": "2012-05-20"
        })
        assert reg_response.status_code == 200
        
        # Now login
        login_response = requests.post(f"{BASE_URL}/api/users/login", json={
            "username": username,
            "password": "TestPass123"
        })
        
        assert login_response.status_code == 200, f"Expected 200, got {login_response.status_code}: {login_response.text}"
        data = login_response.json()
        
        # Verify login returns correct user data
        assert data["username"] == username
        assert data["display_name"] == "Login Test User"
        assert "id" in data
        assert "qr_invite_code" in data
        assert "groups" in data
    
    def test_login_wrong_password_fails(self):
        """Test login fails with wrong password"""
        username = f"test_wrongpw_{random_string()}"
        
        # Register
        requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "CorrectPass123",
            "display_name": "Wrong Pass User",
            "birthdate": "2010-01-01"
        })
        
        # Login with wrong password
        response = requests.post(f"{BASE_URL}/api/users/login", json={
            "username": username,
            "password": "WrongPass456"
        })
        
        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()
    
    def test_login_nonexistent_user_fails(self):
        """Test login fails for non-existent username"""
        response = requests.post(f"{BASE_URL}/api/users/login", json={
            "username": "nonexistent_user_xyz123",
            "password": "AnyPassword123"
        })
        
        assert response.status_code == 401


class TestUsernameCheck:
    """Test username availability check endpoint"""
    
    def test_check_available_username(self):
        """Test checking an available username"""
        unique_username = f"available_{random_string()}"
        response = requests.get(f"{BASE_URL}/api/users/check-username/{unique_username}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["available"] == True
        assert data["username"] == unique_username.lower()
    
    def test_check_taken_username(self):
        """Test checking a taken username"""
        # Register a user first
        username = f"taken_{random_string()}"
        requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Taken User",
            "birthdate": "2010-01-01"
        })
        
        # Check availability
        response = requests.get(f"{BASE_URL}/api/users/check-username/{username}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["available"] == False


class TestGroups:
    """Test Group (Family/Friends) creation and management"""
    
    def test_create_group(self):
        """Test creating a new group"""
        # Register a user first
        username = f"test_group_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Group Creator",
            "birthdate": "1985-03-20"
        })
        user_id = reg_response.json()["id"]
        
        # Create group
        response = requests.post(f"{BASE_URL}/api/groups?user_id={user_id}", json={
            "name": "Test Family Group",
            "description": "Testing group creation",
            "group_type": "family"
        })
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data["name"] == "Test Family Group"
        assert data["group_type"] == "family"
        assert data["owner_id"] == user_id
        assert user_id in data["members"]
        assert "qr_invite_code" in data
        assert len(data["qr_invite_code"]) == 10
        
        return data
    
    def test_create_friends_group(self):
        """Test creating a friends group"""
        username = f"test_friends_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Friends Creator",
            "birthdate": "1990-01-01"
        })
        user_id = reg_response.json()["id"]
        
        response = requests.post(f"{BASE_URL}/api/groups?user_id={user_id}", json={
            "name": "Study Buddies",
            "description": "Friends study group",
            "group_type": "friends"
        })
        
        assert response.status_code == 200
        assert response.json()["group_type"] == "friends"
    
    def test_get_user_groups(self):
        """Test fetching groups for a user"""
        username = f"test_getgrp_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Get Groups User",
            "birthdate": "1990-01-01"
        })
        user_id = reg_response.json()["id"]
        
        # Create a group
        requests.post(f"{BASE_URL}/api/groups?user_id={user_id}", json={
            "name": "My Test Group",
            "group_type": "family"
        })
        
        # Fetch groups
        response = requests.get(f"{BASE_URL}/api/groups?user_id={user_id}")
        
        assert response.status_code == 200
        groups = response.json()
        assert len(groups) >= 1
        assert any(g["name"] == "My Test Group" for g in groups)


class TestJoinGroupByQR:
    """Test joining groups via QR code (required for kids and cross-age invites)"""
    
    def test_join_group_by_qr_code(self):
        """Test joining a group using QR code"""
        # Create owner and group
        owner_username = f"test_owner_{random_string()}"
        owner_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": owner_username,
            "password": "TestPass123",
            "display_name": "Group Owner",
            "birthdate": "1985-01-01"
        })
        owner_id = owner_response.json()["id"]
        
        group_response = requests.post(f"{BASE_URL}/api/groups?user_id={owner_id}", json={
            "name": "QR Test Group",
            "group_type": "family"
        })
        qr_code = group_response.json()["qr_invite_code"]
        group_id = group_response.json()["id"]
        
        # Create another user to join
        joiner_username = f"test_joiner_{random_string()}"
        joiner_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": joiner_username,
            "password": "TestPass123",
            "display_name": "Group Joiner",
            "birthdate": "1990-01-01"
        })
        joiner_id = joiner_response.json()["id"]
        
        # Join via QR code
        join_response = requests.post(f"{BASE_URL}/api/groups/join-qr?qr_code={qr_code}&user_id={joiner_id}")
        
        assert join_response.status_code == 200, f"Expected 200, got {join_response.status_code}: {join_response.text}"
        data = join_response.json()
        assert data["message"] == "Joined group successfully"
        assert data["group_name"] == "QR Test Group"
        
        # Verify user is now in group
        group_details = requests.get(f"{BASE_URL}/api/groups/{group_id}")
        members = group_details.json()["members"]
        member_ids = [m["id"] for m in members]
        assert joiner_id in member_ids
    
    def test_join_group_invalid_qr_code_fails(self):
        """Test that invalid QR code fails to join"""
        username = f"test_badqr_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Bad QR User",
            "birthdate": "1990-01-01"
        })
        user_id = reg_response.json()["id"]
        
        response = requests.post(f"{BASE_URL}/api/groups/join-qr?qr_code=INVALIDCODE&user_id={user_id}")
        
        assert response.status_code == 404
        assert "invalid" in response.json()["detail"].lower()
    
    def test_join_group_already_member_fails(self):
        """Test that joining a group you're already in fails"""
        username = f"test_double_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Double Join User",
            "birthdate": "1990-01-01"
        })
        user_id = reg_response.json()["id"]
        
        # Create and thus join a group
        group_response = requests.post(f"{BASE_URL}/api/groups?user_id={user_id}", json={
            "name": "Double Test Group",
            "group_type": "family"
        })
        qr_code = group_response.json()["qr_invite_code"]
        
        # Try to join again via QR
        response = requests.post(f"{BASE_URL}/api/groups/join-qr?qr_code={qr_code}&user_id={user_id}")
        
        assert response.status_code == 400
        assert "already" in response.json()["detail"].lower()


class TestChildRestrictions:
    """Test age-based restrictions for children under 13"""
    
    def test_child_cannot_send_username_invite(self):
        """Test that children under 13 cannot invite by username"""
        # Create child user
        child_username = f"test_child_{random_string()}"
        child_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": child_username,
            "password": "TestPass123",
            "display_name": "Child User",
            "birthdate": "2015-06-15"  # ~10 years old
        })
        child_id = child_response.json()["id"]
        
        # Create group as child
        group_response = requests.post(f"{BASE_URL}/api/groups?user_id={child_id}", json={
            "name": "Child's Group",
            "group_type": "friends"
        })
        group_id = group_response.json()["id"]
        
        # Create another user to invite
        other_username = f"test_other_{random_string()}"
        requests.post(f"{BASE_URL}/api/users/register", json={
            "username": other_username,
            "password": "TestPass123",
            "display_name": "Other User",
            "birthdate": "1990-01-01"
        })
        
        # Try to send invite by username (should fail for child)
        invite_response = requests.post(f"{BASE_URL}/api/groups/invite?from_user_id={child_id}", json={
            "group_id": group_id,
            "to_username": other_username
        })
        
        assert invite_response.status_code == 403
        assert "under 13" in invite_response.json()["detail"].lower() or "qr code" in invite_response.json()["detail"].lower()


class TestGroupInvites:
    """Test group invite system for adults"""
    
    def test_adult_can_send_invite_to_adult(self):
        """Test that adult can send invite to another adult"""
        # Create two adult users
        adult1_username = f"test_adult1_{random_string()}"
        adult1_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": adult1_username,
            "password": "TestPass123",
            "display_name": "Adult 1",
            "birthdate": "1985-01-01"
        })
        adult1_id = adult1_response.json()["id"]
        
        adult2_username = f"test_adult2_{random_string()}"
        adult2_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": adult2_username,
            "password": "TestPass123",
            "display_name": "Adult 2",
            "birthdate": "1990-01-01"
        })
        adult2_id = adult2_response.json()["id"]
        
        # Create group as adult1
        group_response = requests.post(f"{BASE_URL}/api/groups?user_id={adult1_id}", json={
            "name": "Adult Group",
            "group_type": "family"
        })
        group_id = group_response.json()["id"]
        
        # Send invite to adult2
        invite_response = requests.post(f"{BASE_URL}/api/groups/invite?from_user_id={adult1_id}", json={
            "group_id": group_id,
            "to_username": adult2_username
        })
        
        assert invite_response.status_code == 200, f"Expected 200, got {invite_response.status_code}: {invite_response.text}"
        assert "invite_id" in invite_response.json()
    
    def test_adult_cannot_invite_child_by_username(self):
        """Test that adult cannot invite child by username (must use QR)"""
        # Create adult and child
        adult_username = f"test_adult_{random_string()}"
        adult_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": adult_username,
            "password": "TestPass123",
            "display_name": "Adult Inviter",
            "birthdate": "1985-01-01"
        })
        adult_id = adult_response.json()["id"]
        
        child_username = f"test_child_{random_string()}"
        requests.post(f"{BASE_URL}/api/users/register", json={
            "username": child_username,
            "password": "TestPass123",
            "display_name": "Child Invitee",
            "birthdate": "2015-06-15"
        })
        
        # Create group
        group_response = requests.post(f"{BASE_URL}/api/groups?user_id={adult_id}", json={
            "name": "Adult's Group",
            "group_type": "family"
        })
        group_id = group_response.json()["id"]
        
        # Try to invite child by username (should fail - must use QR)
        invite_response = requests.post(f"{BASE_URL}/api/groups/invite?from_user_id={adult_id}", json={
            "group_id": group_id,
            "to_username": child_username
        })
        
        assert invite_response.status_code == 403
        assert "qr code" in invite_response.json()["detail"].lower()


class TestGetUser:
    """Test getting user info"""
    
    def test_get_user_by_id(self):
        """Test fetching user by ID"""
        username = f"test_getuser_{random_string()}"
        reg_response = requests.post(f"{BASE_URL}/api/users/register", json={
            "username": username,
            "password": "TestPass123",
            "display_name": "Get User Test",
            "birthdate": "2010-01-01",
            "grade": 6
        })
        user_id = reg_response.json()["id"]
        
        response = requests.get(f"{BASE_URL}/api/users/{user_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == user_id
        assert data["username"] == username
        assert data["display_name"] == "Get User Test"
        assert data["grade"] == 6
    
    def test_get_nonexistent_user_fails(self):
        """Test fetching non-existent user returns 404"""
        response = requests.get(f"{BASE_URL}/api/users/nonexistent-user-id-123")
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
