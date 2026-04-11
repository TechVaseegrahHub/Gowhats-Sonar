import { useContext, useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JsBarcode from "jsbarcode";
import api from "../utils/axios";
import {
  Printer, Package, MapPin, RefreshCw, X, Calendar, History, Loader2
} from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import PrintConfirmationModal from "./PrintConfirmationModal";

const PrintLabels = () => {
  const [orderId, setOrderId] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const [fromAddress, setFromAddress] = useState({
    name: "", address1: "", address2: "", city: "", state: "", zipCode: "", phone: "",
  });
  const [isEditingFromAddress, setIsEditingFromAddress] = useState(false);
  const [isFromAddressSet, setIsFromAddressSet] = useState(false);
  const [labelFormat, setLabelFormat] = useState('thermal');

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetType, setResetType] = useState('recent');
  const getLocalDate = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  };
  const [resetDate, setResetDate] = useState(getLocalDate());

  const { user } = useContext(AuthContext);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [ordersToPrint, setOrdersToPrint] = useState([]);
  const [batchDateFilter, setBatchDateFilter] = useState({ fromDate: "", toDate: "" });

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const getTenantId = () => {
    if (user?.tenant_id) return user.tenant_id;
    if (user?.tenantId) return user.tenantId;
    const storedTenant = localStorage.getItem("tenantId");
    if (storedTenant) return storedTenant;
    return null;
  };

  const formatDisplayDate = (dateValue) => {
    if (!dateValue) return "All Dates";
    const [year, month, day] = dateValue.split("-").map(Number);
    const parsedDate = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(parsedDate.getTime())) return dateValue;
    return parsedDate.toLocaleDateString();
  };

  const formatDisplayDateRange = (dateRange = batchDateFilter) => {
    const fromDate = dateRange?.fromDate || "";
    const toDate = dateRange?.toDate || "";
    if (!fromDate && !toDate) return "All Dates";
    if (fromDate && toDate) return `${formatDisplayDate(fromDate)} to ${formatDisplayDate(toDate)}`;
    if (fromDate) return `From ${formatDisplayDate(fromDate)}`;
    return `Up to ${formatDisplayDate(toDate)}`;
  };

  useEffect(() => {
    const initData = async () => {
      const tenantId = getTenantId();
      if (!tenantId) return;
      try {
        const [countRes, settingsRes] = await Promise.all([
          api.get("/api/printing/pending-orders-count", { params: { tenantId } }),
          api.get('/api/catalog-settings')
        ]);
        setPendingOrdersCount(countRes.data.pendingOrders || 0);
        const dbPrintingConfig = settingsRes.data.settings?.printingConfig;
        if (dbPrintingConfig?.fromAddress?.name) {
          setFromAddress(dbPrintingConfig.fromAddress);
          setLabelFormat(dbPrintingConfig.labelFormat || 'thermal');
          setIsFromAddressSet(true);
        } else {
          const localAddress = localStorage.getItem("fromAddress");
          if (localAddress) { setFromAddress(JSON.parse(localAddress)); setIsFromAddressSet(true); }
        }
      } catch (error) { console.error("Initialization Error:", error); }
    };
    if (user) initData();
  }, [user]);

  const fetchPendingOrdersCount = async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    try {
      const response = await api.get("/api/printing/pending-orders-count", { params: { tenantId } });
      setPendingOrdersCount(response.data.pendingOrders);
    } catch (error) { setPendingOrdersCount(0); }
  };

  const handleSaveFromAddress = async () => {
    if (!fromAddress.name || !fromAddress.address1 || !fromAddress.city) {
      setResponseMessage("⚠️ Please fill in required fields (Name, Address, City)");
      setTimeout(() => setResponseMessage(""), 3000);
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/catalog-settings', { printingConfig: { fromAddress, labelFormat } });
      localStorage.setItem("fromAddress", JSON.stringify(fromAddress));
      localStorage.setItem("labelFormat", labelFormat);
      setIsFromAddressSet(true); setIsEditingFromAddress(false);
      setResponseMessage("✅ Address saved to database!");
    } catch (error) {
      console.error(error); setResponseMessage("❌ Failed to save address");
    } finally {
      setLoading(false); setTimeout(() => setResponseMessage(""), 3000);
    }
  };

  const handleFromAddressChange = (field, value) => {
    setFromAddress(prev => ({ ...prev, [field]: value }));
  };

  // ── PDF generation (100% unchanged) ───────────────────────────────────────
  const generateThermalPDF = async (order) => {
    const doc = new jsPDF("p", "in", [4, 4]);
    const margin = 0.1;
    const width = 4 - 2 * margin;
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("Ship Via: ST Courier", margin, margin + 0.25);
    const orderIdText = `Order ID: ${order.id}`;
    const fontSize = doc.internal.getFontSize();
    const scaleFactor = doc.internal.scaleFactor;
    const orderIdWidth = (doc.getStringUnitWidth(orderIdText) * fontSize) / scaleFactor;
    doc.text(orderIdText, 4 - margin - orderIdWidth, margin + 0.25);
    const barcodeCanvas = document.createElement("canvas");
    barcodeCanvas.width = 300; barcodeCanvas.height = 100;
    try {
      JsBarcode(barcodeCanvas, order.id.toString(), { format: "CODE128", width: 1.5, height: 40, displayValue: false, background: "#FFFFFF", lineColor: "#000000", margin: 0 });
      doc.addImage(barcodeCanvas.toDataURL("image/jpeg", 1.0), "JPEG", (4 - 2.2) / 2, 0.45, 2.2, 0.4);
    } catch (error) { console.error("Barcode error:", error); }
    const contentY = 1.0;
    const addressBoxWidth = (width - 0.1) / 2;
    const fromBoxX = margin; const toBoxX = margin + addressBoxWidth + 0.1; const boxHeight = 1.2;
    const fitAddressText = (doc, textLines, x, y, maxWidth, maxHeight, initialFontSize = 8) => {
      let fontSize = initialFontSize; let fitted = false;
      while (fontSize >= 6 && !fitted) {
        doc.setFontSize(fontSize); let totalHeight = 0; const lines = [];
        for (const line of textLines) { const splitLines = doc.splitTextToSize(line, maxWidth - 0.1); lines.push(...splitLines); totalHeight += splitLines.length * (fontSize * 0.015); }
        if (totalHeight <= maxHeight - 0.2) {
          fitted = true; let currentY = y;
          for (const line of lines) { if (currentY < y + maxHeight - 0.1) { doc.text(line, x, currentY); currentY += fontSize * 0.018; } }
          return currentY;
        } else { fontSize -= 0.5; }
      }
      doc.setFontSize(6); return y;
    };
    doc.setLineWidth(0.02);
    doc.rect(fromBoxX, contentY, addressBoxWidth, boxHeight);
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("FROM:", fromBoxX + 0.05, contentY + 0.15);
    const fromAddressLines = [fromAddress.name || "Sender", fromAddress.address1 || "", fromAddress.address2 || "", `${fromAddress.city || ""} ${fromAddress.state || ""}`.trim(), fromAddress.zipCode || "", fromAddress.phone || ""].filter(Boolean);
    doc.setFont("helvetica", "normal");
    fitAddressText(doc, fromAddressLines, fromBoxX + 0.05, contentY + 0.3, addressBoxWidth - 0.1, boxHeight - 0.15, 8);
    doc.rect(toBoxX, contentY, addressBoxWidth, boxHeight);
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("TO:", toBoxX + 0.05, contentY + 0.15);
    const dbShip = order.shippingAddress || {}; const backup = order.registrationDetails || {}; const flow = order.customerDetails || {}; const shopifyShip = order.shipping || {};
    const name = dbShip.name || backup.name || flow.name || "Customer";
    const address = dbShip.addressLine1 || backup.address || flow.address || shopifyShip.address_1 || "";
    const city = dbShip.city || backup.city || flow.city || shopifyShip.city || "";
    const state = dbShip.state || backup.state || flow.state || shopifyShip.state || "";
    const zip = dbShip.pincode || backup.zip_code || backup.pincode || flow.pincode || shopifyShip.postcode || "";
    const phone = order.customerPhone || backup.phone_number || dbShip.phone || "";
    const toAddressLines = [name, address, city, state ? `${state} - ${zip}` : zip, phone].filter(Boolean);
    doc.setFont("helvetica", "normal");
    fitAddressText(doc, toAddressLines, toBoxX + 0.05, contentY + 0.3, addressBoxWidth - 0.1, boxHeight - 0.15, 8);
    const prepaidY = contentY + boxHeight + 0.1;
    doc.rect(margin, prepaidY, width, 0.7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Order Details:", margin + 0.1, prepaidY + 0.18);
    doc.setFont("helvetica", "normal");
    const orderDate = order.date_created ? new Date(order.date_created).toLocaleDateString() : 'N/A';
    const itemCount = order.line_items?.reduce((acc, item) => acc + (item.quantity || 0), 0) || 0;
    const prepaidDetails = [`Date: ${orderDate}`, `Items: ${itemCount}`, "Source: WhatsApp", `Payment: ${order.paymentStatus || "Completed"}`];
    let yPos = prepaidY + 0.35;
    prepaidDetails.forEach((detail, index) => {
      const xPos = index % 2 === 0 ? margin + 0.1 : margin + width / 2 + 0.1;
      const adjustedY = yPos + Math.floor(index / 2) * 0.15;
      doc.text(detail, xPos, adjustedY);
    });
    const productsY = prepaidY + 0.8; const productsHeight = 4 - productsY - margin;
    doc.rect(margin, productsY, width, productsHeight);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Products:", margin + 0.1, productsY + 0.18);
    doc.setFont("helvetica", "normal");
    const productsList = order.line_items?.map((item) => `${item.name || "Product"} × ${item.quantity || 1}`).join(", ") || "No products";
    const splitProducts = doc.splitTextToSize(productsList, width - 0.2);
    yPos = productsY + 0.35;
    splitProducts.forEach((line, index) => { if (yPos < 4 - margin - 0.1 && index < 8) { doc.text(line, margin + 0.1, yPos); yPos += 0.15; } });
    return doc;
  };

const generateThermal6PDF = async (order) => {
  const doc = new jsPDF("p", "in", [4, 6]);
  const margin = 0.18;
  const pageW = 4;
  const pageH = 6;
  const contentW = pageW - margin * 2;
  let y = margin + 0.12;

  // ── Outer border ──────────────────────────────────────────
  doc.setLineWidth(0.018);
  doc.rect(margin - 0.05, margin - 0.05, pageW - (margin - 0.05) * 2, pageH - (margin - 0.05) * 2);

  // ── TOP ROW: Shipping Type LEFT | Serial/Date/Order RIGHT ─
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Shipping Type : ST Courier", margin, y + 0.08);

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  const today = new Date().toLocaleDateString("en-GB").replace(/\//g, '/');
  const topLines = [
    `Serial No: ${order.id}`,
    `Date: ${today}`,
    `Order ID: ${order.id}`
  ];
  topLines.forEach((line, i) => {
    const w = (doc.getStringUnitWidth(line) * 7.5) / doc.internal.scaleFactor;
    doc.text(line, pageW - margin - w, y + i * 0.155);
  });
  y += 0.52;

  // ── ORDER ID Barcode ──────────────────────────────────────
  const bc1 = document.createElement("canvas");
  bc1.width = 500; bc1.height = 90;
  try {
    JsBarcode(bc1, String(order.id), {
      format: "CODE128", width: 1.8, height: 55,
      displayValue: false, background: "#fff", lineColor: "#000", margin: 0
    });
    const bcW = 3.2;
    doc.addImage(bc1.toDataURL("image/jpeg", 1.0), "JPEG",
      (pageW - bcW) / 2, y, bcW, 0.52);
  } catch (e) { console.error("BC1 error", e); }
  y += 0.60;

  // ── PHONE Barcode ─────────────────────────────────────────
  const rawPhone = order.customerPhone ||
    order.shippingAddress?.phone ||
    order.customerDetails?.phone || "";
  const cleanPhone = rawPhone.replace(/\D/g, "");

  if (cleanPhone) {
    const bc2 = document.createElement("canvas");
    bc2.width = 500; bc2.height = 90;
    try {
      JsBarcode(bc2, cleanPhone, {
        format: "CODE128", width: 1.8, height: 55,
        displayValue: false, background: "#fff", lineColor: "#000", margin: 0
      });
      const bcW = 3.2;
      doc.addImage(bc2.toDataURL("image/jpeg", 1.0), "JPEG",
        (pageW - bcW) / 2, y, bcW, 0.52);
    } catch (e) { console.error("BC2 error", e); }
    y += 0.60;
  }

  y += 0.08;

  // ── TO block ──────────────────────────────────────────────
  const dbShip   = order.shippingAddress || {};
  const custName = dbShip.name || order.customerDetails?.name || "Customer";
  const addr1    = dbShip.addressLine1 || "";
  const addr2    = dbShip.addressLine2 || "";
  const city     = dbShip.city || "";
  const state    = dbShip.state || "";
  const pin      = dbShip.pincode || "";
  const toPhone  = order.customerPhone || dbShip.phone || "";

  const cityStateLine = [city, state, "India"].filter(Boolean).join(", ") + (pin ? ` - ${pin}` : "");

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("To:", margin, y);
  y += 0.18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const toLines = [
    custName,
    [addr1, addr2].filter(Boolean).join(", "),
    cityStateLine,
    toPhone ? `Cell: +${toPhone.replace(/^\+/, "")}` : "",
    "Alternate:"
  ].filter(Boolean);

  toLines.forEach(line => {
    const wrapped = doc.splitTextToSize(line, contentW);
    wrapped.forEach(l => { doc.text(l, margin, y); y += 0.150; });
  });

  // ── Divider ───────────────────────────────────────────────
  y += 0.04;
  doc.setLineWidth(0.012);
  doc.line(margin, y, pageW - margin, y);
  y += 0.16;

  // ── FROM block ────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("From:", margin, y);
  y += 0.18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  const fromCityPin = [fromAddress.city, fromAddress.zipCode].filter(Boolean).join(" - ");
  const fromStateLine = [fromAddress.state, "India"].filter(Boolean).join(", ");
  const fromCombined = [fromCityPin, fromStateLine].filter(Boolean).join(", ");

  const fromLines = [
    fromAddress.name || "",
    [fromAddress.address1, fromAddress.address2].filter(Boolean).join(", "),
    fromCombined,
    fromAddress.phone ? `Phone: +91 ${fromAddress.phone}` : ""
  ].filter(Boolean);

  fromLines.forEach(line => {
    const wrapped = doc.splitTextToSize(line, contentW);
    wrapped.forEach(l => { doc.text(l, margin, y); y += 0.150; });
  });

  // ── Divider before table ──────────────────────────────────
  y += 0.04;
  doc.setLineWidth(0.012);
  doc.line(margin, y, pageW - margin, y);
  y += 0.08;

  // ── Products Table ────────────────────────────────────────
  // Calculate remaining space for table
  const remainingH = pageH - margin - 0.05 - y;
  const items = order.line_items || [];
  const totalRows = items.length + 2; // header + items + total row

  // Estimate row heights — wrap long names
  const nameColW = contentW * 0.58;
  const skuColW  = contentW * 0.24;
  const qtyColW  = contentW * 0.18;
  const col1X = margin;
  const col2X = margin + nameColW;
  const col3X = margin + nameColW + skuColW;

  // If too many items, shrink font slightly
  const baseFontSize = totalRows > 6 ? 7 : 7.5;
  const baseLineH    = totalRows > 6 ? 0.13 : 0.145;

  const drawTableRow = (c1, c2, c3, bold, rowStartY, fs = baseFontSize, lh = baseLineH) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? fs + 0.5 : fs);

    const nameLines = doc.splitTextToSize(c1, nameColW - 0.08);
    const rowH = Math.max(nameLines.length * lh, 0.20) + 0.10;

    doc.setLineWidth(0.008);
    doc.rect(col1X, rowStartY, nameColW, rowH);
    doc.rect(col2X, rowStartY, skuColW,  rowH);
    doc.rect(col3X, rowStartY, qtyColW,  rowH);

    const textY   = rowStartY + lh + 0.02;
    const centerY = rowStartY + rowH / 2 + 0.04;

    nameLines.forEach((line, i) => {
      doc.text(line, col1X + 0.06, textY + i * lh);
    });
    doc.text(c2, col2X + skuColW / 2, centerY, { align: "center" });
    doc.text(c3, col3X + qtyColW / 2, centerY, { align: "center" });

    return rowH;
  };

  // Header
  let rowH = drawTableRow("Product Name", "SKU", "Quantity", true, y);
  y += rowH;

  // Data rows
  let totalQty = 0;
  items.forEach(item => {
    const qty = item.quantity || 1;
    totalQty += qty;
    // If running out of space, add a new page
    if (y + 0.3 > pageH - margin - 0.05) {
      doc.addPage([4, 6]);
      y = margin + 0.12;
      // Redraw header on new page
      rowH = drawTableRow("Product Name", "SKU", "Quantity", true, y);
      y += rowH;
    }
    rowH = drawTableRow(item.name || "Product", item.sku || "-", String(qty), false, y);
    y += rowH;
  });

  // Total row — add new page if needed
  if (y + 0.3 > pageH - margin - 0.05) {
    doc.addPage([4, 6]);
    y = margin + 0.12;
  }
  drawTableRow("Total Quantity:", "", String(totalQty), true, y);

  return doc;
};


  const generateA4InvoicePDF = async (order) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210; const margin = 15;
    const dbShip = order.shippingAddress || {}; const backup = order.registrationDetails || {}; const flow = order.customerDetails || {}; const shopifyShip = order.shipping || {};
    const custName = dbShip.name || backup.name || flow.name || "Customer";
    const custPhone = order.customerPhone || backup.phone_number || dbShip.phone || "N/A";
    const custAddress = dbShip.addressLine1 || backup.address || flow.address || shopifyShip.address_1 || "";
    const custCity = dbShip.city || backup.city || flow.city || shopifyShip.city || "";
    const custState = dbShip.state || backup.state || flow.state || shopifyShip.state || "";
    const custZip = dbShip.pincode || backup.zip_code || backup.pincode || flow.pincode || shopifyShip.postcode || "";
    const barcodeCanvas = document.createElement("canvas");
    barcodeCanvas.width = 600; barcodeCanvas.height = 100;
    try {
      JsBarcode(barcodeCanvas, order.id.toString(), { format: "CODE128", width: 2, height: 50, displayValue: false, fontSize: 14, background: "#FFFFFF", lineColor: "#000000", margin: 5 });
      const barcodeDataUrl = barcodeCanvas.toDataURL("image/jpeg", 1.0);
      doc.addImage(barcodeDataUrl, "JPEG", (pageWidth - 80) / 2, 10, 80, 20);
    } catch (error) { console.error("Barcode error:", error); }
    let y = 40;
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.text("Order Details:", margin, y); y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Order ID: ${order.id}`, margin, y); y += 5;
    doc.text(`Date: ${new Date(order.date_created).toLocaleDateString()}`, margin, y); y += 5;
    doc.text(`Status: ${order.status || 'processing'}`, margin, y);
    const columnGap = 12;
    const columnWidth = ((pageWidth - (margin * 2)) - columnGap) / 2;
    const leftColX = margin; const rightColX = leftColX + columnWidth + columnGap;
    let yRight = 40;
    doc.setFont("helvetica", "bold"); doc.text("Payment Details:", rightColX, yRight); yRight += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`Method: ${order.payment_method_title || 'Online Payment'}`, rightColX, yRight); yRight += 5;
    doc.text(`Email: ${order.billing?.email || 'N/A'}`, rightColX, yRight);
    y = 65;
    doc.setDrawColor(200, 200, 200); doc.line(margin, y, pageWidth - margin, y); y += 10;
    const addressY = y;
    const normalizeTextLine = (line) => String(line || "").replace(/\s+/g, " ").trim();
    const wrapAddressLines = (lines, maxWidth) => {
      return lines.map(normalizeTextLine).filter(Boolean).flatMap((line) => {
        const commaSplit = line.split(/,\s*/).filter(Boolean);
        const chunks = commaSplit.length > 1 ? commaSplit.map((part, index) => (index < commaSplit.length - 1 ? `${part},` : part)) : [line];
        return chunks.flatMap((chunk) => {
          const safeSegments = chunk.match(/.{1,48}/g) || [chunk];
          return safeSegments.flatMap((segment) => doc.splitTextToSize(segment, maxWidth));
        });
      });
    };
    const renderAddressBlock = ({ title, lines, xPos, yPos, maxWidth, maxLines = 10 }) => {
      doc.setFont("helvetica", "bold"); doc.text(title, xPos, yPos);
      doc.setFont("helvetica", "normal");
      const wrappedLines = wrapAddressLines(lines, maxWidth).slice(0, maxLines);
      const textStartY = yPos + 5;
      if (wrappedLines.length > 0) doc.text(wrappedLines, xPos, textStartY);
      return textStartY + wrappedLines.length * 4.5;
    };
    const toCityStateZip = [custCity, custState, custZip].filter(Boolean).join(", ");
    const toLines = [custName || "Customer", custAddress, order.shipping?.address_2 || dbShip.addressLine2 || "", toCityStateZip, `Phone: ${custPhone || "N/A"}`].filter(Boolean);
    const finalToY = renderAddressBlock({ title: "To:", lines: toLines, xPos: leftColX, yPos: addressY, maxWidth: columnWidth });
    const fromCityStateZip = [fromAddress.city, fromAddress.state, fromAddress.zipCode].filter(Boolean).join(", ");
    const fromLines = [fromAddress.name, fromAddress.address1, fromAddress.address2, fromCityStateZip, `Mobile: ${fromAddress.phone || ""}`].filter(Boolean);
    const finalFromY = renderAddressBlock({ title: "From:", lines: fromLines, xPos: rightColX, yPos: addressY, maxWidth: columnWidth });
    y = Math.max(finalFromY, finalToY, addressY + 34) + 10;
    doc.line(margin, y, pageWidth - margin, y); y += 5;
    const tableColumn = ["#", "Product Name", "Qty"];
    const tableRows = [];
    if (order.line_items) { order.line_items.forEach((item, index) => { tableRows.push([index + 1, item.name, item.quantity]); }); }
    autoTable(doc, { head: [tableColumn], body: tableRows, startY: y, theme: 'plain', styles: { fontSize: 9, cellPadding: 3 }, headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 20, halign: 'center' } }, margin: { left: margin, right: margin } });
    y = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Thank you for your business!", pageWidth / 2, y, { align: "center" }); y += 5;
    doc.setFontSize(8); doc.text("For any queries, please contact our customer support.", pageWidth / 2, y, { align: "center" });
    return doc;
  };

  // ── Handlers (unchanged) ──────────────────────────────────────────────────
  const handleReset = () => setShowResetModal(true);

  const executeReset = async () => {
    setShowResetModal(false); setLoading(true);
    setResponseMessage(resetType === 'recent' ? "Resetting last printed batch..." : `Resetting prints for ${resetDate}...`);
    const tenantId = getTenantId();
    try {
      const response = await api.post("/api/printing/reset-print-status", { tenantId, resetType, date: resetType === 'date' ? resetDate : new Date().toISOString() });
      setResponseMessage(`✅ Success: ${response.data.modifiedCount} orders reset.`);
      await fetchPendingOrdersCount();
    } catch (error) {
      console.error(error);
      setResponseMessage(`Error resetting: ${error.response?.data?.error || error.message}`);
    } finally { setLoading(false); setTimeout(() => setResponseMessage(""), 5000); }
  };

  const handleGenerateIndividualPDF = async () => {
    if (!orderId.trim()) { setResponseMessage("Error: Please enter an Order ID."); return; }
    if (!isFromAddressSet) { setResponseMessage("⚠️ Please configure 'From Address' in Settings first."); setTimeout(() => setResponseMessage(""), 3000); return; }
    setLoading(true); setResponseMessage(`Fetching order ${orderId}...`);
    const tenantId = getTenantId();
    try {
      const response = await api.get(`/api/printing/fetch-order/${orderId}`, { params: { tenantId } });
      const orderData = response.data;
      if (orderData.paymentStatus?.toLowerCase() !== 'completed') { setResponseMessage(`❌ Error: Payment not completed for order ${orderId}.`); setLoading(false); return; }
      setResponseMessage(`Generating ${labelFormat === 'a4' ? 'Invoice' : labelFormat === 'thermal6' ? '4x6 Label' : 'Label'}...`);
      let doc;
      if (labelFormat === 'a4') doc = await generateA4InvoicePDF(orderData);
      else if (labelFormat === 'thermal6') doc = await generateThermal6PDF(orderData);
      else doc = await generateThermalPDF(orderData);
      window.open(URL.createObjectURL(doc.output("blob")), "_blank");
      setResponseMessage(`✅ ${labelFormat === 'a4' ? 'Invoice' : labelFormat === 'thermal6' ? '4x6 Label' : 'Label'} generated for order ${orderId}.`);
      await fetchPendingOrdersCount();
    } catch (error) {
      console.error(error);
      setResponseMessage(`Error: ${error.response?.data?.error || error.message || "Failed to generate."}`);
    } finally { setLoading(false); setTimeout(() => setResponseMessage(""), 5000); }
  };

  const fetchBatchOrders = async (dateRange = batchDateFilter) => {
    const tenantId = getTenantId();
    const params = { tenantId };
    const fromDate = dateRange?.fromDate || "";
    const toDate = dateRange?.toDate || "";
    if ((fromDate && !toDate) || (!fromDate && toDate)) throw new Error("Please select both From Date and To Date.");
    if (fromDate && toDate) { params.startDate = fromDate; params.endDate = toDate; }
    const response = await api.get("/api/printing/fetch-processing-orders", { params });
    const orders = Array.isArray(response.data?.orders) ? response.data.orders : [];
    return orders.filter(order => order.paymentStatus?.toLowerCase() === 'completed');
  };

  const handleGenerateCombinedPDF = async () => {
    setLoading(true);
    const hasRange = !!(batchDateFilter.fromDate || batchDateFilter.toDate);
    setResponseMessage(hasRange ? `Fetching orders for ${formatDisplayDateRange(batchDateFilter)}...` : "Fetching orders...");
    if (!isFromAddressSet) { setResponseMessage("Error: Configure address first."); setLoading(false); return; }
    if ((batchDateFilter.fromDate && !batchDateFilter.toDate) || (!batchDateFilter.fromDate && batchDateFilter.toDate)) { setResponseMessage("Please select both From Date and To Date."); setLoading(false); return; }
    if (batchDateFilter.fromDate && batchDateFilter.toDate && batchDateFilter.fromDate > batchDateFilter.toDate) { setResponseMessage("From Date cannot be after To Date."); setLoading(false); return; }
    try {
      const completedOrders = await fetchBatchOrders(batchDateFilter);
      if (completedOrders.length === 0) { setResponseMessage(hasRange ? `No eligible completed orders found for ${formatDisplayDateRange(batchDateFilter)}.` : "No eligible completed orders found."); setLoading(false); return; }
      setOrdersToPrint(completedOrders); setShowConfirmModal(true); setResponseMessage("");
    } catch (error) { setResponseMessage(`Error: ${error.response?.data?.error || error.message}`); }
    finally { setLoading(false); }
  };

  const handleBatchDateFilterChange = async (nextRange = {}) => {
    const normalizedRange = { fromDate: nextRange.fromDate !== undefined ? nextRange.fromDate : batchDateFilter.fromDate, toDate: nextRange.toDate !== undefined ? nextRange.toDate : batchDateFilter.toDate };
    setBatchDateFilter(normalizedRange);
    if (!showConfirmModal) return;
    const hasRange = !!(normalizedRange.fromDate || normalizedRange.toDate);
    if ((normalizedRange.fromDate && !normalizedRange.toDate) || (!normalizedRange.fromDate && normalizedRange.toDate)) { setOrdersToPrint([]); setResponseMessage("Please select both From Date and To Date."); return; }
    if (normalizedRange.fromDate && normalizedRange.toDate && normalizedRange.fromDate > normalizedRange.toDate) { setOrdersToPrint([]); setResponseMessage("From Date cannot be after To Date."); return; }
    setLoading(true);
    setResponseMessage(hasRange ? `Applying date filter for ${formatDisplayDateRange(normalizedRange)}...` : "Fetching orders for all dates...");
    try {
      const filteredOrders = await fetchBatchOrders(normalizedRange);
      setOrdersToPrint(filteredOrders);
      if (filteredOrders.length === 0) setResponseMessage(hasRange ? `No eligible completed orders found for ${formatDisplayDateRange(normalizedRange)}.` : "No eligible completed orders found.");
      else setResponseMessage("");
    } catch (error) { setResponseMessage(`Error: ${error.response?.data?.error || error.message}`); }
    finally { setLoading(false); }
  };

  const executePrintAll = async () => {
    setShowConfirmModal(false); setLoading(true);
    const tenantId = getTenantId();
    if (!ordersToPrint.length) { setResponseMessage("No orders available to print for the selected filter."); setLoading(false); return; }
    try {
      setResponseMessage(`Generating ${ordersToPrint.length} ${labelFormat === 'a4' ? 'invoices' : 'labels'}...`);
      const pdfBlobs = [];
      for (let i = 0; i < ordersToPrint.length; i++) {
        const order = ordersToPrint[i];
        const singleDoc = labelFormat === 'a4'
        ? await generateA4InvoicePDF(order)
        : labelFormat === 'thermal6'
        ? await generateThermal6PDF(order)
        : await generateThermalPDF(order);
        pdfBlobs.push(singleDoc.output('arraybuffer'));
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const { PDFDocument } = await import('pdf-lib');
      const mergedPdf = await PDFDocument.create();
      for (const pdfBytes of pdfBlobs) {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const [page] = await mergedPdf.copyPages(pdfDoc, [0]);
        mergedPdf.addPage(page);
      }
      const mergedPdfBytes = await mergedPdf.save();
      window.open(URL.createObjectURL(new Blob([mergedPdfBytes], { type: 'application/pdf' })), "_blank");
      const orderIds = ordersToPrint.map((order) => order.id);
      await api.post("/api/printing/mark-as-printed", { tenantId, orderIds, note: "Batch printed" });
      await fetchPendingOrdersCount();
      setResponseMessage(`✅ Successfully processed ${ordersToPrint.length} orders!`);
    } catch (error) {
      console.error(error); setResponseMessage(`Error: ${error.message}`);
    } finally { setLoading(false); setOrdersToPrint([]); setTimeout(() => setResponseMessage(""), 5000); }
  };

  // ── Shared inner content (used in both mobile and desktop) ────────────────
  const pageContent = (
    <>
      <PrintConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirmPrint={executePrintAll}
        ordersData={ordersToPrint}
        selectedFromDate={batchDateFilter.fromDate}
        selectedToDate={batchDateFilter.toDate}
        onDateRangeChange={handleBatchDateFilterChange}
        isFetchingOrders={loading && showConfirmModal}
      />

      {/* Top card */}
      <div className="mb-4 bg-white rounded-2xl shadow-sm overflow-hidden border border-emerald-100">
        {/* Header — consistent green gradient */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-6 text-center">
          <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <Printer className="w-6 h-6" /> Print Labels
          </h1>
          <p className="text-emerald-100 text-sm mt-1">Generate shipping labels for orders</p>
        </div>
        <div className="p-4">
        <div className="flex justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${pendingOrdersCount > 0 ? "bg-emerald-100" : "bg-slate-100"}`}>
              <Package className={`w-6 h-6 ${pendingOrdersCount > 0 ? "text-emerald-600" : "text-slate-400"}`} />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-bold">Orders Ready</p>
              <p className="text-2xl font-bold text-slate-800">{pendingOrdersCount}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleReset} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 hover:bg-slate-200 text-sm">
              <RefreshCw className="w-3.5 h-3.5"/> Reset
            </button>
            <button onClick={handleGenerateCombinedPDF} disabled={!isFromAddressSet || pendingOrdersCount === 0}
              className="px-3 py-2 bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1.5 hover:bg-emerald-700 disabled:opacity-50 text-sm">
              <Printer className="w-3.5 h-3.5"/> Print All ({pendingOrdersCount})
            </button>
          </div>
        </div>
        {responseMessage && (
          <div className="mt-3 p-2.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium text-center border border-emerald-100">
            {responseMessage}
          </div>
        )}
        </div>
      </div>

      {/* Single Print */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-emerald-100 mb-4">
        <h2 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
          <Printer className="w-4 h-4 text-emerald-500"/> Single Print
        </h2>
        <div className="space-y-3">
          <input type="text" value={orderId} onChange={(e) => setOrderId(e.target.value)}
            placeholder="Enter Order ID"
            className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-sm" />
          <button onClick={handleGenerateIndividualPDF} disabled={!orderId || !isFromAddressSet}
            className="w-full py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all text-sm">
            Print Label
          </button>
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-2xl shadow-sm p-4 border border-emerald-100">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600"/> Settings
          </h2>
          <button onClick={() => setIsEditingFromAddress(true)} className="text-xs font-bold text-emerald-600 hover:underline">
            {isFromAddressSet ? "Edit" : "Configure"}
          </button>
        </div>
        {isFromAddressSet ? (
          <div className="text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-900">{fromAddress.name}</p>
            <p>{fromAddress.city}, {fromAddress.state}</p>
            <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              Format: {labelFormat === 'a4' ? 'A4 Invoice' : 'Thermal 4x4'}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No address configured.</p>
        )}
      </div>

      {/* Address Edit Modal */}
      {isEditingFromAddress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="bg-emerald-50 p-4 border-b border-emerald-200 flex justify-between items-center">
              <h3 className="text-base font-bold text-slate-800">Edit Address & Settings</h3>
              <button onClick={() => setIsEditingFromAddress(false)} className="p-1 hover:bg-emerald-100 rounded-full">
                <X className="w-5 h-5 text-slate-400 hover:text-red-500"/>
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {[["Business Name", "name"], ["Address Line 1", "address1"]].map(([ph, field]) => (
                <input key={field} placeholder={ph} value={fromAddress[field]} onChange={e => handleFromAddressChange(field, e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:border-emerald-500 outline-none text-sm" />
              ))}
              <div className="grid grid-cols-2 gap-3">
                {[["City", "city"], ["State", "state"]].map(([ph, field]) => (
                  <input key={field} placeholder={ph} value={fromAddress[field]} onChange={e => handleFromAddressChange(field, e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-emerald-500 outline-none text-sm" />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[["ZIP Code", "zipCode"], ["Phone", "phone"]].map(([ph, field]) => (
                  <input key={field} placeholder={ph} value={fromAddress[field]} onChange={e => handleFromAddressChange(field, e.target.value)}
                    className="w-full p-3 border border-slate-300 rounded-xl focus:border-emerald-500 outline-none text-sm" />
                ))}
              </div>
              <div className="pt-3 border-t border-slate-100">
                <label className="block text-sm font-bold text-slate-700 mb-3">Preferred Label Size</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                  { val: 'thermal', label: 'Thermal', sub: '4x4 inch' },
                  { val: 'thermal6', label: 'Thermal 4x6', sub: '4x6 inch' },
                  { val: 'a4', label: 'A4 Sheet', sub: 'Invoice Style' }
                ].map(opt => (
                    <div key={opt.val} onClick={() => setLabelFormat(opt.val)}
                      className={`cursor-pointer p-3 border-2 rounded-xl flex items-center gap-2 transition-all ${labelFormat === opt.val ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${labelFormat === opt.val ? 'border-emerald-600' : 'border-slate-400'}`}>
                        {labelFormat === opt.val && <div className="w-2 h-2 bg-emerald-600 rounded-full" />}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">{opt.label}</p>
                        <p className="text-xs text-slate-500">{opt.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-emerald-50">
              <button onClick={handleSaveFromAddress} disabled={loading}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 text-sm flex justify-center items-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-slate-600"/> Reset Print Status
              </h3>
              <button onClick={() => setShowResetModal(false)} className="p-1 hover:bg-slate-200 rounded-full">
                <X className="w-5 h-5 text-slate-500"/>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-500">Choose what you want to reset:</p>
              {[
                { type: 'recent', icon: <History className="w-5 h-5"/>, label: 'Undo Last Batch', sub: 'Reset the most recently printed orders.' },
                { type: 'date', icon: <Calendar className="w-5 h-5"/>, label: 'Reset by Date', sub: 'Reset all prints from a specific day.' }
              ].map(opt => (
                <div key={opt.type} onClick={() => setResetType(opt.type)}
                  className={`cursor-pointer p-3 rounded-xl border-2 flex items-center gap-3 transition-all ${resetType === opt.type ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                  <div className={`p-2 rounded-full ${resetType === opt.type ? 'bg-emerald-200 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {opt.icon}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.sub}</p>
                  </div>
                </div>
              ))}
              {resetType === 'date' && (
                <input type="date" value={resetDate} onChange={(e) => setResetDate(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button onClick={() => setShowResetModal(false)} className="flex-1 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl text-sm">Cancel</button>
              <button onClick={executeReset} className="flex-1 py-2.5 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 text-sm">Confirm Reset</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="min-h-full bg-[#f0fdf4] p-3">
        {pageContent}
      </div>
    )
  }

  // ── DESKTOP ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 px-4 py-6">
      <div className="max-w-4xl w-full mx-auto">
        {pageContent}
      </div>
    </div>
  )
};

export default PrintLabels;
