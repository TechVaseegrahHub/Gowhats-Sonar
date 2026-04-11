import React, { useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { X, Printer, Package, Download, Image as ImageIcon, Calendar, Loader2 } from 'lucide-react';

const PrintConfirmationModal = ({
  isOpen,
  onClose,
  onConfirmPrint,
  ordersData = [],
  selectedFromDate = '',
  selectedToDate = '',
  onDateRangeChange,
  isFetchingOrders = false
}) => {
  // Ref specifically for the table content to capture full height
  const listRef = useRef(null);

  const formatDateLabel = (value) => {
    if (!value) return 'All Dates';
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(year, (month || 1) - 1, day || 1);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const formatDateRangeLabel = (fromDate, toDate) => {
    if (!fromDate && !toDate) return 'All Dates';
    if (fromDate && toDate) return `${formatDateLabel(fromDate)} to ${formatDateLabel(toDate)}`;
    if (fromDate) return `From ${formatDateLabel(fromDate)}`;
    return `Up to ${formatDateLabel(toDate)}`;
  };

  const summary = useMemo(() => {
    if (!ordersData || ordersData.length === 0) {
      return { totalOrders: 0, totalProducts: 0, aggregatedProducts: [] };
    }

    let totalProducts = 0;
    const productMap = new Map();

    ordersData.forEach(order => {
      order.line_items?.forEach(item => {
        const quantity = item.quantity || 1;
        totalProducts += quantity;
        productMap.set(item.name, (productMap.get(item.name) || 0) + quantity);
      });
    });

    const aggregatedProducts = Array.from(productMap.entries())
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    return {
      totalOrders: ordersData.length,
      totalProducts,
      aggregatedProducts,
    };
  }, [ordersData]);

  const handleDownloadPdf = () => {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Print Batch Product List", 14, 16);

    doc.setFontSize(10);
    doc.text(`Total Orders: ${summary.totalOrders}`, 14, 24);
    doc.text(`Total Products: ${summary.totalProducts}`, 14, 30);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 36);

    // ✅ FIXED: Calling autoTable as a function directly
    autoTable(doc, {
      startY: 48,
      head: [['Product Name', 'Total Quantity']],
      body: summary.aggregatedProducts.map(p => [p.name, p.quantity]),
      theme: 'grid',
      headStyles: { fillColor: [34, 197, 94] }, // Green color
      styles: { fontSize: 10 },
    });

    doc.save(`product-list-${Date.now()}.pdf`);
  };

  const handleDownloadPng = async () => {
    if (listRef.current) {
      try {
        const canvas = await html2canvas(listRef.current, {
          backgroundColor: '#ffffff',
          scale: 2, // Higher quality
          useCORS: true, // Helps if images are external
          // Ensure we capture the full scroll height
          windowHeight: listRef.current.scrollHeight,
        });

        const link = document.createElement('a');
        link.download = `product-list-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (error) {
        console.error("PNG Download Error:", error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600">
          <h2 className="text-xl font-bold text-white flex items-center gap-3">
            <Printer className="w-6 h-6" />
            Confirm Print Batch
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
         <div className="mb-5 p-3 sm:p-4 rounded-xl border border-emerald-100 bg-emerald-50/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Date-wise Print Filter
              </p>
              {isFetchingOrders && (
                <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading...
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <div className="w-full sm:flex-1">
                <label className="block text-[11px] font-semibold text-emerald-800 mb-1">From Date</label>
                <input
                  type="date"
                  value={selectedFromDate || ''}
                  onChange={(e) => onDateRangeChange?.({ fromDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div className="w-full sm:flex-1">
                <label className="block text-[11px] font-semibold text-emerald-800 mb-1">To Date</label>
                <input
                  type="date"
                  value={selectedToDate || ''}
                  onChange={(e) => onDateRangeChange?.({ toDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <button
                type="button"
                onClick={() => onDateRangeChange?.({ fromDate: '', toDate: '' })}
                className="sm:self-end px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                All Dates
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Showing: <span className="font-semibold">{formatDateRangeLabel(selectedFromDate, selectedToDate)}</span>
            </p>
          </div>
    
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border-2 border-green-200 p-4 rounded-xl text-center">
              <Package className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-700">Total Orders</p>
              <p className="text-4xl font-bold text-green-800">{summary.totalOrders}</p>
            </div>
            <div className="bg-blue-50 border-2 border-blue-200 p-4 rounded-xl text-center">
              <Package className="w-8 h-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-700">Total Products</p>
              <p className="text-4xl font-bold text-blue-800">{summary.totalProducts}</p>
            </div>
          </div>

          {/* Product List Container */}
          <div className="border-2 border-gray-200 rounded-xl bg-white overflow-hidden">
            <h3 className="text-lg font-bold text-gray-800 p-4 text-center border-b border-gray-100 bg-gray-50">
              📦 Aggregated Product List
            </h3>
            
            {/* Scrollable Area */}
            <div className="max-h-64 overflow-y-auto">
              
              {/* ✅ FIXED: Ref attached HERE to capture full table content, even hidden parts */}
              <div ref={listRef} className="bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-green-100">
                    <tr>
                      <th className="p-3 text-left font-bold text-gray-700">Product Name</th>
                      <th className="p-3 text-center font-bold text-gray-700 w-32">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.aggregatedProducts.map((product, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-gray-800">{product.name}</td>
                        <td className="p-3 text-center font-bold text-green-600">
                          {product.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Add a footer for the PNG so it looks official */}
                <div className="p-2 text-center text-xs text-gray-400 border-t">
                  Generated on {new Date().toLocaleString()} | Filter: {formatDateRangeLabel(selectedFromDate, selectedToDate)}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPdf}
              disabled={isFetchingOrders || summary.totalOrders === 0}
              className="px-6 py-2 text-sm bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} /> PDF
            </button>
            <button
              onClick={handleDownloadPng}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <ImageIcon size={16} /> PNG
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm bg-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirmPrint}
              className="px-6 py-2 text-sm bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
            >
              <Printer size={18} />
              Print All Labels ({summary.totalOrders})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintConfirmationModal;
