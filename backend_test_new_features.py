#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta

class StudyHelperNewFeaturesTest:
    def __init__(self, base_url="https://rewards-hub-46.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.parent_pin = "1234"
        self.colin_data = {
            "name": "Colin",
            "grade": 7,
            "pin": "1111",
            "avatar_color": "#4F46E5"
        }
        self.patrick_data = {
            "name": "Patrick", 
            "grade": 4,
            "pin": "2222",
            "avatar_color": "#10B981"
        }
        
        # Store created IDs
        self.colin_id = None
        self.patrick_id = None
        self.created_challenge_id = None

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details
        })

    def make_request(self, method, endpoint, data=None, params=None):
        """Make HTTP request with error handling"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            return response
        except Exception as e:
            return None

    def setup_test_kids(self):
        """Create Colin and Patrick for testing"""
        # Create Colin
        response = self.make_request('POST', 'kids', self.colin_data)
        if response and response.status_code == 200:
            self.colin_id = response.json().get('id')
            self.log_test("Create Colin", True, f"ID: {self.colin_id}")
        else:
            self.log_test("Create Colin", False, f"Status: {response.status_code if response else 'No response'}")
            return False
            
        # Create Patrick
        response = self.make_request('POST', 'kids', self.patrick_data)
        if response and response.status_code == 200:
            self.patrick_id = response.json().get('id')
            self.log_test("Create Patrick", True, f"ID: {self.patrick_id}")
        else:
            self.log_test("Create Patrick", False, f"Status: {response.status_code if response else 'No response'}")
            return False
            
        return True

    def test_colin_pin_login(self):
        """Test Colin's PIN login"""
        response = self.make_request('POST', 'auth/verify-pin', {
            "pin": self.colin_data['pin'],
            "mode": "student"
        })
        
        success = (response and response.status_code == 200 and 
                  response.json().get('valid') == True and
                  response.json().get('kid_name') == 'Colin')
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Kid: {response.json().get('kid_name')}"
        
        self.log_test("Colin PIN Login", success, details)
        return success

    def test_study_timer_session(self):
        """Test study timer session creation"""
        if not self.colin_id:
            self.log_test("Study Timer Session", False, "No Colin ID")
            return False
            
        session_data = {
            "kid_id": self.colin_id,
            "subject": "Mathematics",
            "goal_minutes": 15,
            "actual_minutes": 15
        }
        
        response = self.make_request('POST', 'study/session', session_data)
        
        success = response and response.status_code == 200
        if success:
            result = response.json()
            success = (result.get('points_earned', 0) > 0 and
                      'breakdown' in result)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Points: {result.get('points_earned')}"
        
        self.log_test("Study Timer Session", success, details)
        return success

    def test_get_study_sessions(self):
        """Test getting study sessions"""
        if not self.colin_id:
            self.log_test("Get Study Sessions", False, "No Colin ID")
            return False
            
        response = self.make_request('GET', f'study/sessions/{self.colin_id}')
        
        success = response and response.status_code == 200
        if success:
            sessions = response.json()
            success = isinstance(sessions, list)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Sessions: {len(sessions)}"
        
        self.log_test("Get Study Sessions", success, details)
        return success

    def test_streak_tracking(self):
        """Test streak tracking"""
        if not self.colin_id:
            self.log_test("Streak Tracking", False, "No Colin ID")
            return False
            
        response = self.make_request('GET', f'streak/{self.colin_id}')
        
        success = response and response.status_code == 200
        if success:
            streak = response.json()
            success = 'current_streak' in streak and 'longest_streak' in streak
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Current: {streak.get('current_streak')}"
        
        self.log_test("Streak Tracking", success, details)
        return success

    def test_typing_practice_text(self):
        """Test getting typing practice text"""
        response = self.make_request('GET', 'typing/text')
        
        success = response and response.status_code == 200
        if success:
            data = response.json()
            success = 'text' in data and len(data['text']) > 0
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Text length: {len(data['text'])}"
        
        self.log_test("Typing Practice Text", success, details)
        return success

    def test_typing_session(self):
        """Test typing session creation"""
        if not self.colin_id:
            self.log_test("Typing Session", False, "No Colin ID")
            return False
            
        session_data = {
            "kid_id": self.colin_id,
            "wpm": 25,
            "accuracy": 92.5,
            "duration_seconds": 60
        }
        
        response = self.make_request('POST', 'typing/session', session_data)
        
        success = response and response.status_code == 200
        if success:
            result = response.json()
            success = 'points_earned' in result
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Points: {result.get('points_earned')}"
        
        self.log_test("Typing Session", success, details)
        return success

    def test_typing_stats(self):
        """Test typing stats"""
        if not self.colin_id:
            self.log_test("Typing Stats", False, "No Colin ID")
            return False
            
        response = self.make_request('GET', f'typing/stats/{self.colin_id}')
        
        success = response and response.status_code == 200
        if success:
            stats = response.json()
            success = ('best_wpm' in stats and 'avg_accuracy' in stats and 
                      'total_sessions' in stats)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Best WPM: {stats.get('best_wpm')}"
        
        self.log_test("Typing Stats", success, details)
        return success

    def test_badges_system(self):
        """Test badges system"""
        if not self.colin_id:
            self.log_test("Badges System", False, "No Colin ID")
            return False
            
        response = self.make_request('GET', f'badges/{self.colin_id}')
        
        success = response and response.status_code == 200
        if success:
            data = response.json()
            success = ('badges' in data and 'badge_tiers' in data and 
                      'badge_types' in data)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Badges: {len(data.get('badges', []))}"
        
        self.log_test("Badges System", success, details)
        return success

    def test_leaderboard(self):
        """Test leaderboard"""
        response = self.make_request('GET', 'leaderboard')
        
        success = response and response.status_code == 200
        if success:
            leaderboard = response.json()
            success = isinstance(leaderboard, list)
            # Should have Colin and Patrick
            if self.colin_id and self.patrick_id:
                colin_found = any(kid.get('id') == self.colin_id for kid in leaderboard)
                patrick_found = any(kid.get('id') == self.patrick_id for kid in leaderboard)
                success = success and colin_found and patrick_found
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Kids: {len(leaderboard)}"
        
        self.log_test("Leaderboard", success, details)
        return success

    def test_create_weekly_challenge(self):
        """Test creating weekly challenge"""
        challenge_data = {
            "title": "Read for 30 minutes daily",
            "description": "Read any book for at least 30 minutes each day this week",
            "points_reward": 50,
            "target_kid_id": self.colin_id,
            "deadline": (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        }
        
        response = self.make_request('POST', 'challenges', challenge_data)
        
        success = response and response.status_code == 200
        if success:
            challenge = response.json()
            self.created_challenge_id = challenge.get('id')
            success = challenge.get('title') == challenge_data['title']
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Challenge ID: {self.created_challenge_id}"
        
        self.log_test("Create Weekly Challenge", success, details)
        return success

    def test_get_challenges(self):
        """Test getting challenges"""
        response = self.make_request('GET', 'challenges')
        
        success = response and response.status_code == 200
        if success:
            challenges = response.json()
            success = isinstance(challenges, list)
            if self.created_challenge_id:
                success = success and any(c.get('id') == self.created_challenge_id for c in challenges)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Challenges: {len(challenges)}"
        
        self.log_test("Get Challenges", success, details)
        return success

    def test_complete_challenge(self):
        """Test completing a challenge"""
        if not self.created_challenge_id or not self.colin_id:
            self.log_test("Complete Challenge", False, "Missing challenge or kid ID")
            return False
            
        response = self.make_request('POST', f'challenges/{self.created_challenge_id}/complete?kid_id={self.colin_id}')
        
        success = response and response.status_code == 200
        if success:
            result = response.json()
            success = 'points_earned' in result
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Points: {result.get('points_earned')}"
        
        self.log_test("Complete Challenge", success, details)
        return success

    def test_ai_point_estimation(self):
        """Test AI point estimation"""
        if not self.colin_id:
            self.log_test("AI Point Estimation", False, "No Colin ID")
            return False
            
        task_data = {
            "kid_id": self.colin_id,
            "title": "Math homework - fractions",
            "description": "Completed all fraction problems on page 67, learned about equivalent fractions",
            "subject": "Mathematics"
        }
        
        response = self.make_request('POST', 'tasks/estimate-points', task_data)
        
        success = response and response.status_code == 200
        if success:
            estimate = response.json()
            success = ('estimated_points' in estimate and 'reasoning' in estimate and
                      estimate.get('estimated_points', 0) > 0)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Points: {estimate.get('estimated_points')}"
        
        self.log_test("AI Point Estimation", success, details)
        return success

    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete challenge
        if self.created_challenge_id:
            response = self.make_request('DELETE', f'challenges/{self.created_challenge_id}')
            if response and response.status_code == 200:
                print(f"✅ Deleted challenge {self.created_challenge_id}")
            else:
                print(f"❌ Failed to delete challenge {self.created_challenge_id}")
        
        # Delete Colin
        if self.colin_id:
            response = self.make_request('DELETE', f'kids/{self.colin_id}')
            if response and response.status_code == 200:
                print(f"✅ Deleted Colin {self.colin_id}")
            else:
                print(f"❌ Failed to delete Colin {self.colin_id}")
        
        # Delete Patrick
        if self.patrick_id:
            response = self.make_request('DELETE', f'kids/{self.patrick_id}')
            if response and response.status_code == 200:
                print(f"✅ Deleted Patrick {self.patrick_id}")
            else:
                print(f"❌ Failed to delete Patrick {self.patrick_id}")

    def run_all_tests(self):
        """Run all new feature tests"""
        print("🚀 Starting Study Helper New Features Tests")
        print(f"📡 Testing API at: {self.api_url}")
        print("=" * 60)
        
        # Setup test kids
        if not self.setup_test_kids():
            print("❌ Failed to setup test kids, aborting tests")
            return 1
        
        # Test login flow
        self.test_colin_pin_login()
        
        # Test Study Timer features
        self.test_study_timer_session()
        self.test_get_study_sessions()
        self.test_streak_tracking()
        
        # Test Typing Practice features
        self.test_typing_practice_text()
        self.test_typing_session()
        self.test_typing_stats()
        
        # Test Badges system
        self.test_badges_system()
        
        # Test Leaderboard
        self.test_leaderboard()
        
        # Test Weekly Challenges
        self.test_create_weekly_challenge()
        self.test_get_challenges()
        self.test_complete_challenge()
        
        # Test AI Point Estimation
        self.test_ai_point_estimation()
        
        # Cleanup
        self.cleanup()
        
        # Print results
        print("\n" + "=" * 60)
        print(f"📊 New Features Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All new feature tests passed!")
            return 0
        else:
            print("❌ Some new feature tests failed!")
            failed_tests = [test for test in self.test_results if not test['success']]
            print("\nFailed tests:")
            for test in failed_tests:
                print(f"  - {test['name']}: {test['details']}")
            return 1

def main():
    tester = StudyHelperNewFeaturesTest()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())