import React, { useState, useMemo } from 'react';
import { Download, X, Package, Users, BarChart2, Info, Loader2, Calendar, FileText } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const normalizePaymentStatus = (s) => {
  const v = String(s || '').toLowerCase().trim();
  if (v === 'paid' || v === 'complete' || v === 'completed') return 'completed';
  return ['pending', 'processing', 'failed', 'refunded', 'tested'].includes(v) ? v : 'pending';
};

// ✨ Aggressively extract SKU from any possible API format
const getSku = (item) => {
  if (!item) return 'N/A';
  const val =
    item.sku ||
    item.retailerId ||
    item.retailer_id ||
    item.product_retailer_id ||
    item.productId ||
    item.product_id ||
    item.inventoryItemId ||
    item.id ||
    item.catalogId;

  return (val && String(val).trim() !== '' && String(val).trim() !== 'undefined')
    ? String(val).trim()
    : 'N/A';
};

const OrderReportDownload = ({ orders = [], isOpen, onClose }) => {
  const [reportType, setReportType] = useState('monthly_sales');
  const [generating, setGenerating] = useState(false);

  // Date Picker States (Default to current month)
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  // ✨ EXPORT FILTER: Only "Completed" payments within the selected Date Range
  const exportOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return orders.filter(o => {
      // 1. MUST be Completed Payment
      if (normalizePaymentStatus(o.paymentStatus) !== 'completed') return false;

      // 2. MUST fall within selected dates (Uses paidAt if available, otherwise createdAt)
      const dateString = o.paidAt || o.paymentDetails?.paidAt || o.createdAt;
      if (!dateString) return false;

      const d = new Date(dateString);
      return d >= start && d <= end;
    });
  }, [orders, startDate, endDate]);

  // Exact stats for the currently filtered export list
  const stats = useMemo(() => {
    const revenue  = exportOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const customers = new Set(exportOrders.map((o) => o.customerPhone)).size;
    return { count: exportOrders.length, revenue, customers };
  }, [exportOrders]);

  // ── Monthly Sales Report ───────────────────────────────────────────────────
  const generateMonthlySalesReport = (rows) => {
    const map = {};
    let totalOrderRevenue = 0;

    rows.forEach((order) => {
      totalOrderRevenue += Number(order.totalAmount || 0);

      (order.items || []).forEach((item) => {
        const itemSku = getSku(item);
        const key = `${item.name}||${itemSku}`;

        if (!map[key]) {
          map[key] = {
            name:     item.name  || 'N/A',
            sku:      itemSku,
            price:    Number(item.price || 0),
            qty:      0,
            amount:   0,
          };
        }
        const qty   = Number(item.quantity || 1);
        const price = Number(item.price    || 0);
        map[key].qty    += qty;
        map[key].amount += qty * price;
        map[key].price = price;
      });
    });

    const products = Object.values(map).sort((a, b) => b.amount - a.amount);
    const totalQty = products.reduce((s, p) => s + p.qty, 0);
    const itemsSubtotal = products.reduce((s, p) => s + p.amount, 0);

    const totalShippingCharges = totalOrderRevenue - itemsSubtotal;

    const wsData = [];
    wsData.push([`Monthly Sales Report (Completed Payments Only)`]);
    wsData.push([`Date Range: ${format(new Date(startDate), 'dd MMM yyyy')} to ${format(new Date(endDate), 'dd MMM yyyy')}`]);
    wsData.push([`Total Paid Orders: ${rows.length}`]);
    wsData.push([]);
    wsData.push(['S.No', 'Product Name', 'SKU/Retailer ID', 'Unit Price (₹)', 'Qty Sold', 'Amount (₹)', 'Notes']);

    products.forEach((p, i) => {
      wsData.push([i + 1, p.name, p.sku, p.price, p.qty, Number(p.amount.toFixed(2)), '']);
    });

    wsData.push([]);
    wsData.push(['', 'Total Shipping Charges', '', '', '', Number(totalShippingCharges.toFixed(2)), 'Combined shipping from all orders']);
    wsData.push(['', 'GRAND TOTAL REVENUE', '', '', totalQty, Number(totalOrderRevenue.toFixed(2)), 'Includes shipping']);

    const ws = utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 45 }, { wch: 25 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 35 }];
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }
    ];
    return { ws };
  };

  // ── Product Sales ──────────────────────────────────────────────────────────
  const generateProductSalesReport = (rows) => {
    const map = {};
    rows.forEach((order) => {
      (order.items || []).forEach((item) => {
        const itemSku = getSku(item);
        const key = itemSku !== 'N/A' ? itemSku : (item.name || 'Unknown');

        if (!map[key]) {
          map[key] = {
            'Product Name':      item.name || 'N/A',
            'SKU':               itemSku,
            'Units Sold':        0,
            'Total Revenue (₹)': 0,
            'Number of Orders':  0,
            _customers:          new Set(),
          };
        }
        const qty   = Number(item.quantity || 1);
        const price = Number(item.price    || 0);
        map[key]['Units Sold']        += qty;
        map[key]['Total Revenue (₹)'] += qty * price;
        map[key]['Number of Orders']  += 1;
        if (order.customerPhone) map[key]._customers.add(order.customerPhone);
      });
    });

    return Object.values(map)
      .sort((a, b) => b['Total Revenue (₹)'] - a['Total Revenue (₹)'])
      .map((r) => ({
        'Product Name':      r['Product Name'],
        'SKU':               r['SKU'],
        'Units Sold':        r['Units Sold'],
        'Total Revenue (₹)': Number(r['Total Revenue (₹)'].toFixed(2)),
        'Avg Price (₹)':     Number((r['Total Revenue (₹)'] / (r['Units Sold'] || 1)).toFixed(2)),
        'Number of Orders':  r['Number of Orders'],
        'Unique Customers':  r._customers.size,
      }));
  };

  // ── Completed Orders Detail sheet ──────────────────────────────────────────
  const generateCompletedOrdersSheet = (rows) => {
    const fmtDate = (d) => d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : 'N/A';
    const wsData  = [];

    wsData.push([`Orders Detail List (Completed Payments Only)`]);
    wsData.push([`Date Range: ${format(new Date(startDate), 'dd MMM yyyy')} to ${format(new Date(endDate), 'dd MMM yyyy')}`]);
    wsData.push([`Total Paid Orders Exported: ${rows.length}`]);
    wsData.push([]);
    wsData.push(['S.No', 'Order ID', 'Date', 'Customer Name', 'Phone', 'Product Name', 'SKU/Retailer ID', 'Unit Price (₹)', 'Qty', 'Item Amount (₹)', 'Shipping Cost (₹)', 'Order Total (₹)', 'Payment Status', 'Order Status']);

    let sno = 1;
    rows.forEach((order) => {
      const items   = order.items || [];
      const date    = fmtDate(order.paidAt || order.createdAt);
      const custName = order.customerDetails?.name || 'N/A';
      const phone   = order.customerPhone || 'N/A';
      const orderTotal = Number(order.totalAmount || 0);
      const shippingCost = Number(order.shippingCost || 0);
      const payStatus  = (order.paymentStatus || '').toLowerCase();
      const ordStatus  = order.status || 'N/A';

      if (items.length === 0) {
        wsData.push([sno++, order.orderId, date, custName, phone, 'N/A', 'N/A', 0, 0, 0, shippingCost, orderTotal, payStatus, ordStatus]);
      } else {
        items.forEach((item, idx) => {
          const itemSku = getSku(item);
          const qty    = Number(item.quantity || 1);
          const price  = Number(item.price    || 0);
          wsData.push([
            idx === 0 ? sno++ : '',
            idx === 0 ? order.orderId : '',
            idx === 0 ? date : '',
            idx === 0 ? custName : '',
            idx === 0 ? phone : '',
            item.name  || 'N/A',
            itemSku,
            price,
            qty,
            Number((qty * price).toFixed(2)),
            idx === 0 ? shippingCost : '',
            idx === 0 ? orderTotal : '',
            idx === 0 ? payStatus : '',
            idx === 0 ? ordStatus : '',
          ]);
        });
      }
    });

    wsData.push([]);
    const grandTotal = rows.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    wsData.push(['', '', '', '', '', '', '', '', '', '', 'GRAND TOTAL (₹)', Number(grandTotal.toFixed(2)), '', '']);

    const ws = utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 6 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 15 }, { wch: 40 }, { wch: 25 }, { wch: 14 }, { wch: 6 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 13 }];
    return ws;
  };

  // ── Customer Insights ──────────────────────────────────────────────────────
  const generateCustomerInsightsReport = (rows) => {
    const map = {};
    rows.forEach((order) => {
      const phone = order.customerPhone || 'N/A';
      if (!map[phone]) {
        map[phone] = {
          customerName:    order.customerDetails?.name  || 'N/A',
          phone,
          email:           order.customerDetails?.email || 'N/A',
          city:            order.shippingAddress?.city  || 'N/A',
          state:           order.shippingAddress?.state || 'N/A',
          totalOrders:     0,
          totalSpent:      0,
          paidOrders:      0,
          products:        {},
          firstOrderDate:  null,
          lastOrderDate:   null,
          orderIds:        [],
        };
      }
      const c = map[phone];
      c.totalOrders += 1;
      c.totalSpent  += Number(order.totalAmount || 0);
      c.orderIds.push(order.orderId);

      if (normalizePaymentStatus(order.paymentStatus) === 'completed') c.paidOrders += 1;

      const d = new Date(order.createdAt);
      if (!c.lastOrderDate  || d > c.lastOrderDate)  c.lastOrderDate  = d;
      if (!c.firstOrderDate || d < c.firstOrderDate) c.firstOrderDate = d;

      (order.items || []).forEach((item) => {
        const pName = item.name || 'Unknown';
        if (!c.products[pName]) c.products[pName] = { qty: 0, spent: 0 };
        c.products[pName].qty   += Number(item.quantity || 1);
        c.products[pName].spent += Number(item.quantity || 1) * Number(item.price || 0);
      });
    });

    return Object.values(map)
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .map((c) => {
        const productsWithQty = Object.entries(c.products)
          .sort((a, b) => b[1].qty - a[1].qty)
          .map(([name, d]) => `${name} (x${d.qty})`)
          .join(' | ');

        const productNames = Object.keys(c.products).join(', ');
        const totalItems   = Object.values(c.products).reduce((s, p) => s + p.qty, 0);

        return {
          'Customer Name':         c.customerName,
          'Phone Number':          c.phone,
          'Email':                 c.email,
          'City':                  c.city,
          'State':                 c.state,
          'Total Orders':          c.totalOrders,
          'Total Items Purchased': totalItems,
          'Unique Products':       Object.keys(c.products).length,
          'Products Purchased':    productNames,
          'Products with Qty':     productsWithQty,
          'Paid Orders':           c.paidOrders,
          'Total Spent (₹)':       Number(c.totalSpent.toFixed(2)),
          'Avg Order Value (₹)':   Number((c.totalSpent / (c.totalOrders || 1)).toFixed(2)),
          'First Order':           c.firstOrderDate ? format(c.firstOrderDate, 'dd/MM/yyyy') : 'N/A',
          'Last Order':            c.lastOrderDate  ? format(c.lastOrderDate,  'dd/MM/yyyy') : 'N/A',
          'Order IDs':             c.orderIds.join(', '),
        };
      });
  };

  // ── ✨ NEW: Invoice Format Report (matches Google Sheets layout) ────────────
  const generateInvoiceFormatReport = (rows) => {
    const wsData = [];

    // Header row — exactly matching the Google Sheets columns in screenshot
    wsData.push([
      'Invoice Date',
      'Invoice Number',
      'Customer Name',
      'Billing Address',
      'Item Name',
      'Quantity',
      'Unit Price (₹)',
      'Item Total (₹)',
    ]);

    rows.forEach((order) => {
      const items = order.items || [];

      // Build billing address from available fields
      const addr = order.shippingAddress || order.billingAddress || {};
      const addressParts = [
        addr.line1 || addr.address1 || addr.street || '',
        addr.line2 || addr.address2 || '',
        addr.city  || '',
        addr.state || '',
        addr.pincode || addr.zip || addr.postalCode || '',
      ].filter(Boolean);
      const billingAddress = addressParts.length > 0
        ? addressParts.join(', ')
        : (order.customerDetails?.address || 'N/A');

      const invoiceDate = order.paidAt || order.paymentDetails?.paidAt || order.createdAt;
      const fmtInvoiceDate = invoiceDate ? format(new Date(invoiceDate), 'yyyy-MM') : 'N/A';
      const invoiceNumber = order.orderId || order.invoiceNumber || 'N/A';
      const customerName  = order.customerDetails?.name || 'N/A';

      if (items.length === 0) {
        wsData.push([
          fmtInvoiceDate,
          invoiceNumber,
          customerName,
          billingAddress,
          'N/A',
          0,
          0,
          0,
        ]);
      } else {
        items.forEach((item) => {
          const qty   = Number(item.quantity || 1);
          const price = Number(item.price    || 0);
          wsData.push([
            fmtInvoiceDate,
            invoiceNumber,
            customerName,
            billingAddress,
            item.name || 'N/A',
            qty,
            price,
            Number((qty * price).toFixed(2)),
          ]);
        });
      }
    });

    const ws = utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 14 },  // Invoice Date
      { wch: 16 },  // Invoice Number
      { wch: 28 },  // Customer Name
      { wch: 50 },  // Billing Address
      { wch: 40 },  // Item Name
      { wch: 10 },  // Quantity
      { wch: 16 },  // Unit Price
      { wch: 16 },  // Item Total
    ];

    // Bold the header row
    const headerRange = utils.decode_range(ws['!ref']);
    for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
      const cellAddr = utils.encode_cell({ r: 0, c: C });
      if (ws[cellAddr]) {
        ws[cellAddr].s = { font: { bold: true }, fill: { fgColor: { rgb: 'D9F0E1' } } };
      }
    }

    return ws;
  };

  // ── Download Logic ──────────────────────────────────────────────────────────
  const downloadExcel = () => {
    if (exportOrders.length === 0) return;
    setGenerating(true);

    setTimeout(() => {
      try {
        const ts = format(new Date(), 'yyyyMMdd_HHmm');
        const wb = utils.book_new();

        if (reportType === 'monthly_sales') {
          const { ws } = generateMonthlySalesReport(exportOrders);
          utils.book_append_sheet(wb, ws, 'Monthly Sales');
          writeFile(wb, `Completed_Sales_Report_${ts}.xlsx`);

        } else if (reportType === 'product_sales') {
          const reportData = generateProductSalesReport(exportOrders);
          if (reportData.length > 0) {
            const ws1 = utils.json_to_sheet(reportData);
            ws1['!cols'] = Object.keys(reportData[0]).map((k) => ({ wch: Math.max(k.length + 2, 18) }));
            utils.book_append_sheet(wb, ws1, 'Product Summary');
          }
          const ws2 = generateCompletedOrdersSheet(exportOrders);
          utils.book_append_sheet(wb, ws2, 'Orders Detail');
          writeFile(wb, `Detailed_Paid_Products_${ts}.xlsx`);

        } else if (reportType === 'invoice_format') {
          const ws = generateInvoiceFormatReport(exportOrders);
          utils.book_append_sheet(wb, ws, 'Invoice Data');
          writeFile(wb, `Invoice_Format_Export_${ts}.xlsx`);

        } else {
          const reportData = generateCustomerInsightsReport(exportOrders);
          if (reportData.length > 0) {
            const ws = utils.json_to_sheet(reportData);
            ws['!cols'] = Object.keys(reportData[0]).map((k) => ({ wch: Math.max(k.length + 2, 20) }));
            utils.book_append_sheet(wb, ws, 'Customer Insights');
            writeFile(wb, `Paid_Customer_Insights_${ts}.xlsx`);
          }
        }
        setGenerating(false);
        onClose();
      } catch (err) {
        console.error('Report error:', err);
        setGenerating(false);
      }
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-100">

        <div className="bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-xl"><Download className="h-5 w-5 text-white" /></div>
            <div>
              <h2 className="text-lg font-bold text-white">Export Sales Report</h2>
              <p className="text-green-100 text-xs">Exports ONLY "Completed" payment orders</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[65vh]">

          {/* ✨ Date Range Picker */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
             <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
               <Calendar className="w-4 h-4" /> Select Date Range
             </h3>
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">Start Date</label>
                 <input
                   type="date"
                   value={startDate}
                   onChange={(e) => setStartDate(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                 />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-400 mb-1">End Date</label>
                 <input
                   type="date"
                   value={endDate}
                   onChange={(e) => setEndDate(e.target.value)}
                   className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                 />
               </div>
             </div>
          </div>

          {/* Report Type Toggle */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Select Report Format</p>
            <div className="space-y-3">
              {[
                { id: 'monthly_sales',     Icon: BarChart2,  label: 'Monthly Sales Report',        desc: 'Summary of products sold with total revenue' },
                { id: 'product_sales',     Icon: Package,    label: 'Detailed Product & Orders',    desc: 'Product summary + line-by-line detailed orders list' },
                { id: 'invoice_format',    Icon: FileText,   label: 'Invoice Format',               desc: 'Invoice Date · Invoice No · Customer · Address · Item · Qty · Price — matches your Google Sheets layout' },
                { id: 'customer_insights', Icon: Users,      label: 'Customer Insights',            desc: 'Customer details, LTV, and purchase behavior' },
              ].map(({ id, Icon, label, desc }) => (
                <button
                  key={id} type="button" onClick={() => setReportType(id)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${reportType === id ? 'border-green-500 bg-green-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <div className={`flex items-center gap-2 font-bold text-sm mb-1 ${reportType === id ? 'text-green-800' : 'text-gray-800'}`}>
                    <Icon className="w-5 h-5" /> {label}
                  </div>
                  <p className="text-xs text-gray-500">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Filter Stats Notification */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Export Ready</p>
              <p className="text-xs text-blue-800 mt-1 leading-relaxed">
                Will export <b>{stats.count} completed orders</b> within the selected dates.
                (Total Export Revenue: <b>₹{stats.revenue.toLocaleString('en-IN')}</b>)
              </p>
            </div>
          </div>

        </div>

        <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end shrink-0">
          <button
            type="button"
            onClick={downloadExcel}
            disabled={generating || stats.count === 0}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
          >
            {generating ? (
              <><Loader2 className="animate-spin h-4 w-4" /> Generating Excel...</>
            ) : (
              <><Download className="h-4 w-4" /> Download Paid Orders</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default OrderReportDownload;
