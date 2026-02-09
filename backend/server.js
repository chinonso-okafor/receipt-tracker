require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const cookie = require('@fastify/cookie');
const multipart = require('@fastify/multipart');
const { initializeDb, getDb } = require('./db');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const Anthropic = require('@anthropic-ai/sdk');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// ============== CONSTANTS ==============

const PORT = process.env.PORT || 8000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const CATEGORIES = [
  'Groceries', 'Meals & Dining', 'Travel', 'Transportation',
  'Office Supplies', 'Equipment', 'Software & Subscriptions',
  'Utilities', 'Marketing', 'Professional Services',
  'Healthcare', 'Entertainment', 'Shopping',
  'Shipping & Postage', 'Other'
];

// ============== PLUGINS ==============

async function start() {
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(cookie);

  await fastify.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // Initialize database
  initializeDb();

  // ============== AUTH MIDDLEWARE ==============

  function authenticate(request, reply) {
    const token = request.cookies.session_token;
    if (!token) {
      return reply.status(401).send({ detail: 'Not authenticated' });
    }

    const db = getDb();
    const session = db.prepare(
      'SELECT user_id, expires_at FROM sessions WHERE session_token = ?'
    ).get(token);

    if (!session) {
      return reply.status(401).send({ detail: 'Invalid session' });
    }

    if (new Date(session.expires_at + 'Z') < new Date()) {
      return reply.status(401).send({ detail: 'Session expired' });
    }

    const user = db.prepare(
      'SELECT user_id, email, name, picture, created_at FROM users WHERE user_id = ?'
    ).get(session.user_id);

    if (!user) {
      return reply.status(401).send({ detail: 'User not found' });
    }

    request.user = user;
  }

  // ============== AUTH ROUTES ==============

  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body || {};
    if (!email || !password) {
      return reply.status(400).send({ detail: 'Email and password required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return reply.status(401).send({ detail: 'Invalid email or password' });
    }

    // Create session
    const sessionToken = `sess_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO sessions (session_token, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(sessionToken, user.user_id, expiresAt);

    reply.setCookie('session_token', sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return {
      user: {
        user_id: user.user_id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        created_at: user.created_at,
      },
      session_token: sessionToken,
    };
  });

  fastify.get('/api/auth/me', { preHandler: authenticate }, async (request) => {
    return request.user;
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies.session_token;
    if (token) {
      const db = getDb();
      db.prepare('DELETE FROM sessions WHERE session_token = ?').run(token);
    }

    reply.clearCookie('session_token', { path: '/' });
    return { message: 'Logged out successfully' };
  });

  // ============== RECEIPT SCANNING ==============

  fastify.post('/api/scan-receipt', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ detail: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();

    // Detect file type from magic bytes
    let isPdf = false;
    let detectedType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) detectedType = 'image/png';
    else if (buffer[0] === 0xFF && buffer[1] === 0xD8) detectedType = 'image/jpeg';
    else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
             buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) detectedType = 'image/webp';
    else if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) isPdf = true;

    let imageBuffer;

    if (isPdf) {
      // For PDF: use sharp to try converting, or return error
      // sharp doesn't handle PDF natively, so we'll handle this gracefully
      try {
        // Try to use the first page via pdf rendering
        // For now, we'll inform the user that PDF scanning requires the image to be extracted
        // A simple approach: try sharp which may work with some PDF configurations
        imageBuffer = await sharp(buffer, { density: 200 })
          .jpeg({ quality: 85 })
          .toBuffer();
        detectedType = 'image/jpeg';
      } catch {
        return reply.status(400).send({ detail: 'PDF processing failed. Please upload an image (JPG, PNG, WEBP) instead.' });
      }
    } else {
      // Process image: resize and compress
      try {
        const metadata = await sharp(buffer).metadata();
        let pipeline = sharp(buffer);

        const maxDimension = 1500;
        if (metadata.width > maxDimension || metadata.height > maxDimension) {
          pipeline = pipeline.resize(maxDimension, maxDimension, { fit: 'inside' });
        }

        imageBuffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
        detectedType = 'image/jpeg';

        // If still too large, compress more
        if (imageBuffer.length > 3 * 1024 * 1024) {
          imageBuffer = await sharp(imageBuffer).jpeg({ quality: 50 }).toBuffer();
        }
      } catch (err) {
        return reply.status(400).send({ detail: `Could not process image: ${err.message}` });
      }
    }

    const imageBase64 = imageBuffer.toString('base64');

    // Build prompt
    const currentDate = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();

    const prompt = `You are analyzing a receipt image. Today's date is ${currentDate}. The current year is ${currentYear}.

IMPORTANT INSTRUCTIONS:
1. Extract the COMPLETE vendor name exactly as shown (e.g., "Canada Post / Postes Canada" not just "Postes Canada")
2. For the date, use the EXACT date shown on the receipt. If the year shown is ${currentYear}, use ${currentYear}. Do NOT assume dates are from previous years.
3. For payment method, look for: "VISA", "MASTERCARD", "MC", "AMEX", "DEBIT", "CASH", "INTERAC", card ending numbers, etc.
4. The receipt_number is any transaction ID, order number, reference number, or receipt number printed on the receipt.
5. Extract ALL line items with their prices.
6. CURRENCY DETECTION - This is CRITICAL. Detect the currency based on these rules:
   - Look for explicit currency codes on receipt: CAD, USD, EUR, GBP
   - Look for tax indicators:
     * GST, HST, PST, QST = CANADIAN receipt = CAD
     * "Sales Tax" only (no GST/HST/PST) = likely US = USD
   - Canadian stores (ALWAYS use CAD):
     * Best Buy (in Canada), Canadian Tire, Shoppers Drug Mart, Loblaws, Metro, Sobeys
     * Tim Hortons, Walmart Canada, Costco Canada, Home Depot Canada
     * Canada Post, LCBO, Beer Store, Petro-Canada, Esso, Shell Canada
     * Any store with Canadian address (province codes: ON, QC, BC, AB, etc.)
   - US stores (use USD):
     * Stores with US state addresses (CA, NY, TX, FL, etc.)
     * Only when NO Canadian tax indicators present
   - DEFAULT: If you see any Canadian province or GST/HST/PST, use CAD
7. Round all amounts to exactly 2 decimal places.

Return a JSON object with these fields:
{
    "vendor": "Complete store/merchant name exactly as shown",
    "date": "YYYY-MM-DD format - use the EXACT year shown on receipt",
    "amount": 0.00,
    "currency": "CAD if Canadian taxes/address/store, otherwise USD/EUR/GBP",
    "category": "One of: ${CATEGORIES.join(', ')}",
    "payment_method": "VISA/Mastercard/Debit/Cash/Interac/etc - look for card type or payment indicators",
    "receipt_number": "Transaction ID, order #, reference #, or receipt # from the receipt",
    "line_items": [
        {"description": "Item name", "quantity": 1, "unit_price": 0.00, "total": 0.00}
    ],
    "confidence_score": 0.0 to 1.0
}

Only return valid JSON, no other text.`;

    // Call Anthropic Vision API
    if (!ANTHROPIC_API_KEY) {
      return reply.status(500).send({ detail: 'ANTHROPIC_API_KEY not configured' });
    }

    try {
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: detectedType,
                  data: imageBase64,
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });

      let responseText = response.content[0].text;

      // Clean up markdown code blocks
      if (responseText.includes('```json')) {
        responseText = responseText.split('```json')[1].split('```')[0];
      } else if (responseText.includes('```')) {
        responseText = responseText.split('```')[1].split('```')[0];
      }

      const result = JSON.parse(responseText.trim());

      return {
        vendor: result.vendor || 'Unknown',
        date: result.date || currentDate,
        amount: parseFloat(result.amount) || 0,
        currency: result.currency || 'USD',
        category: result.category || 'Other',
        payment_method: result.payment_method || null,
        receipt_number: result.receipt_number || null,
        line_items: result.line_items || [],
        confidence_score: parseFloat(result.confidence_score) || 0.5,
      };
    } catch (err) {
      fastify.log.error(`Error scanning receipt: ${err.message}`);

      // Handle Anthropic API errors with clear messages
      if (err.status === 400 && err.message?.includes('credit balance')) {
        return reply.status(402).send({ detail: 'Anthropic API credit balance is too low. Please add credits at console.anthropic.com.' });
      }
      if (err.status === 401) {
        return reply.status(500).send({ detail: 'Invalid Anthropic API key. Check your ANTHROPIC_API_KEY in backend/.env.' });
      }
      if (err.status === 429) {
        return reply.status(429).send({ detail: 'Rate limited by Anthropic API. Please wait a moment and try again.' });
      }
      if (err.message?.includes('JSON')) {
        return reply.status(500).send({ detail: 'Failed to parse AI response' });
      }
      return reply.status(500).send({ detail: `Failed to scan receipt: ${err.message}` });
    }
  });

  fastify.post('/api/upload-receipt-image', { preHandler: authenticate }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ detail: 'No file uploaded' });
    }

    const buffer = await data.toBuffer();
    const contentType = data.mimetype || 'image/jpeg';

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(contentType)) {
      return reply.status(400).send({ detail: 'Unsupported file type' });
    }

    const imageBase64 = buffer.toString('base64');
    return {
      image_data: `data:${contentType};base64,${imageBase64}`,
      content_type: contentType,
    };
  });

  // ============== EXPENSE CRUD ==============

  fastify.post('/api/expenses', { preHandler: authenticate }, async (request) => {
    const db = getDb();
    const body = request.body;
    const expenseId = `exp_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO expenses (expense_id, user_id, vendor, date, amount, currency, category,
        payment_method, receipt_number, line_items, tags, notes, receipt_image, confidence_score,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      expenseId,
      request.user.user_id,
      body.vendor,
      body.date,
      body.amount,
      body.currency || 'USD',
      body.category,
      body.payment_method || null,
      body.receipt_number || null,
      JSON.stringify(body.line_items || []),
      JSON.stringify(body.tags || []),
      body.notes || null,
      body.receipt_image || null,
      body.confidence_score || null,
      now,
      now
    );

    return { expense_id: expenseId, message: 'Expense created successfully' };
  });

  fastify.get('/api/expenses', { preHandler: authenticate }, async (request) => {
    const db = getDb();
    const { start_date, end_date, category, min_amount, max_amount, vendor, tag, search } = request.query;

    let sql = 'SELECT * FROM expenses WHERE user_id = ?';
    const params = [request.user.user_id];

    if (start_date) { sql += ' AND date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND date <= ?'; params.push(end_date); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    if (min_amount) { sql += ' AND amount >= ?'; params.push(parseFloat(min_amount)); }
    if (max_amount) { sql += ' AND amount <= ?'; params.push(parseFloat(max_amount)); }
    if (vendor) { sql += ' AND vendor LIKE ?'; params.push(`%${vendor}%`); }
    if (tag) { sql += " AND tags LIKE ?"; params.push(`%"${tag}"%`); }
    if (search) {
      sql += ' AND (vendor LIKE ? OR notes LIKE ? OR receipt_number LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY date DESC LIMIT 1000';

    const rows = db.prepare(sql).all(...params);

    return rows.map(row => ({
      ...row,
      line_items: JSON.parse(row.line_items || '[]'),
      tags: JSON.parse(row.tags || '[]'),
    }));
  });

  fastify.get('/api/expenses/:expense_id', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const row = db.prepare(
      'SELECT * FROM expenses WHERE expense_id = ? AND user_id = ?'
    ).get(request.params.expense_id, request.user.user_id);

    if (!row) return reply.status(404).send({ detail: 'Expense not found' });

    return {
      ...row,
      line_items: JSON.parse(row.line_items || '[]'),
      tags: JSON.parse(row.tags || '[]'),
    };
  });

  fastify.put('/api/expenses/:expense_id', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const body = request.body;

    // Build dynamic update
    const fields = [];
    const values = [];

    for (const key of ['vendor', 'date', 'amount', 'currency', 'category', 'payment_method', 'receipt_number', 'notes']) {
      if (body[key] !== undefined && body[key] !== null) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (body.line_items !== undefined) {
      fields.push('line_items = ?');
      values.push(JSON.stringify(body.line_items));
    }
    if (body.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(body.tags));
    }

    if (fields.length === 0) {
      return reply.status(400).send({ detail: 'No fields to update' });
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(request.params.expense_id, request.user.user_id);

    const result = db.prepare(
      `UPDATE expenses SET ${fields.join(', ')} WHERE expense_id = ? AND user_id = ?`
    ).run(...values);

    if (result.changes === 0) return reply.status(404).send({ detail: 'Expense not found' });

    return { message: 'Expense updated successfully' };
  });

  fastify.delete('/api/expenses/:expense_id', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const result = db.prepare(
      'DELETE FROM expenses WHERE expense_id = ? AND user_id = ?'
    ).run(request.params.expense_id, request.user.user_id);

    if (result.changes === 0) return reply.status(404).send({ detail: 'Expense not found' });

    return { message: 'Expense deleted successfully' };
  });

  fastify.post('/api/expenses/bulk-delete', { preHandler: authenticate }, async (request) => {
    const db = getDb();
    const { expense_ids } = request.body || {};
    if (!expense_ids || expense_ids.length === 0) {
      return { deleted_count: 0 };
    }

    const placeholders = expense_ids.map(() => '?').join(',');
    const result = db.prepare(
      `DELETE FROM expenses WHERE expense_id IN (${placeholders}) AND user_id = ?`
    ).run(...expense_ids, request.user.user_id);

    return { deleted_count: result.changes };
  });

  // ============== ANALYTICS ==============

  fastify.get('/api/analytics/summary', { preHandler: authenticate }, async (request) => {
    const db = getDb();
    const { start_date, end_date } = request.query;

    let sql = 'SELECT * FROM expenses WHERE user_id = ?';
    const params = [request.user.user_id];

    if (start_date) { sql += ' AND date >= ?'; params.push(start_date); }
    if (end_date) { sql += ' AND date <= ?'; params.push(end_date); }

    const expenses = db.prepare(sql).all(...params);

    if (expenses.length === 0) {
      return {
        total_expenses: 0,
        expense_count: 0,
        average_expense: 0,
        category_breakdown: [],
        top_vendors: [],
        monthly_trend: [],
      };
    }

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const count = expenses.length;

    // Category breakdown
    const catTotals = {};
    for (const e of expenses) {
      const cat = e.category || 'Other';
      catTotals[cat] = (catTotals[cat] || 0) + e.amount;
    }
    const category_breakdown = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));

    // Top vendors
    const vendorTotals = {};
    for (const e of expenses) {
      const v = e.vendor || 'Unknown';
      vendorTotals[v] = (vendorTotals[v] || 0) + e.amount;
    }
    const top_vendors = Object.entries(vendorTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([vendor, amount]) => ({ vendor, amount }));

    // Monthly trend
    const monthlyTotals = {};
    for (const e of expenses) {
      const month = e.date.slice(0, 7);
      monthlyTotals[month] = (monthlyTotals[month] || 0) + e.amount;
    }
    const monthly_trend = Object.entries(monthlyTotals)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, amount]) => ({ month, amount }));

    return {
      total_expenses: total,
      expense_count: count,
      average_expense: count > 0 ? total / count : 0,
      category_breakdown,
      top_vendors,
      monthly_trend,
    };
  });

  // ============== REPORTS ==============

  fastify.post('/api/reports/generate', { preHandler: authenticate }, async (request, reply) => {
    const db = getDb();
    const { start_date, end_date, categories, include_images, format } = request.body;

    let sql = 'SELECT * FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?';
    const params = [request.user.user_id, start_date, end_date];

    if (categories && categories.length > 0) {
      const placeholders = categories.map(() => '?').join(',');
      sql += ` AND category IN (${placeholders})`;
      params.push(...categories);
    }

    sql += ' ORDER BY date DESC';

    const expenses = db.prepare(sql).all(...params).map(row => ({
      ...row,
      line_items: JSON.parse(row.line_items || '[]'),
      tags: JSON.parse(row.tags || '[]'),
    }));

    if (format === 'excel') {
      return generateExcelReport(reply, expenses, start_date, end_date, request.user);
    }
    return generatePdfReport(reply, expenses, start_date, end_date, request.user);
  });

  async function generatePdfReport(reply, expenses, startDate, endDate, user) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename=expense_report_${startDate}_${endDate}.pdf`)
          .send(buffer);
        resolve();
      });
      doc.on('error', reject);

      // Title
      doc.fontSize(24).font('Helvetica-Bold').text('Expense Report', { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').text(`Period: ${startDate} to ${endDate}`);
      doc.text(`Generated by: ${user.name}`);
      doc.moveDown();

      // Summary
      const total = expenses.reduce((sum, e) => sum + e.amount, 0);
      doc.fontSize(16).font('Helvetica-Bold').text(`Total Expenses: $${total.toFixed(2)}`);
      doc.fontSize(12).font('Helvetica').text(`Number of Receipts: ${expenses.length}`);
      doc.moveDown();

      // Table
      if (expenses.length > 0) {
        const tableTop = doc.y;
        const colWidths = [80, 180, 120, 80];
        const headers = ['Date', 'Vendor', 'Category', 'Amount'];

        // Header row
        doc.font('Helvetica-Bold').fontSize(10);
        doc.rect(50, tableTop, colWidths.reduce((a, b) => a + b, 0), 20).fill('#1A3C34');
        let x = 55;
        for (let i = 0; i < headers.length; i++) {
          doc.fillColor('white').text(headers[i], x, tableTop + 5, { width: colWidths[i] - 10 });
          x += colWidths[i];
        }

        // Data rows
        doc.font('Helvetica').fontSize(9).fillColor('#333');
        let y = tableTop + 25;

        for (const e of expenses) {
          if (y > 700) {
            doc.addPage();
            y = 50;
          }

          doc.rect(50, y - 3, colWidths.reduce((a, b) => a + b, 0), 18).fill('#F9F9F7').stroke('#E5E7EB');
          x = 55;
          doc.fillColor('#333');
          doc.text(e.date, x, y, { width: colWidths[0] - 10 }); x += colWidths[0];
          doc.text((e.vendor || '').slice(0, 30), x, y, { width: colWidths[1] - 10 }); x += colWidths[1];
          doc.text(e.category, x, y, { width: colWidths[2] - 10 }); x += colWidths[2];
          doc.text(`$${e.amount.toFixed(2)}`, x, y, { width: colWidths[3] - 10, align: 'right' });

          y += 20;
        }
      }

      doc.end();
    });
  }

  async function generateExcelReport(reply, expenses, startDate, endDate, user) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Expenses');

    // Header style
    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C34' } },
      border: { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } },
    };

    const headers = ['Date', 'Vendor', 'Category', 'Amount', 'Payment Method', 'Receipt #', 'Notes', 'Tags'];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.border = headerStyle.border;
    });

    // Data
    for (const e of expenses) {
      const row = sheet.addRow([
        e.date,
        e.vendor,
        e.category,
        e.amount,
        e.payment_method || '',
        e.receipt_number || '',
        e.notes || '',
        (e.tags || []).join(', '),
      ]);
      row.getCell(4).numFmt = '$#,##0.00';
    }

    // Summary
    const summaryRow = sheet.addRow([]);
    sheet.addRow(['', '', 'TOTAL:', expenses.reduce((sum, e) => sum + e.amount, 0)]);
    sheet.getRow(sheet.rowCount).getCell(4).numFmt = '$#,##0.00';
    sheet.getRow(sheet.rowCount).font = { bold: true };

    // Column widths
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 25;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 15;
    sheet.getColumn(6).width = 15;
    sheet.getColumn(7).width = 30;
    sheet.getColumn(8).width = 20;

    const buffer = await workbook.xlsx.writeBuffer();

    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename=expense_report_${startDate}_${endDate}.xlsx`)
      .send(Buffer.from(buffer));
  }

  // ============== CATEGORIES ==============

  fastify.get('/api/categories', async () => {
    return { categories: CATEGORIES };
  });

  // ============== TAGS ==============

  fastify.get('/api/tags', { preHandler: authenticate }, async (request) => {
    const db = getDb();
    const rows = db.prepare(
      "SELECT tags FROM expenses WHERE user_id = ? AND tags != '[]'"
    ).all(request.user.user_id);

    const allTags = new Set();
    for (const row of rows) {
      const tags = JSON.parse(row.tags || '[]');
      tags.forEach(t => allTags.add(t));
    }

    return { tags: [...allTags].sort() };
  });

  // ============== HEALTH CHECK ==============

  fastify.get('/api/', async () => {
    return { message: 'Receipt Scanner API', status: 'healthy' };
  });

  fastify.get('/api/health', async () => {
    return { status: 'healthy' };
  });

  // ============== ADMIN ==============

  fastify.get('/api/admin/users', { preHandler: authenticate }, async () => {
    const db = getDb();
    const users = db.prepare('SELECT user_id, email, name, picture, created_at FROM users').all();

    const usersWithStats = users.map(user => {
      const stats = db.prepare(
        'SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ?'
      ).get(user.user_id);

      return {
        ...user,
        expense_count: stats.count,
        total_expenses: Math.round(stats.total * 100) / 100,
      };
    });

    return { total_users: usersWithStats.length, users: usersWithStats };
  });

  fastify.get('/api/admin/stats', { preHandler: authenticate }, async () => {
    const db = getDb();
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const expenseStats = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM expenses').get();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const recentCount = db.prepare('SELECT COUNT(*) as count FROM expenses WHERE date >= ?').get(sevenDaysAgo).count;

    return {
      total_users: userCount,
      total_expenses: expenseStats.count,
      total_amount: Math.round(expenseStats.total * 100) / 100,
      expenses_last_7_days: recentCount,
    };
  });

  // ============== START SERVER ==============

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running on http://localhost:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
