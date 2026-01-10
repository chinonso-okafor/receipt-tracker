#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
import uuid
import base64
import io
from PIL import Image

class ReceiptScannerAPITester:
    def __init__(self, base_url="https://receiptscanner-3.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None, expect_json=True):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            test_headers['Authorization'] = f'Bearer {self.session_token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                try:
                    if expect_json:
                        error_data = response.json()
                        details += f", Error: {error_data.get('detail', 'Unknown error')}"
                    else:
                        details += f", Content-Type: {response.headers.get('content-type', 'unknown')}"
                except:
                    details += f", Response: {response.text[:100]}"
            
            self.log_test(name, success, details)
            
            if success and expect_json and response.content:
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                return success, {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def create_test_image(self):
        """Create a simple test receipt image"""
        # Create a simple receipt-like image
        img = Image.new('RGB', (400, 600), color='white')
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG')
        img_data = buffer.getvalue()
        
        return base64.b64encode(img_data).decode('utf-8')

    def test_health_endpoints(self):
        """Test basic health check endpoints"""
        print("\n🔍 Testing Health Endpoints...")
        
        # Test root endpoint
        self.run_test("Root endpoint", "GET", "", 200)
        
        # Test health endpoint
        self.run_test("Health endpoint", "GET", "health", 200)

    def test_categories_endpoint(self):
        """Test categories endpoint"""
        print("\n🔍 Testing Categories Endpoint...")
        
        success, response = self.run_test("Get categories", "GET", "categories", 200)
        
        if success and 'categories' in response:
            categories = response['categories']
            expected_categories = [
                "Meals & Dining", "Travel", "Office Supplies", "Equipment",
                "Software & Subscriptions", "Utilities", "Marketing",
                "Professional Services", "Transportation", "Other"
            ]
            
            if all(cat in categories for cat in expected_categories):
                self.log_test("Categories content validation", True)
            else:
                self.log_test("Categories content validation", False, "Missing expected categories")

    def create_test_session(self):
        """Create a test user and session for authenticated endpoints"""
        print("\n🔍 Using Test Session...")
        
        # Use the session token created in MongoDB
        self.session_token = "test_session_1768030049723"
        self.user_id = "test-user-1768030049723"
        
        try:
            print(f"Using test session token: {self.session_token}")
            print(f"Using test user ID: {self.user_id}")
            
            # Test if we can use this token
            success, response = self.run_test("Test session validation", "GET", "auth/me", 200)
            
            if not success:
                print("⚠️  Note: Authentication tests will be skipped - session validation failed")
                self.session_token = None
                self.user_id = None
                return False
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to validate test session: {e}")
            self.session_token = None
            self.user_id = None
            return False

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔍 Testing Authentication Endpoints...")
        
        if not self.session_token:
            print("⚠️  Skipping auth tests - no valid session token")
            return
        
        # Test get current user
        self.run_test("Get current user", "GET", "auth/me", 200)
        
        # Test logout
        self.run_test("Logout", "POST", "auth/logout", 200)

    def test_expense_endpoints(self):
        """Test expense CRUD operations"""
        print("\n🔍 Testing Expense Endpoints...")
        
        if not self.session_token:
            print("⚠️  Skipping expense tests - no valid session token")
            return
        
        # Test get expenses (empty list is OK)
        success, expenses = self.run_test("Get expenses", "GET", "expenses", 200)
        
        # Test create expense
        expense_data = {
            "vendor": "Test Vendor",
            "date": "2024-01-15",
            "amount": 25.99,
            "currency": "USD",
            "category": "Meals & Dining",
            "payment_method": "Credit Card",
            "receipt_number": "TEST123",
            "line_items": [
                {
                    "description": "Test Item",
                    "quantity": 1,
                    "unit_price": 25.99,
                    "total": 25.99
                }
            ],
            "tags": ["test", "api"],
            "notes": "Test expense created by API test"
        }
        
        success, create_response = self.run_test("Create expense", "POST", "expenses", 200, expense_data)
        
        if success and 'expense_id' in create_response:
            expense_id = create_response['expense_id']
            
            # Test get single expense
            self.run_test("Get single expense", "GET", f"expenses/{expense_id}", 200)
            
            # Test update expense
            update_data = {
                "vendor": "Updated Test Vendor",
                "amount": 30.99
            }
            self.run_test("Update expense", "PUT", f"expenses/{expense_id}", 200, update_data)
            
            # Test delete expense
            self.run_test("Delete expense", "DELETE", f"expenses/{expense_id}", 200)

    def test_receipt_scanning(self):
        """Test receipt scanning functionality"""
        print("\n🔍 Testing Receipt Scanning...")
        
        if not self.session_token:
            print("⚠️  Skipping receipt scanning tests - no valid session token")
            return
        
        try:
            # Create a simple test image as PNG (not JPEG to avoid format issues)
            img = Image.new('RGB', (400, 600), color='white')
            
            # Convert to base64
            buffer = io.BytesIO()
            img.save(buffer, format='PNG')
            img_data = buffer.getvalue()
            
            # Test upload receipt image endpoint
            files = {'file': ('test_receipt.png', img_data, 'image/png')}
            
            url = f"{self.base_url}/upload-receipt-image"
            headers = {'Authorization': f'Bearer {self.session_token}'}
            
            response = requests.post(url, files=files, headers=headers, timeout=30)
            
            if response.status_code == 200:
                self.log_test("Upload receipt image", True)
            else:
                self.log_test("Upload receipt image", False, f"Status: {response.status_code}")
            
            # Test scan receipt endpoint
            response = requests.post(f"{self.base_url}/scan-receipt", files=files, headers=headers, timeout=60)
            
            if response.status_code == 200:
                self.log_test("Scan receipt endpoint", True)
                try:
                    result = response.json()
                    if 'vendor' in result and 'amount' in result:
                        self.log_test("Receipt data extraction", True)
                    else:
                        self.log_test("Receipt data extraction", False, "Missing expected fields")
                except:
                    self.log_test("Receipt data extraction", False, "Invalid JSON response")
            else:
                self.log_test("Scan receipt endpoint", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Receipt scanning tests", False, f"Exception: {str(e)}")

    def test_analytics_endpoints(self):
        """Test analytics endpoints"""
        print("\n🔍 Testing Analytics Endpoints...")
        
        if not self.session_token:
            print("⚠️  Skipping analytics tests - no valid session token")
            return
        
        # Test analytics summary
        self.run_test("Get analytics summary", "GET", "analytics/summary", 200)

    def test_reports_endpoints(self):
        """Test report generation endpoints"""
        print("\n🔍 Testing Reports Endpoints...")
        
        if not self.session_token:
            print("⚠️  Skipping reports tests - no valid session token")
            return
        
        # Test report generation
        report_data = {
            "start_date": "2024-01-01",
            "end_date": "2024-01-31",
            "categories": ["Meals & Dining"],
            "include_images": False,
            "format": "pdf"
        }
        
        self.run_test("Generate PDF report", "POST", "reports/generate", 200, report_data, expect_json=False)
        
        # Test Excel report
        report_data["format"] = "excel"
        self.run_test("Generate Excel report", "POST", "reports/generate", 200, report_data, expect_json=False)

    def test_tags_endpoint(self):
        """Test tags endpoint"""
        print("\n🔍 Testing Tags Endpoint...")
        
        if not self.session_token:
            print("⚠️  Skipping tags tests - no valid session token")
            return
        
        self.run_test("Get tags", "GET", "tags", 200)

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Receipt Scanner API Tests")
        print(f"Testing against: {self.base_url}")
        print("=" * 60)
        
        # Test public endpoints first
        self.test_health_endpoints()
        self.test_categories_endpoint()
        
        # Try to create test session
        session_created = self.create_test_session()
        
        # Test authenticated endpoints if session is available
        if session_created:
            self.test_auth_endpoints()
            self.test_expense_endpoints()
            self.test_receipt_scanning()
            self.test_analytics_endpoints()
            self.test_reports_endpoints()
            self.test_tags_endpoint()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return 1

def main():
    tester = ReceiptScannerAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())