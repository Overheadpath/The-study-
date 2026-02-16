"""
Test New Features: Homework Scanner, Progress Reports, Bulk Challenges, Rate Limiting
- POST /api/homework/scan - Scan homework with AI
- POST /api/homework/create-task - Create task from scanned homework
- POST /api/challenges/bulk-create - Create multiple challenges
- GET /api/progress-report/{kid_id} - Get progress report with grades
- Rate limiting returns 429 for too frequent requests
"""

import pytest
import requests
import os
import base64
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials from previous testing
TEST_EMAIL = "cert_family_73e12cb4@test.com"
TEST_PASSWORD = "TestPass123"


class TestHealthAndAuth:
    """Basic health and auth tests"""
    
    def test_api_health_check(self):
        """Test API is healthy"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ API health check passed")
    
    def test_login_with_test_credentials(self):
        """Test login with test account"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "family" in data or "user_type" in data
        print(f"✓ Login successful - user_type: {data.get('user_type')}")
        return data


class TestHomeworkScanner:
    """Tests for Homework Scanner feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get kid_id"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.family_id = data.get("family", {}).get("id")
        
        # Get kids
        kids_response = requests.get(f"{BASE_URL}/api/kids?family_id={self.family_id}")
        assert kids_response.status_code == 200
        kids = kids_response.json()
        if kids:
            self.kid_id = kids[0]["id"]
            self.kid_name = kids[0]["name"]
        else:
            self.kid_id = None
            self.kid_name = None
    
    def test_homework_scan_missing_kid(self):
        """Test POST /api/homework/scan with non-existent kid returns 404"""
        # Create minimal base64 image (1x1 pixel transparent PNG)
        test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        response = requests.post(f"{BASE_URL}/api/homework/scan", json={
            "kid_id": "non_existent_kid_id_12345",
            "image_base64": test_image_base64
        })
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ POST /api/homework/scan with invalid kid returns 404: {data['detail']}")
    
    def test_homework_scan_requires_kid_id(self):
        """Test POST /api/homework/scan requires kid_id field"""
        test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        response = requests.post(f"{BASE_URL}/api/homework/scan", json={
            "image_base64": test_image_base64
        })
        # Should return 422 (validation error) for missing required field
        assert response.status_code == 422
        print("✓ POST /api/homework/scan requires kid_id field (returns 422 on missing)")
    
    def test_homework_create_task_missing_kid(self):
        """Test POST /api/homework/create-task with non-existent kid returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/homework/create-task",
            params={
                "kid_id": "non_existent_kid_id_12345",
                "title": "Test Homework",
                "description": "Test description",
                "subject": "Math",
                "points": 10
            }
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ POST /api/homework/create-task with invalid kid returns 404: {data['detail']}")
    
    def test_homework_create_task_valid_kid(self):
        """Test POST /api/homework/create-task with valid kid creates task"""
        if not self.kid_id:
            pytest.skip("No kid found for testing")
        
        # Wait to avoid rate limiting from previous tests
        time.sleep(11)
        
        response = requests.post(
            f"{BASE_URL}/api/homework/create-task",
            params={
                "kid_id": self.kid_id,
                "title": "TEST_Math Homework from Scanner",
                "description": "TEST_Scanned homework description",
                "subject": "Mathematics",
                "points": 15
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "task_id" in data
        assert data.get("message") == "Task created successfully"
        print(f"✓ POST /api/homework/create-task creates task: {data['task_id']}")
        
        # Verify task was created
        tasks_response = requests.get(f"{BASE_URL}/api/tasks?kid_id={self.kid_id}")
        assert tasks_response.status_code == 200
        tasks = tasks_response.json()
        test_task = next((t for t in tasks if "TEST_" in t.get("title", "")), None)
        assert test_task is not None
        print(f"✓ Task verified in database: {test_task['title']}")


class TestBulkChallenges:
    """Tests for Bulk Challenges feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get family_id"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.family_id = data.get("family", {}).get("id")
        
        # Get kids
        kids_response = requests.get(f"{BASE_URL}/api/kids?family_id={self.family_id}")
        assert kids_response.status_code == 200
        kids = kids_response.json()
        self.kids = kids
        self.kid_ids = [k["id"] for k in kids]
    
    def test_bulk_create_challenges_missing_family(self):
        """Test POST /api/challenges/bulk-create with non-existent family returns 404"""
        response = requests.post(
            f"{BASE_URL}/api/challenges/bulk-create",
            params={"family_id": "non_existent_family_12345"},
            json=[{
                "title": "Test Challenge",
                "description": "Test description",
                "target_type": "tasks",
                "target_value": 5,
                "reward_points": 50,
                "end_date": "2026-02-28",
                "kid_ids": ["some_kid_id"]
            }]
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ POST /api/challenges/bulk-create with invalid family returns 404: {data['detail']}")
    
    def test_bulk_create_challenges_valid(self):
        """Test POST /api/challenges/bulk-create creates multiple challenges"""
        if not self.kid_ids:
            pytest.skip("No kids found for testing")
        
        challenges_data = [
            {
                "title": "TEST_Weekly Reading Challenge",
                "description": "Complete 5 reading tasks this week",
                "target_type": "tasks",
                "target_value": 5,
                "reward_points": 100,
                "end_date": "2026-02-28",
                "kid_ids": self.kid_ids[:1]  # Assign to first kid
            },
            {
                "title": "TEST_Streak Challenge",
                "description": "Maintain a 3-day streak",
                "target_type": "streak",
                "target_value": 3,
                "reward_points": 75,
                "end_date": "2026-02-28",
                "kid_ids": self.kid_ids[:1]  # Assign to first kid
            }
        ]
        
        response = requests.post(
            f"{BASE_URL}/api/challenges/bulk-create",
            params={"family_id": self.family_id},
            json=challenges_data
        )
        assert response.status_code == 200
        data = response.json()
        assert "challenges" in data
        assert len(data["challenges"]) >= 2
        print(f"✓ POST /api/challenges/bulk-create created {len(data['challenges'])} challenges")
        
        # Verify challenges have correct structure
        for challenge in data["challenges"]:
            assert "id" in challenge
            assert "title" in challenge
            assert "target_type" in challenge
            assert "reward_points" in challenge
        print("✓ All created challenges have correct structure")
    
    def test_bulk_create_empty_list(self):
        """Test POST /api/challenges/bulk-create with empty list"""
        response = requests.post(
            f"{BASE_URL}/api/challenges/bulk-create",
            params={"family_id": self.family_id},
            json=[]
        )
        assert response.status_code == 200
        data = response.json()
        assert data.get("message") == "Created 0 challenges"
        print("✓ POST /api/challenges/bulk-create with empty list returns success with 0 challenges")


class TestProgressReport:
    """Tests for Progress Report feature"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get kid_id"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.family_id = data.get("family", {}).get("id")
        
        # Get kids
        kids_response = requests.get(f"{BASE_URL}/api/kids?family_id={self.family_id}")
        assert kids_response.status_code == 200
        kids = kids_response.json()
        if kids:
            self.kid_id = kids[0]["id"]
            self.kid_name = kids[0]["name"]
        else:
            self.kid_id = None
            self.kid_name = None
    
    def test_progress_report_missing_kid(self):
        """Test GET /api/progress-report/{kid_id} with non-existent kid returns 404"""
        response = requests.get(f"{BASE_URL}/api/progress-report/non_existent_kid_12345")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        print(f"✓ GET /api/progress-report with invalid kid returns 404: {data['detail']}")
    
    def test_progress_report_valid_kid(self):
        """Test GET /api/progress-report/{kid_id} returns comprehensive report"""
        if not self.kid_id:
            pytest.skip("No kid found for testing")
        
        response = requests.get(f"{BASE_URL}/api/progress-report/{self.kid_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "kid_name" in data
        assert "period" in data
        assert "summary" in data
        assert "tasks" in data
        assert "streaks" in data
        assert "achievements" in data
        assert "recommendations" in data
        
        print(f"✓ GET /api/progress-report returns report for {data['kid_name']}")
        
        # Check summary structure with grade
        summary = data["summary"]
        assert "grade" in summary, "Summary should include grade"
        assert "performance_score" in summary, "Summary should include performance_score"
        assert "feedback" in summary, "Summary should include feedback"
        print(f"✓ Progress report grade: {summary['grade']} (score: {summary['performance_score']})")
        
        # Check tasks by subject
        tasks = data["tasks"]
        assert "completed" in tasks
        assert "by_subject" in tasks
        print(f"✓ Tasks section: {tasks['completed']} completed tasks")
        
        # Check streaks
        streaks = data["streaks"]
        assert "current" in streaks
        print(f"✓ Streaks section: current streak = {streaks['current']}")
        
        # Check mastery levels
        if "mastery" in data:
            print(f"✓ Mastery levels: {len(data['mastery'])} subjects")
        
        # Check recommendations
        recommendations = data["recommendations"]
        assert isinstance(recommendations, list)
        print(f"✓ Recommendations: {len(recommendations)} suggestions")
    
    def test_progress_report_with_days_param(self):
        """Test GET /api/progress-report/{kid_id}?days=30 accepts days parameter"""
        if not self.kid_id:
            pytest.skip("No kid found for testing")
        
        response = requests.get(f"{BASE_URL}/api/progress-report/{self.kid_id}?days=30")
        assert response.status_code == 200
        data = response.json()
        assert "Last 30 days" in data.get("period", "")
        print(f"✓ GET /api/progress-report with days=30: period = {data['period']}")
    
    def test_progress_report_grade_tiers(self):
        """Test that progress report grade is one of expected values"""
        if not self.kid_id:
            pytest.skip("No kid found for testing")
        
        response = requests.get(f"{BASE_URL}/api/progress-report/{self.kid_id}")
        assert response.status_code == 200
        data = response.json()
        
        grade = data["summary"]["grade"]
        valid_grades = ["A+", "A", "B", "C", "D"]
        assert grade in valid_grades, f"Grade should be one of {valid_grades}, got {grade}"
        print(f"✓ Progress report grade '{grade}' is valid")


class TestRateLimiting:
    """Tests for Anti-cheat Rate Limiting"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: login and get kid_id"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        self.family_id = data.get("family", {}).get("id")
        
        # Get kids
        kids_response = requests.get(f"{BASE_URL}/api/kids?family_id={self.family_id}")
        assert kids_response.status_code == 200
        kids = kids_response.json()
        if kids:
            self.kid_id = kids[0]["id"]
        else:
            self.kid_id = None
    
    def test_rate_limit_homework_create_task(self):
        """Test rate limiting returns 429 for rapid task creation"""
        if not self.kid_id:
            pytest.skip("No kid found for testing")
        
        # First request should succeed (wait first to reset rate limit)
        time.sleep(11)
        
        response1 = requests.post(
            f"{BASE_URL}/api/homework/create-task",
            params={
                "kid_id": self.kid_id,
                "title": "TEST_Rate Limit Test 1",
                "description": "Testing rate limiting",
                "subject": "Math",
                "points": 10
            }
        )
        # First should succeed
        assert response1.status_code == 200
        print(f"✓ First task creation request succeeded (status: {response1.status_code})")
        
        # Immediate second request should be rate limited
        response2 = requests.post(
            f"{BASE_URL}/api/homework/create-task",
            params={
                "kid_id": self.kid_id,
                "title": "TEST_Rate Limit Test 2",
                "description": "Testing rate limiting",
                "subject": "Math",
                "points": 10
            }
        )
        
        # Should be rate limited (429)
        assert response2.status_code == 429, f"Expected 429 for rapid requests, got {response2.status_code}"
        data = response2.json()
        assert "wait" in data.get("detail", "").lower() or "rate" in data.get("detail", "").lower()
        print(f"✓ Rate limiting works: second request returned 429 with message: {data.get('detail')}")


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
