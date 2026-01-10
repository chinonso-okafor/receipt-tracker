from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Depends, Response, Request
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import base64
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
import xlsxwriter
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME')]

# LLM API Key - Use Emergent key or fallback to Anthropic key
LLM_API_KEY = os.environ.get('EMERGENT_LLM_KEY') or os.environ.get('ANTHROPIC_API_KEY', '')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    session_id: str
    user_id: str
    session_token: str
    expires_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LineItem(BaseModel):
    description: str
    quantity: Optional[float] = 1
    unit_price: Optional[float] = None
    total: Optional[float] = None

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    expense_id: str = Field(default_factory=lambda: f"exp_{uuid.uuid4().hex[:12]}")
    user_id: str
    vendor: str
    date: str
    amount: float
    currency: str = "USD"
    category: str
    payment_method: Optional[str] = None
    receipt_number: Optional[str] = None
    line_items: List[LineItem] = []
    tags: List[str] = []
    notes: Optional[str] = None
    receipt_image: Optional[str] = None  # Base64 encoded or URL
    confidence_score: Optional[float] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCreate(BaseModel):
    vendor: str
    date: str
    amount: float
    currency: str = "USD"
    category: str
    payment_method: Optional[str] = None
    receipt_number: Optional[str] = None
    line_items: List[LineItem] = []
    tags: List[str] = []
    notes: Optional[str] = None
    receipt_image: Optional[str] = None
    confidence_score: Optional[float] = None

class ExpenseUpdate(BaseModel):
    vendor: Optional[str] = None
    date: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    payment_method: Optional[str] = None
    receipt_number: Optional[str] = None
    line_items: Optional[List[LineItem]] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None

class ReceiptScanResult(BaseModel):
    vendor: str
    date: str
    amount: float
    currency: str
    category: str
    payment_method: Optional[str] = None
    receipt_number: Optional[str] = None
    line_items: List[LineItem] = []
    confidence_score: float

class ReportRequest(BaseModel):
    start_date: str
    end_date: str
    categories: Optional[List[str]] = None
    include_images: bool = False
    format: str = "pdf"  # "pdf" or "excel"

# ============== AUTH HELPERS ==============

async def get_current_user(request: Request) -> User:
    """Get current user from session token in cookie or Authorization header"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find session
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry
    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Find user
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    return User(**user_doc)

# ============== AUTH ROUTES ==============

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id from Emergent Auth for a session token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Get user data from Emergent Auth
    async with httpx.AsyncClient() as client:
        auth_response = await client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        
        if auth_response.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        
        user_data = auth_response.json()
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data["email"]}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user data
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": user_data["name"],
                "picture": user_data.get("picture"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": user_data["email"],
            "name": user_data["name"],
            "picture": user_data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(new_user)
    
    # Create session
    session_token = user_data.get("session_token", f"sess_{uuid.uuid4().hex}")
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session_doc = {
        "session_id": str(uuid.uuid4()),
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    # REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60  # 7 days
    )
    
    # Get user for response
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return {"user": user_doc, "session_token": session_token}

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return current_user.model_dump()

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user and clear session"""
    session_token = request.cookies.get("session_token")
    
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/", secure=True, samesite="none")
    return {"message": "Logged out successfully"}

# ============== RECEIPT SCANNING ==============

CATEGORIES = [
    "Meals & Dining",
    "Travel",
    "Office Supplies",
    "Equipment",
    "Software & Subscriptions",
    "Utilities",
    "Marketing",
    "Professional Services",
    "Transportation",
    "Other"
]

@api_router.post("/scan-receipt", response_model=ReceiptScanResult)
async def scan_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Scan a receipt image and extract data using Anthropic Vision"""
    from PIL import Image as PILImage
    import json
    
    # Read file content
    content = await file.read()
    
    # Detect actual image type from content (not relying on content_type header)
    detected_type = "image/jpeg"  # default
    if content[:8] == b'\x89PNG\r\n\x1a\n':
        detected_type = "image/png"
    elif content[:2] == b'\xff\xd8':
        detected_type = "image/jpeg"
    elif content[:4] == b'RIFF' and content[8:12] == b'WEBP':
        detected_type = "image/webp"
    elif content[:4] == b'%PDF':
        detected_type = "application/pdf"
    
    # Convert PDF to image (simplified - just reject for now)
    if detected_type == "application/pdf":
        raise HTTPException(status_code=400, detail="PDF files are not yet supported. Please upload an image (JPG, PNG, WEBP).")
    
    # Process and compress image - ALWAYS convert to JPEG for consistency
    try:
        img = PILImage.open(io.BytesIO(content))
        
        # Convert to RGB (handles RGBA, P, LA, etc.)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Resize if too large (max dimension 1500px to keep well under 5MB limit)
        max_dimension = 1500
        if img.width > max_dimension or img.height > max_dimension:
            ratio = min(max_dimension / img.width, max_dimension / img.height)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, PILImage.Resampling.LANCZOS)
        
        # Always save as JPEG for consistency
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=85, optimize=True)
        content = buffer.getvalue()
        detected_type = "image/jpeg"
        
        # If still too large, reduce quality further
        if len(content) > 3 * 1024 * 1024:  # 3MB
            buffer = io.BytesIO()
            img.save(buffer, format='JPEG', quality=50, optimize=True)
            content = buffer.getvalue()
            
    except Exception as e:
        logger.error(f"Error processing image: {e}")
        raise HTTPException(status_code=400, detail=f"Could not process image: {str(e)}")
    
    # Encode to base64
    image_base64 = base64.b64encode(content).decode("utf-8")
    
    logger.info(f"Image processed: {len(content)} bytes, type: {detected_type}")
    
    # Call Anthropic Vision API directly
    try:
        prompt = f"""Analyze this receipt image and extract the following information. Return a JSON object with these fields:

{{
    "vendor": "Store/merchant name",
    "date": "YYYY-MM-DD format",
    "amount": 0.00,
    "currency": "USD",
    "category": "One of: {', '.join(CATEGORIES)}",
    "payment_method": "Cash/Credit Card/Debit Card/etc or null",
    "receipt_number": "Receipt/transaction number or null",
    "line_items": [
        {{"description": "Item name", "quantity": 1, "unit_price": 0.00, "total": 0.00}}
    ],
    "confidence_score": 0.0 to 1.0 (how confident you are in the extraction)
}}

Be precise with the amount. If you can't read something clearly, make your best guess and lower the confidence score.
Only return valid JSON, no other text."""

        # Use direct API call to Anthropic
        async with httpx.AsyncClient(timeout=60.0) as http_client:
            api_response = await http_client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": LLM_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 1024,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": detected_type,
                                        "data": image_base64
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                }
            )
        
        if api_response.status_code != 200:
            error_detail = api_response.json() if api_response.headers.get("content-type", "").startswith("application/json") else api_response.text
            logger.error(f"Anthropic API error: {error_detail}")
            raise HTTPException(status_code=500, detail=f"AI service error: {api_response.status_code}")
        
        response_data = api_response.json()
        response_text = response_data["content"][0]["text"]
        
        # Clean up response if it has markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        
        result = json.loads(response_text.strip())
        
        return ReceiptScanResult(
            vendor=result.get("vendor", "Unknown"),
            date=result.get("date", datetime.now().strftime("%Y-%m-%d")),
            amount=float(result.get("amount", 0)),
            currency=result.get("currency", "USD"),
            category=result.get("category", "Other"),
            payment_method=result.get("payment_method"),
            receipt_number=result.get("receipt_number"),
            line_items=[LineItem(**item) for item in result.get("line_items", [])],
            confidence_score=float(result.get("confidence_score", 0.5))
        )
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning receipt: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to scan receipt: {str(e)}")

@api_router.post("/upload-receipt-image")
async def upload_receipt_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """Upload a receipt image and return base64 encoded data"""
    content = await file.read()
    
    # Validate file type
    content_type = file.content_type or "image/jpeg"
    if content_type not in ["image/jpeg", "image/png", "image/webp", "application/pdf"]:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    
    # Return base64 encoded image
    image_base64 = base64.b64encode(content).decode("utf-8")
    return {
        "image_data": f"data:{content_type};base64,{image_base64}",
        "content_type": content_type
    }

# ============== EXPENSE CRUD ==============

@api_router.post("/expenses", response_model=dict)
async def create_expense(
    expense: ExpenseCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new expense"""
    expense_doc = Expense(
        user_id=current_user.user_id,
        **expense.model_dump()
    )
    
    doc = expense_doc.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    doc['updated_at'] = doc['updated_at'].isoformat()
    
    await db.expenses.insert_one(doc)
    
    return {"expense_id": expense_doc.expense_id, "message": "Expense created successfully"}

@api_router.get("/expenses")
async def get_expenses(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    vendor: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get all expenses with optional filters"""
    query = {"user_id": current_user.user_id}
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    if category:
        query["category"] = category
    if min_amount is not None:
        query["amount"] = {"$gte": min_amount}
    if max_amount is not None:
        if "amount" in query:
            query["amount"]["$lte"] = max_amount
        else:
            query["amount"] = {"$lte": max_amount}
    if vendor:
        query["vendor"] = {"$regex": vendor, "$options": "i"}
    if tag:
        query["tags"] = tag
    if search:
        query["$or"] = [
            {"vendor": {"$regex": search, "$options": "i"}},
            {"notes": {"$regex": search, "$options": "i"}},
            {"receipt_number": {"$regex": search, "$options": "i"}}
        ]
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return expenses

@api_router.get("/expenses/{expense_id}")
async def get_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user)
):
    """Get a single expense"""
    expense = await db.expenses.find_one(
        {"expense_id": expense_id, "user_id": current_user.user_id},
        {"_id": 0}
    )
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return expense

@api_router.put("/expenses/{expense_id}")
async def update_expense(
    expense_id: str,
    update: ExpenseUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an expense"""
    update_dict = {k: v for k, v in update.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.expenses.update_one(
        {"expense_id": expense_id, "user_id": current_user.user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense updated successfully"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete an expense"""
    result = await db.expenses.delete_one(
        {"expense_id": expense_id, "user_id": current_user.user_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted successfully"}

@api_router.post("/expenses/bulk-delete")
async def bulk_delete_expenses(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Delete multiple expenses"""
    body = await request.json()
    expense_ids = body.get("expense_ids", [])
    
    result = await db.expenses.delete_many(
        {"expense_id": {"$in": expense_ids}, "user_id": current_user.user_id}
    )
    
    return {"deleted_count": result.deleted_count}

# ============== ANALYTICS ==============

@api_router.get("/analytics/summary")
async def get_analytics_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """Get spending summary analytics"""
    query = {"user_id": current_user.user_id}
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(10000)
    
    if not expenses:
        return {
            "total_expenses": 0,
            "expense_count": 0,
            "average_expense": 0,
            "category_breakdown": [],
            "top_vendors": [],
            "monthly_trend": []
        }
    
    # Calculate totals
    total = sum(e["amount"] for e in expenses)
    count = len(expenses)
    
    # Category breakdown
    category_totals = {}
    for e in expenses:
        cat = e.get("category", "Other")
        category_totals[cat] = category_totals.get(cat, 0) + e["amount"]
    
    category_breakdown = [
        {"category": k, "amount": v, "percentage": (v / total * 100) if total > 0 else 0}
        for k, v in sorted(category_totals.items(), key=lambda x: -x[1])
    ]
    
    # Top vendors
    vendor_totals = {}
    for e in expenses:
        vendor = e.get("vendor", "Unknown")
        vendor_totals[vendor] = vendor_totals.get(vendor, 0) + e["amount"]
    
    top_vendors = [
        {"vendor": k, "amount": v}
        for k, v in sorted(vendor_totals.items(), key=lambda x: -x[1])[:10]
    ]
    
    # Monthly trend
    monthly_totals = {}
    for e in expenses:
        month = e["date"][:7]  # YYYY-MM
        monthly_totals[month] = monthly_totals.get(month, 0) + e["amount"]
    
    monthly_trend = [
        {"month": k, "amount": v}
        for k, v in sorted(monthly_totals.items())
    ]
    
    return {
        "total_expenses": total,
        "expense_count": count,
        "average_expense": total / count if count > 0 else 0,
        "category_breakdown": category_breakdown,
        "top_vendors": top_vendors,
        "monthly_trend": monthly_trend
    }

# ============== REPORTS ==============

@api_router.post("/reports/generate")
async def generate_report(
    report_request: ReportRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate expense report as PDF or Excel"""
    
    # Get expenses
    query = {
        "user_id": current_user.user_id,
        "date": {"$gte": report_request.start_date, "$lte": report_request.end_date}
    }
    
    if report_request.categories:
        query["category"] = {"$in": report_request.categories}
    
    expenses = await db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    
    if report_request.format == "excel":
        return await generate_excel_report(expenses, report_request, current_user)
    else:
        return await generate_pdf_report(expenses, report_request, current_user)

async def generate_pdf_report(expenses: list, request: ReportRequest, user: User):
    """Generate PDF report"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=30
    )
    elements.append(Paragraph("Expense Report", title_style))
    
    # Date range
    elements.append(Paragraph(
        f"Period: {request.start_date} to {request.end_date}",
        styles['Normal']
    ))
    elements.append(Paragraph(f"Generated by: {user.name}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Summary
    total = sum(e["amount"] for e in expenses)
    elements.append(Paragraph(f"Total Expenses: ${total:,.2f}", styles['Heading2']))
    elements.append(Paragraph(f"Number of Receipts: {len(expenses)}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Table
    if expenses:
        table_data = [["Date", "Vendor", "Category", "Amount"]]
        for e in expenses:
            table_data.append([
                e["date"],
                e["vendor"][:30],
                e["category"],
                f"${e['amount']:,.2f}"
            ])
        
        table = Table(table_data, colWidths=[1.2*inch, 2.5*inch, 1.8*inch, 1.2*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1A3C34")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor("#F9F9F7")),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor("#E5E7EB")),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (-1, 1), (-1, -1), 'RIGHT'),
        ]))
        elements.append(table)
    
    doc.build(elements)
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=expense_report_{request.start_date}_{request.end_date}.pdf"}
    )

async def generate_excel_report(expenses: list, request: ReportRequest, user: User):
    """Generate Excel report"""
    buffer = io.BytesIO()
    workbook = xlsxwriter.Workbook(buffer)
    worksheet = workbook.add_worksheet("Expenses")
    
    # Formats
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#1A3C34',
        'font_color': 'white',
        'border': 1
    })
    money_format = workbook.add_format({'num_format': '$#,##0.00', 'border': 1})
    cell_format = workbook.add_format({'border': 1})
    
    # Headers
    headers = ["Date", "Vendor", "Category", "Amount", "Payment Method", "Receipt #", "Notes", "Tags"]
    for col, header in enumerate(headers):
        worksheet.write(0, col, header, header_format)
    
    # Data
    for row, expense in enumerate(expenses, 1):
        worksheet.write(row, 0, expense["date"], cell_format)
        worksheet.write(row, 1, expense["vendor"], cell_format)
        worksheet.write(row, 2, expense["category"], cell_format)
        worksheet.write(row, 3, expense["amount"], money_format)
        worksheet.write(row, 4, expense.get("payment_method", ""), cell_format)
        worksheet.write(row, 5, expense.get("receipt_number", ""), cell_format)
        worksheet.write(row, 6, expense.get("notes", ""), cell_format)
        worksheet.write(row, 7, ", ".join(expense.get("tags", [])), cell_format)
    
    # Summary row
    summary_row = len(expenses) + 2
    worksheet.write(summary_row, 2, "TOTAL:", header_format)
    worksheet.write(summary_row, 3, sum(e["amount"] for e in expenses), money_format)
    
    # Column widths
    worksheet.set_column(0, 0, 12)
    worksheet.set_column(1, 1, 25)
    worksheet.set_column(2, 2, 20)
    worksheet.set_column(3, 3, 12)
    worksheet.set_column(4, 4, 15)
    worksheet.set_column(5, 5, 15)
    worksheet.set_column(6, 6, 30)
    worksheet.set_column(7, 7, 20)
    
    workbook.close()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=expense_report_{request.start_date}_{request.end_date}.xlsx"}
    )

# ============== CATEGORIES ==============

@api_router.get("/categories")
async def get_categories():
    """Get list of expense categories"""
    return {"categories": CATEGORIES}

# ============== TAGS ==============

@api_router.get("/tags")
async def get_tags(current_user: User = Depends(get_current_user)):
    """Get all unique tags used by the user"""
    expenses = await db.expenses.find(
        {"user_id": current_user.user_id, "tags": {"$exists": True, "$ne": []}},
        {"_id": 0, "tags": 1}
    ).to_list(10000)
    
    all_tags = set()
    for e in expenses:
        all_tags.update(e.get("tags", []))
    
    return {"tags": sorted(list(all_tags))}

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "Receipt Scanner API", "status": "healthy"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
