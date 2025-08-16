const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const twilio = require("twilio");
const cors = require("cors");
const puppeteer = require("puppeteer");
const logo = "http://localhost:3000/asset/images/logo.jpg";
const dotenv = require("dotenv");



//configure env
dotenv.config()

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use('/asset', express.static(path.join(__dirname, 'asset')));
const upload = multer();

// Twilio credentials
const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const TWILIO_WHATSAPP = "whatsapp:+14155238886"; // Twilio Sandbox number

// Calculate total price
function calculate(item){
  let subTotal = 0;

  item.forEach(i => {
    subTotal = subTotal + i?.amount * i?.quantity
  });
  return subTotal;
}

// Function to build items table for the receipt
function buildItemsTable(items) {
  let rows = "";

  let subtotal = 0;

  for (const item of items) {
    const description = item?.description || "No description";
    const quantity = item?.quantity || 1;
    const price = parseFloat(item?.price || 0).toFixed(2);
    const amount = (parseFloat(item?.price || 0) * quantity).toFixed(2);

    subtotal += parseFloat(amount);

    rows += `
      <tr>
        <td>${description}</td>
        <td>${quantity}</td>
        <td>₹${price}</td>
        <td>₹${amount}</td>
      </tr>
    `;
  }

  const total = subtotal.toFixed(2);
  subtotal = subtotal.toFixed(2);

  return `
    <table class="receipt-details" border="1" cellspacing="0" cellpadding="6" width="100%">
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align: right">
            <strong>Subtotal:</strong>
          </td>
          <td>₹${subtotal}</td>
        </tr>
        <tr>
          <td colspan="3" style="text-align: right">
            <strong>Total:</strong>
          </td>
          <td>₹${total}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

// HTML template generator
function generateHTML({
  businessName,
  paymentMethod = "Cash",
  receiptNumber,
  customerName,
  customerPhone,
  items,
}) {
  const itemsTable = buildItemsTable(items);
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <style>
      .receipt-preview {
    margin-top: 30px;
    padding: 25px;
    border: 1px solid #eee;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.receipt-header {
    text-align: center;
    margin-bottom: 25px;
}

.receipt-logo {
    font-size: 24px;
    font-weight: 700;
    color: #2c3e50;
    margin-bottom: 5px;
}

.receipt-title {
    font-size: 18px;
    color: #7f8c8d;
}

.receipt-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 30px;
}

.receipt-details {
    width: 100%;
    border-collapse: collapse;
}

.receipt-details th {
    text-align: left;
    padding: 10px;
    background: #f8f9fa;
    border-bottom: 1px solid #ddd;
}

.receipt-details td {
    padding: 15px 10px;
    border-bottom: 1px solid #eee;
}

.receipt-details tr:last-child td {
    border-bottom: none;
}

.receipt-footer {
    margin-top: 30px;
    text-align: center;
    color: #7f8c8d;
    font-size: 14px;
}

.thank-you {
    font-weight: 700;
    color: #2c3e50;
    margin-bottom: 10px;
    font-size: 16px;
}

.payment-details {
    margin-bottom: 20px;
}

.payment-details h4 {
    margin-top: 0;
}
    </style>
  </head>
  <body>
    <div id="receiptOutput" class="receipt-preview">
        <div class="receipt-header">
          <div
            class="headerContainer"
            style="display: flex; align-items: center"
          >
            <img src=${logo} alt="Logo" width="200px"/>
            <div class="receipt-logo" id="receipt-logo" style="flex: 1">${businessName}</div>
          </div>
          <h3 style="margin: 0; padding: 0">SANGAI HONDA</h3>
          <div class="receipt-title">OFFICIAL RECEIPT</div>
        </div>
        <div class="receipt-info">
          <div>
            <div>
              <strong>Receipt No:</strong> <span id="receipt-no">${receiptNumber}</span>
            </div>
            <div>
              <strong>Date:</strong> <span id="receipt-date">${new Date().toLocaleDateString()}</span>
            </div>
          </div>
          <div>
            <div>
              <strong>Customer:</strong> <span id="receipt-customer">${customerName}</span>
            </div>
            <div>
              <strong>Phone:</strong>
              <span id="receipt-phone">${customerPhone}</span>
            </div>
          </div>
        </div>

        ${itemsTable}

        <div class="receipt-footer">
          <div class="payment-details">
            <h4>Payment Details</h4>
            <div>
              <strong>Amount Paid:</strong> <span id="amount-paid">₹${calculate(items)}</span>
            </div>
            <div>
              <strong>Payment Method:</strong>
              <span id="display-payment-method">${paymentMethod}</span>
            </div>
          </div>

          <div class="thank-you">Thank you for your business!</div>
          <div style="margin-top: 20px">
            For any queries, contact:
            <span id="receipt-contact">01169320285</span>
          </div>
          <div>GSTIN: <span id="receipt-gstin">14AACCO0030B1ZH</span></div>
        </div>
      </div>
  </body>
  </html>
  `;
}

// Main endpoint
app.post("/generate-and-send", upload.none(), async (req, res) => {
  const {
    businessName,
    gstin,
    businessAddress,
    receiptNumber,
    customerName,
    customerPhone,
    customerAddress,
    notes,
  } = req.body;

  const items = req.body.items || [];

  // Check folder existence and create if not present
  const pdfDir = path.join(__dirname, "generatedPdf");
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir);
  }

  const filename = `${customerName?.split(" ")[0]}_${uuidv4()}_.pdf`;
  const filepath = path.join(pdfDir, filename);

  try {
    const htmlContent = generateHTML({
      businessName,
      gstin,
      businessAddress,
      receiptNumber,
      customerName,
      customerPhone,
      customerAddress,
      notes,
      items,
    });

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    await page.pdf({ path: filepath, format: "A4" });
    await browser.close();

    const FormData = require("form-data");
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filepath));

    const uploadRes = await axios.post(
      "https://tmpfiles.org/api/v1/upload",
      formData,
      {
        headers: formData.getHeaders(),
      }
    );

    const rawUrl = uploadRes.data.data.url;
    const fileId = rawUrl.split("/")[3]; // '8499799'
    const filename = rawUrl.split("/")[4]; // 'abc123.pdf'
    const fileUrl = `https://tmpfiles.org/dl/${fileId}/${filename}`;
    if (!fileUrl) throw new Error("Upload failed");

    // Step 3: Send WhatsApp message
    const messageResult = await client.messages.create({
      from: TWILIO_WHATSAPP,
      to: `whatsapp:${customerPhone}`,
      body: "Here is your PDF message!",
      mediaUrl: [fileUrl],
    });

    res.json({ success: true, sid: messageResult.sid, fileUrl });
  } catch (error) {

    res.status(500).json({ success: false, error: error.message });
  } finally {
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
