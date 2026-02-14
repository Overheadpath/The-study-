#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class StudyHelperAPITester:
    def __init__(self, base_url="https://learn-earn-18.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.parent_pin = "1234"
        self.test_kid_data = {
            "name": "Test Kid",
            "grade": 4,
            "pin": "5678",
            "avatar_color": "#4F46E5"
        }
        self.test_reward_data = {
            "name": "Pokemon Booster Pack",
            "description": "Awesome Pokemon cards!",
            "points_required": 25,
            "image_url": "https://images.unsplash.com/photo-1666302936888-d41e661bc3dd?w=400",
            "quantity": 5
        }
        
        # Store created IDs for cleanup
        self.created_kid_id = None
        self.created_reward_id = None
        self.created_task_id = None

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

    def test_health_check(self):
        """Test API health check"""
        response = self.make_request('GET', '')
        success = response and response.status_code == 200
        details = f"Status: {response.status_code if response else 'No response'}"
        self.log_test("API Health Check", success, details)
        return success

    def test_parent_pin_verification(self):
        """Test parent PIN verification"""
        response = self.make_request('POST', 'auth/verify-pin', {
            "pin": self.parent_pin,
            "mode": "parent"
        })
        
        success = (response and response.status_code == 200 and 
                  response.json().get('valid') == True and
                  response.json().get('mode') == 'parent')
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if response and response.status_code == 200:
            details += f", Valid: {response.json().get('valid')}"
        
        self.log_test("Parent PIN Verification", success, details)
        return success

    def test_invalid_pin_verification(self):
        """Test invalid PIN verification"""
        response = self.make_request('POST', 'auth/verify-pin', {
            "pin": "9999",
            "mode": "parent"
        })
        
        success = (response and response.status_code == 200 and 
                  response.json().get('valid') == False)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        self.log_test("Invalid PIN Rejection", success, details)
        return success

    def test_create_kid(self):
        """Test creating a kid"""
        response = self.make_request('POST', 'kids', self.test_kid_data)
        
        success = response and response.status_code == 200
        if success:
            kid_data = response.json()
            self.created_kid_id = kid_data.get('id')
            success = (kid_data.get('name') == self.test_kid_data['name'] and
                      kid_data.get('grade') == self.test_kid_data['grade'] and
                      kid_data.get('pin') == self.test_kid_data['pin'])
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Kid ID: {self.created_kid_id}"
        
        self.log_test("Create Kid", success, details)
        return success

    def test_get_kids(self):
        """Test getting all kids"""
        response = self.make_request('GET', 'kids')
        
        success = response and response.status_code == 200
        if success:
            kids = response.json()
            success = isinstance(kids, list) and len(kids) > 0
            if self.created_kid_id:
                success = success and any(kid.get('id') == self.created_kid_id for kid in kids)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Found {len(response.json())} kids"
        
        self.log_test("Get Kids List", success, details)
        return success

    def test_student_pin_verification(self):
        """Test student PIN verification"""
        if not self.created_kid_id:
            self.log_test("Student PIN Verification", False, "No kid created")
            return False
            
        response = self.make_request('POST', 'auth/verify-pin', {
            "pin": self.test_kid_data['pin'],
            "mode": "student"
        })
        
        success = (response and response.status_code == 200 and 
                  response.json().get('valid') == True and
                  response.json().get('mode') == 'student' and
                  response.json().get('kid_id') == self.created_kid_id)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        self.log_test("Student PIN Verification", success, details)
        return success

    def test_create_task(self):
        """Test creating a task"""
        if not self.created_kid_id:
            self.log_test("Create Task", False, "No kid created")
            return False
            
        task_data = {
            "kid_id": self.created_kid_id,
            "title": "Math Homework Page 45",
            "description": "Completed all multiplication problems and word problems on page 45",
            "subject": "Mathematics"
        }
        
        response = self.make_request('POST', 'tasks', task_data)
        
        success = response and response.status_code == 200
        if success:
            task = response.json()
            self.created_task_id = task.get('id')
            success = (task.get('title') == task_data['title'] and
                      task.get('status') == 'pending')
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Task ID: {self.created_task_id}"
        
        self.log_test("Create Task", success, details)
        return success

    def test_get_pending_tasks(self):
        """Test getting pending tasks"""
        response = self.make_request('GET', 'tasks', params={'status': 'pending'})
        
        success = response and response.status_code == 200
        if success:
            tasks = response.json()
            success = isinstance(tasks, list)
            if self.created_task_id:
                success = success and any(task.get('id') == self.created_task_id for task in tasks)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Found {len(response.json())} pending tasks"
        
        self.log_test("Get Pending Tasks", success, details)
        return success

    def test_approve_task(self):
        """Test approving a task"""
        if not self.created_task_id:
            self.log_test("Approve Task", False, "No task created")
            return False
            
        approval_data = {
            "status": "approved",
            "points_awarded": 15,
            "rating": 4,
            "parent_feedback": "Great work on your math homework!"
        }
        
        response = self.make_request('PUT', f'tasks/{self.created_task_id}/approve', approval_data)
        
        success = response and response.status_code == 200
        if success:
            task = response.json()
            success = (task.get('status') == 'approved' and
                      task.get('points_awarded') == 15)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        self.log_test("Approve Task", success, details)
        return success

    def test_kid_points_updated(self):
        """Test that kid's points were updated after task approval"""
        if not self.created_kid_id:
            self.log_test("Kid Points Updated", False, "No kid created")
            return False
            
        response = self.make_request('GET', f'kids/{self.created_kid_id}')
        
        success = response and response.status_code == 200
        if success:
            kid = response.json()
            success = kid.get('points', 0) >= 15  # Should have at least 15 points from approved task
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Points: {response.json().get('points', 0)}"
        
        self.log_test("Kid Points Updated", success, details)
        return success

    def test_create_reward(self):
        """Test creating a reward"""
        response = self.make_request('POST', 'rewards', self.test_reward_data)
        
        success = response and response.status_code == 200
        if success:
            reward = response.json()
            self.created_reward_id = reward.get('id')
            success = (reward.get('name') == self.test_reward_data['name'] and
                      reward.get('points_required') == self.test_reward_data['points_required'])
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Reward ID: {self.created_reward_id}"
        
        self.log_test("Create Reward", success, details)
        return success

    def test_get_rewards(self):
        """Test getting all rewards"""
        response = self.make_request('GET', 'rewards')
        
        success = response and response.status_code == 200
        if success:
            rewards = response.json()
            success = isinstance(rewards, list)
            if self.created_reward_id:
                success = success and any(reward.get('id') == self.created_reward_id for reward in rewards)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Found {len(response.json())} rewards"
        
        self.log_test("Get Rewards List", success, details)
        return success

    def test_redeem_reward(self):
        """Test redeeming a reward"""
        if not self.created_reward_id or not self.created_kid_id:
            self.log_test("Redeem Reward", False, "Missing reward or kid")
            return False
            
        # Use the correct URL format with query parameter
        url = f"{self.api_url}/rewards/{self.created_reward_id}/redeem?kid_id={self.created_kid_id}"
        try:
            response = requests.post(url, headers={'Content-Type': 'application/json'})
        except Exception as e:
            response = None
        
        success = response and response.status_code == 200
        if success:
            redemption = response.json()
            success = (redemption.get('kid_id') == self.created_kid_id and
                      redemption.get('reward_id') == self.created_reward_id)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        self.log_test("Redeem Reward", success, details)
        return success

    def test_get_subjects(self):
        """Test getting subjects for a grade"""
        response = self.make_request('GET', 'subjects/4')
        
        success = response and response.status_code == 200
        if success:
            data = response.json()
            subjects = data.get('subjects', [])
            success = isinstance(subjects, list) and len(subjects) > 0
            # Check for expected Grade 4 subjects
            expected_subjects = ['English', 'Mathematics', 'Afrikaans']
            success = success and any(subj in subjects for subj in expected_subjects)
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Found {len(data.get('subjects', []))} subjects"
        
        self.log_test("Get Grade 4 Subjects", success, details)
        return success

    def test_ai_chat(self):
        """Test AI chat functionality"""
        if not self.created_kid_id:
            self.log_test("AI Chat", False, "No kid created")
            return False
            
        chat_data = {
            "kid_id": self.created_kid_id,
            "message": "What is 2 + 2?",
            "subject": "Mathematics"
        }
        
        response = self.make_request('POST', 'chat', chat_data)
        
        success = response and response.status_code == 200
        if success:
            chat_response = response.json()
            success = 'response' in chat_response and len(chat_response['response']) > 0
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if response and response.status_code != 200:
            try:
                error_detail = response.json().get('detail', 'Unknown error')
                details += f", Error: {error_detail}"
            except:
                details += f", Response: {response.text[:100]}"
        
        self.log_test("AI Chat", success, details)
        return success

    def test_points_history(self):
        """Test getting points history"""
        if not self.created_kid_id:
            self.log_test("Points History", False, "No kid created")
            return False
            
        response = self.make_request('GET', 'points/history', params={'kid_id': self.created_kid_id})
        
        success = response and response.status_code == 200
        if success:
            history = response.json()
            success = isinstance(history, list)
            # Should have at least one entry from task approval
            success = success and len(history) > 0
        
        details = f"Status: {response.status_code if response else 'No response'}"
        if success:
            details += f", Found {len(response.json())} history entries"
        
        self.log_test("Points History", success, details)
        return success

    def test_dashboard_stats(self):
        """Test dashboard stats endpoints"""
        if not self.created_kid_id:
            self.log_test("Dashboard Stats", False, "No kid created")
            return False
            
        # Test kid stats
        response = self.make_request('GET', f'stats/kid/{self.created_kid_id}')
        kid_stats_success = response and response.status_code == 200
        
        # Test parent stats  
        response2 = self.make_request('GET', 'stats/parent')
        parent_stats_success = response2 and response2.status_code == 200
        
        success = kid_stats_success and parent_stats_success
        details = f"Kid stats: {response.status_code if response else 'No response'}, Parent stats: {response2.status_code if response2 else 'No response'}"
        
        self.log_test("Dashboard Stats", success, details)
        return success

    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created task
        if self.created_task_id:
            response = self.make_request('DELETE', f'tasks/{self.created_task_id}')
            if response and response.status_code == 200:
                print(f"✅ Deleted task {self.created_task_id}")
            else:
                print(f"❌ Failed to delete task {self.created_task_id}")
        
        # Delete created reward
        if self.created_reward_id:
            response = self.make_request('DELETE', f'rewards/{self.created_reward_id}')
            if response and response.status_code == 200:
                print(f"✅ Deleted reward {self.created_reward_id}")
            else:
                print(f"❌ Failed to delete reward {self.created_reward_id}")
        
        # Delete created kid
        if self.created_kid_id:
            response = self.make_request('DELETE', f'kids/{self.created_kid_id}')
            if response and response.status_code == 200:
                print(f"✅ Deleted kid {self.created_kid_id}")
            else:
                print(f"❌ Failed to delete kid {self.created_kid_id}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting Study Helper API Tests")
        print(f"📡 Testing API at: {self.api_url}")
        print("=" * 50)
        
        # Core API tests
        self.test_health_check()
        
        # Authentication tests
        self.test_parent_pin_verification()
        self.test_invalid_pin_verification()
        
        # Kid management tests
        self.test_create_kid()
        self.test_get_kids()
        self.test_student_pin_verification()
        
        # Task workflow tests
        self.test_create_task()
        self.test_get_pending_tasks()
        self.test_approve_task()
        self.test_kid_points_updated()
        
        # Reward system tests
        self.test_create_reward()
        self.test_get_rewards()
        self.test_redeem_reward()
        
        # Additional features
        self.test_get_subjects()
        self.test_ai_chat()
        self.test_points_history()
        self.test_dashboard_stats()
        
        # Cleanup
        self.cleanup()
        
        # Print results
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("❌ Some tests failed!")
            failed_tests = [test for test in self.test_results if not test['success']]
            print("\nFailed tests:")
            for test in failed_tests:
                print(f"  - {test['name']}: {test['details']}")
            return 1

def main():
    tester = StudyHelperAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())