import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, writeBatch } from 'firebase/firestore';
import { db, logOut } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { LogOut, Warehouse as WarehouseIcon, Package, Search, RefreshCw, ArrowRightLeft, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Input } from '../components/ui/Input';
import brandLogoFull from '../assets/brand-logo-full.png';
import { syncManagedCollections } from '../lib/dataManagement';

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export default function UserDashboard() {
  const { profile } = useAuth();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [cars, setCars] = useState<any[]>([]);
  const [guards, setGuards] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'items' | 'transactions'>('items');
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string>('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState<string>('all');
  const [itemViewMode, setItemViewMode] = useState<'detailed' | 'grouped'>('detailed');
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionData, setTransactionData] = useState<any>({ type: 'out' });
  const [selectedItemForTx, setSelectedItemForTx] = useState<any>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<{
    tone: SyncState;
    message: string;
    timestamp: string | null;
  }>({
    tone: 'idle',
    message: 'الحركات تحفظ مباشرة على Firebase، ويمكنك تنفيذ مزامنة يدوية في أي وقت.',
    timestamp: null,
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snapshot) => setWarehouses(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => setCategories(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => setItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc')), (snapshot) => setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => setDrivers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubCars = onSnapshot(collection(db, 'cars'), (snapshot) => setCars(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    const unsubGuards = onSnapshot(collection(db, 'guards'), (snapshot) => setGuards(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))));
    return () => { unsubWarehouses(); unsubCategories(); unsubItems(); unsubTransactions(); unsubDrivers(); unsubCars(); unsubGuards(); };
  }, []);

  const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'حدث خطأ غير متوقع.';

  const markSyncSuccess = (message: string) => {
    setSyncState({
      tone: 'success',
      message,
      timestamp: new Date().toISOString(),
    });
  };

  const markSyncFailure = (error: unknown, fallbackMessage: string) => {
    console.error(error);
    setSyncState({
      tone: 'error',
      message: `${fallbackMessage} ${getErrorMessage(error)}`,
      timestamp: null,
    });
  };

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setSyncState((current) => ({
      tone: 'syncing',
      message: 'جاري مزامنة البيانات الحالية مع Firebase...',
      timestamp: current.timestamp,
    }));

    try {
      const result = await syncManagedCollections(db, {
        warehouses,
        categories,
        items,
        transactions,
        drivers,
        cars,
        guards,
      });
      markSyncSuccess(`اكتملت المزامنة اليدوية مع Firebase وتم تحديث ${result.setCount.toLocaleString('ar-EG')} سجل.`);
    } catch (error) {
      markSyncFailure(error, 'تعذرت المزامنة اليدوية.');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransactionError(null);
    if (!selectedItemForTx) return;
    const qty = Number(transactionData.quantity);
    if (qty <= 0) { setTransactionError('الكمية يجب أن تكون أكبر من صفر'); return; }
    const newQty = transactionData.type === 'in' ? selectedItemForTx.quantity + qty : selectedItemForTx.quantity - qty;
    if (newQty < 0) { setTransactionError('الكمية المتاحة غير كافية لهذه الحركة!'); return; }
    const batch = writeBatch(db);
    const txId = Date.now().toString();
    const warehouseName = warehouses.find((warehouse) => warehouse.id === selectedItemForTx.warehouseId)?.name || '';
    batch.set(doc(db, 'transactions', txId), {
      id: txId,
      itemId: selectedItemForTx.id,
      itemName: selectedItemForTx.name,
      warehouseId: selectedItemForTx.warehouseId || '',
      warehouseName,
      type: transactionData.type,
      quantity: qty,
      projectName: transactionData.type === 'out' ? (transactionData.projectName || '') : '',
      driverName: transactionData.driverName || '',
      carNumber: transactionData.carNumber || '',
      guardName: transactionData.guardName || '',
      notes: transactionData.notes || '',
      date: new Date().toISOString(),
      user: profile?.name || 'Unknown'
    });
    batch.update(doc(db, 'items', selectedItemForTx.id), { quantity: newQty, lastUpdated: new Date().toISOString(), updatedBy: profile?.name || 'Unknown' });
    setSyncState((current) => ({
      tone: 'syncing',
      message: 'جاري حفظ الحركة ومزامنتها مع Firebase...',
      timestamp: current.timestamp,
    }));

    try {
      await batch.commit();
      markSyncSuccess('تم حفظ الحركة المخزنية ومزامنتها مع Firebase.');
    } catch (error) {
      markSyncFailure(error, 'تعذر حفظ الحركة المخزنية.');
      return;
    }

    setIsTransactionModalOpen(false);
    setTransactionData({ type: 'out' });
    setSelectedItemForTx(null);
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWarehouse = selectedWarehouse === 'all' || item.warehouseId === selectedWarehouse;
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory;
    const matchesUnit = selectedUnit === 'all' || item.unit === selectedUnit;
    return matchesSearch && matchesWarehouse && matchesCategory && matchesUnit;
  }).sort((a, b) => {
    const catA = categories.find((c) => c.id === a.categoryId)?.name || '';
    const catB = categories.find((c) => c.id === b.categoryId)?.name || '';
    if (catA !== catB) return catA.localeCompare(catB, 'ar');
    return a.name.localeCompare(b.name, 'ar');
  });

  const groupedItems = Object.values(filteredItems.reduce((acc: any, item) => {
    const key = `${item.categoryId}-${item.name}-${item.unit}`;
    if (!acc[key]) acc[key] = { ...item, quantity: 0, warehouseDetails: [] };
    acc[key].quantity += item.quantity;
    const warehouseName = warehouses.find((w) => w.id === item.warehouseId)?.name || 'غير محدد';
    acc[key].warehouseDetails.push(`${warehouseName} (${item.quantity})`);
    return acc;
  }, {}));

  const categoryNameById: Record<string, string> = {};
  categories.forEach((category) => { categoryNameById[category.id] = category.name; });
  const warehouseNameById: Record<string, string> = {};
  warehouses.forEach((warehouse) => { warehouseNameById[warehouse.id] = warehouse.name; });
  const itemCategoryIdByItemId: Record<string, string | undefined> = {};
  items.forEach((item) => { itemCategoryIdByItemId[item.id] = item.categoryId; });
  const itemWarehouseIdByItemId: Record<string, string | undefined> = {};
  items.forEach((item) => { itemWarehouseIdByItemId[item.id] = item.warehouseId; });
  const getTransactionCategoryId = (tx: any) => itemCategoryIdByItemId[tx.itemId] || 'uncategorized';
  const getTransactionCategoryName = (tx: any) => {
    const categoryId = getTransactionCategoryId(tx);
    return categoryId === 'uncategorized' ? 'غير محدد' : categoryNameById[categoryId] || 'غير محدد';
  };
  const getTransactionWarehouseId = (tx: any) => tx.warehouseId || itemWarehouseIdByItemId[tx.itemId];
  const getTransactionWarehouseName = (tx: any) => {
    const warehouseId = getTransactionWarehouseId(tx);
    if (tx.warehouseName) return tx.warehouseName;
    return warehouseId ? warehouseNameById[warehouseId] || 'غير محدد' : 'غير محدد';
  };
  const uniqueUnits = Array.from(new Set(items.map((item) => item.unit))).filter(Boolean);
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = tx.itemName?.toLowerCase().includes(txSearchQuery.toLowerCase()) || tx.projectName?.toLowerCase().includes(txSearchQuery.toLowerCase());
    const matchesType = txTypeFilter === 'all' || tx.type === txTypeFilter;
    const matchesCategory = txCategoryFilter === 'all' || getTransactionCategoryId(tx) === txCategoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });
  const transactionSummary = filteredTransactions.reduce((summary, tx) => {
    summary.total += 1;
    if (tx.type === 'in') summary.inbound += Number(tx.quantity || 0); else summary.outbound += Number(tx.quantity || 0);
    return summary;
  }, { total: 0, inbound: 0, outbound: 0 });

  return (
    <div className="app-shell flex h-[100dvh] overflow-hidden text-right font-sans" dir="rtl">
      <aside className="fixed bottom-0 z-50 flex w-full rounded-t-[2rem] bg-[linear-gradient(180deg,#003a34_0%,#004d40_48%,#016b5b_100%)] text-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:inset-y-0 md:right-0 md:w-64 md:rounded-none md:flex-col md:shadow-2xl">
        <div className="hidden flex-col items-center justify-center border-b border-white/10 p-6 md:flex">
          <div className="mb-4 rounded-[28px] bg-white/95 p-3 shadow-xl shadow-black/10">
            <img src={brandLogoFull} alt="شعار إنارة ستوك" className="h-auto w-40 max-w-full" />
          </div>
          <h2 className="text-center text-xl font-black tracking-wider">إدارة مخازن إنارة</h2>
        </div>
        <div className="mx-4 mt-6 hidden items-center gap-3 rounded-2xl bg-black/20 p-4 md:flex">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00bfa5] text-lg font-bold">{profile?.name?.charAt(0) || 'م'}</div>
          <div className="overflow-hidden"><p className="truncate text-sm font-bold">{profile?.name}</p><p className="text-xs text-[#00bfa5]">مستخدم</p></div>
        </div>
        <nav className="no-scrollbar flex flex-1 justify-around gap-1 overflow-x-auto px-2 py-2 md:flex-col md:justify-start md:space-y-2 md:overflow-y-auto md:px-4 md:py-6">
          <button onClick={() => setActiveTab('items')} className={`flex min-w-[70px] flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 md:min-w-0 md:flex-row md:gap-3 md:px-4 md:py-3 ${activeTab === 'items' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}><Package className="h-5 w-5" /><span className="text-[10px] font-bold md:text-sm">الأصناف والمخزون</span></button>
          <button onClick={() => setActiveTab('transactions')} className={`flex min-w-[70px] flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all duration-200 md:min-w-0 md:flex-row md:gap-3 md:px-4 md:py-3 ${activeTab === 'transactions' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}><ArrowRightLeft className="h-5 w-5" /><span className="text-[10px] font-bold md:text-sm">سجل الحركات</span></button>
        </nav>
      </aside>
      <div className="mb-20 flex min-h-0 flex-1 flex-col overflow-hidden md:mb-0 md:mr-64">
        <header className="dashboard-shell sticky top-0 z-40 flex min-h-20 items-center justify-between border-b border-white/60 px-4 py-4 md:px-8">
          <h1 className="text-2xl font-black text-[#004d40]">{activeTab === 'items' ? 'الأصناف والمخزون' : 'سجل الحركات'}</h1>
          <Button onClick={logOut} variant="ghost" className="rounded-xl text-red-500 hover:bg-red-50"><LogOut className="ml-2 h-5 w-5" /> تسجيل الخروج</Button>
        </header>
        <main className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-28 pt-4 md:px-8 md:pb-8 md:pt-6">
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="dashboard-panel group relative flex items-center justify-between overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"><div className="absolute right-0 top-0 h-full w-1.5 origin-bottom bg-[#00bfa5] transition-transform duration-300 group-hover:scale-y-110"></div><div className="pr-2"><h3 className="mb-1 text-sm font-bold text-gray-500">المخازن المتاحة</h3><p className="text-3xl font-black text-[#004d40]">{warehouses.length}</p></div><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#00bfa5] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"><WarehouseIcon className="h-7 w-7" /></div></div>
            <div className="dashboard-panel group relative flex items-center justify-between overflow-hidden rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"><div className="absolute right-0 top-0 h-full w-1.5 origin-bottom bg-[#00bfa5] transition-transform duration-300 group-hover:scale-y-110"></div><div className="pr-2"><h3 className="mb-1 text-sm font-bold text-gray-500">إجمالي الأصناف</h3><p className="text-3xl font-black text-[#004d40]">{items.length}</p></div><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-[#00bfa5] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"><Package className="h-7 w-7" /></div></div>
          </div>

          <div className="dashboard-panel mb-6 rounded-[28px] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                      syncState.tone === 'success'
                        ? 'bg-emerald-50 text-emerald-700'
                        : syncState.tone === 'error'
                          ? 'bg-red-50 text-red-700'
                          : syncState.tone === 'syncing'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {syncState.tone === 'success' && <CheckCircle2 className="h-4 w-4" />}
                    {syncState.tone === 'error' && <AlertCircle className="h-4 w-4" />}
                    {syncState.tone === 'syncing' && <RefreshCw className="h-4 w-4 animate-spin" />}
                    {syncState.message}
                  </span>
                  {syncState.timestamp && (
                    <span className="text-xs font-medium text-gray-500">
                      آخر مزامنة: {format(new Date(syncState.timestamp), 'PP p', { locale: ar })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">
                  تحفظ الحركات مباشرة على Firebase، ويمكنك استخدام زر المزامنة لإعادة رفع النسخة الحالية من البيانات عند الحاجة.
                </p>
              </div>

              <Button
                variant="secondary"
                onClick={handleManualSync}
                className="self-start rounded-2xl bg-slate-100 text-slate-800 hover:bg-slate-200"
                disabled={isManualSyncing}
              >
                <RefreshCw className={`ml-2 h-4 w-4 ${isManualSyncing ? 'animate-spin' : ''}`} />
                {isManualSyncing ? 'جاري المزامنة...' : 'مزامنة Firebase'}
              </Button>
            </div>
          </div>

          {activeTab === 'items' && (
            <div className="dashboard-shell flex flex-1 flex-col overflow-visible rounded-[28px] p-4 md:min-h-0 md:overflow-hidden md:p-6">
              <div className="mb-6 flex flex-col gap-4">
                <div className="flex self-start rounded-lg bg-gray-100 p-1">
                  <button onClick={() => setItemViewMode('detailed')} className={`rounded-md px-4 py-2 text-sm transition-colors ${itemViewMode === 'detailed' ? 'bg-white font-medium text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}>عرض مفصل</button>
                  <button onClick={() => setItemViewMode('grouped')} className={`rounded-md px-4 py-2 text-sm transition-colors ${itemViewMode === 'grouped' ? 'bg-white font-medium text-blue-600 shadow' : 'text-gray-600 hover:text-gray-900'}`}>تجميع بالصنف</button>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
                  <div className="relative min-w-[200px] flex-1"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input placeholder="بحث عن صنف..." className="pr-10" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                  <select className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:w-40" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}><option value="all">جميع التصنيفات</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                  <select className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:w-40" value={selectedWarehouse} onChange={(e) => setSelectedWarehouse(e.target.value)}><option value="all">جميع المخازن</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
                  <select className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:w-40" value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)}><option value="all">جميع الوحدات</option>{uniqueUnits.map((unit) => <option key={String(unit)} value={String(unit)}>{String(unit)}</option>)}</select>
                </div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm md:min-h-0 md:flex-1 md:overflow-hidden md:p-6">
                <div className="grid grid-cols-1 gap-4 md:hidden">
                  {itemViewMode === 'detailed' ? (
                    filteredItems.length === 0 ? <div className="rounded-lg border bg-gray-50 p-8 text-center text-gray-500">لا توجد أصناف مطابقة للبحث</div> : filteredItems.map((item) => {
                      const category = categories.find((entry) => entry.id === item.categoryId);
                      const warehouse = warehouses.find((entry) => entry.id === item.warehouseId);
                      return <div key={item.id} className={`rounded-lg border p-4 shadow-sm ${item.quantity <= (item.minQuantity || 0) ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}><div className="mb-3 flex justify-between items-start"><div><div className="flex items-center gap-2"><h3 className="text-lg font-bold text-gray-900">{item.name}</h3>{item.quantity <= (item.minQuantity || 0) && <AlertTriangle className="h-5 w-5 text-red-500" />}</div><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{category?.name || 'غير محدد'}</span><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{warehouse?.name || 'غير محدد'}</span></div></div></div><div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-white/50 p-3 text-sm"><div><span className="mb-1 block text-xs text-gray-500">الكمية المتاحة</span><span className={`text-xl font-bold ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</span><span className="mr-1 font-medium text-gray-600">{item.unit}</span></div><div><span className="mb-1 block text-xs text-gray-500">حد الطلب</span><span className="text-xl font-bold text-gray-700">{item.minQuantity || 0}</span></div></div><div className="text-xs text-gray-500"><span className="block">آخر تحديث: {format(new Date(item.lastUpdated), 'PP p', { locale: ar })}</span><span className="mt-1 block">بواسطة: {item.updatedBy}</span></div></div>;
                    })
                  ) : (
                    groupedItems.length === 0 ? <div className="rounded-lg border bg-gray-50 p-8 text-center text-gray-500">لا توجد أصناف مطابقة للبحث</div> : groupedItems.map((item: any, index: number) => {
                      const category = categories.find((entry) => entry.id === item.categoryId);
                      return <div key={index} className={`rounded-lg border p-4 shadow-sm ${item.quantity <= (item.minQuantity || 0) ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}><div className="mb-3 flex justify-between items-start"><div><div className="flex items-center gap-2"><h3 className="text-lg font-bold text-gray-900">{item.name}</h3>{item.quantity <= (item.minQuantity || 0) && <AlertTriangle className="h-5 w-5 text-red-500" />}</div><div className="mt-2 flex flex-wrap gap-2"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{category?.name || 'غير محدد'}</span></div></div></div><div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-gray-100 bg-white/50 p-3 text-sm"><div><span className="mb-1 block text-xs text-gray-500">إجمالي الكمية</span><span className={`text-xl font-bold ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</span><span className="mr-1 font-medium text-gray-600">{item.unit}</span></div><div><span className="mb-1 block text-xs text-gray-500">حد الطلب</span><span className="text-xl font-bold text-gray-700">{item.minQuantity || 0}</span></div></div><div className="text-xs text-gray-500"><span className="mb-1 block font-medium text-gray-700">التوزيع على المخازن:</span><div className="flex flex-wrap gap-1">{item.warehouseDetails.map((warehouseDetail: string, idx: number) => <span key={idx} className="rounded-md bg-gray-100 px-2 py-1">{warehouseDetail}</span>)}</div></div></div>;
                    })
                  )}
                </div>
                <div className="custom-scrollbar hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-white/70 bg-white/80 shadow-sm md:block">
                  <table className="relative w-full whitespace-nowrap text-right text-sm">
                    <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/90 text-gray-600 backdrop-blur-sm">{itemViewMode === 'detailed' ? <tr><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">التصنيف</th><th className="px-4 py-3">المخزن</th><th className="px-4 py-3">الكمية المتاحة</th><th className="px-4 py-3">الوحدة</th><th className="px-4 py-3">آخر تحديث</th></tr> : <tr><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">التصنيف</th><th className="px-4 py-3">إجمالي الكمية</th><th className="px-4 py-3">الوحدة</th><th className="px-4 py-3">التوزيع على المخازن</th></tr>}</thead>
                    <tbody className="divide-y divide-gray-100">{itemViewMode === 'detailed' ? (filteredItems.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">لا توجد أصناف مطابقة للبحث</td></tr> : filteredItems.map((item) => { const category = categories.find((entry) => entry.id === item.categoryId); const warehouse = warehouses.find((entry) => entry.id === item.warehouseId); return <tr key={item.id} className={`transition-colors hover:bg-teal-50/30 ${item.quantity <= (item.minQuantity || 0) ? 'bg-red-50' : ''}`}><td className="flex items-center gap-2 px-4 py-3 font-bold text-gray-800">{item.quantity <= (item.minQuantity || 0) && <AlertTriangle className="h-4 w-4 text-red-500" />}{item.name}</td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{category?.name || 'غير محدد'}</span></td><td className="px-4 py-3">{warehouse?.name || 'غير محدد'}</td><td className={`px-4 py-3 font-bold ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</td><td className="px-4 py-3 text-gray-500">{item.unit}</td><td className="px-4 py-3 text-xs text-gray-500">{format(new Date(item.lastUpdated), 'PP p', { locale: ar })}<span className="block text-gray-400">بواسطة: {item.updatedBy}</span></td></tr>; })) : (groupedItems.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">لا توجد أصناف مطابقة للبحث</td></tr> : groupedItems.map((item: any, index: number) => { const category = categories.find((entry) => entry.id === item.categoryId); return <tr key={index} className={`transition-colors hover:bg-teal-50/30 ${item.quantity <= (item.minQuantity || 0) ? 'bg-red-50' : ''}`}><td className="flex items-center gap-2 px-4 py-3 font-bold text-gray-800">{item.quantity <= (item.minQuantity || 0) && <AlertTriangle className="h-4 w-4 text-red-500" />}{item.name}</td><td className="px-4 py-3"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{category?.name || 'غير محدد'}</span></td><td className={`px-4 py-3 font-bold ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</td><td className="px-4 py-3 text-gray-500">{item.unit}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{item.warehouseDetails.map((warehouseDetail: string, idx: number) => <span key={idx} className="rounded-md bg-gray-100 px-2 py-1 text-xs">{warehouseDetail}</span>)}</div></td></tr>; }))}</tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'transactions' && (
            <div className="dashboard-shell flex flex-1 flex-col overflow-visible rounded-[28px] p-4 sm:p-6 md:min-h-0 md:overflow-hidden">
              <div className="sticky-toolbar -mx-4 -mt-4 mb-4 px-4 pb-4 pt-4 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pb-5 sm:pt-5">
                <div className="dashboard-panel rounded-3xl p-4 md:p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-lg font-black text-[#004d40]">سجل الحركات المخزنية</h2><p className="mt-1 text-sm text-gray-600">تتبع الصرف والتوريد حسب القسم والمشروع مع بقاء شريط البحث والفلترة ثابتاً أثناء التصفح.</p></div><div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold sm:flex sm:flex-wrap"><div className="rounded-2xl bg-white/75 px-3 py-2 text-gray-600"><span className="block text-[11px] text-gray-500">الحركات</span><span className="mt-1 block text-base text-[#004d40]">{transactionSummary.total.toLocaleString('ar-EG')}</span></div><div className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700"><span className="block text-[11px] text-emerald-600">توريد</span><span className="mt-1 block text-base">{transactionSummary.inbound.toLocaleString('ar-EG')}</span></div><div className="rounded-2xl bg-orange-50 px-3 py-2 text-orange-700"><span className="block text-[11px] text-orange-600">صرف</span><span className="mt-1 block text-base">{transactionSummary.outbound.toLocaleString('ar-EG')}</span></div></div></div>
                    <div className="grid gap-3 md:grid-cols-3"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input placeholder="بحث بالصنف أو المشروع..." className="h-11 rounded-2xl border-white/70 bg-white/85 pr-10 shadow-sm" value={txSearchQuery} onChange={(e) => setTxSearchQuery(e.target.value)} /></div><select className="flex h-11 rounded-2xl border border-white/70 bg-white/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" value={txCategoryFilter} onChange={(e) => setTxCategoryFilter(e.target.value)}><option value="all">جميع الأقسام</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><select className="flex h-11 rounded-2xl border border-white/70 bg-white/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" value={txTypeFilter} onChange={(e) => setTxTypeFilter(e.target.value)}><option value="all">جميع الحركات</option><option value="in">إضافة (توريد)</option><option value="out">صرف (سحب)</option></select></div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:hidden">{filteredTransactions.length === 0 ? <div className="dashboard-panel rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-500">لا توجد حركات مطابقة للبحث الحالي</div> : filteredTransactions.map((tx) => <div key={tx.id} className="dashboard-panel rounded-2xl p-4"><div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-gray-900">{tx.itemName}</h3><p className="mt-1 text-xs text-gray-500">{format(new Date(tx.date), 'PP p', { locale: ar })}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tx.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{tx.type === 'in' ? 'إضافة (توريد)' : 'صرف (سحب)'}</span></div><div className="mb-3 flex flex-wrap gap-2"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">{getTransactionCategoryName(tx)}</span><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{getTransactionWarehouseName(tx)}</span>{tx.projectName && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{tx.projectName}</span>}</div><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"><div className="rounded-2xl bg-white/75 p-3"><span className="block text-xs text-gray-500">الكمية</span><span className={`mt-1 block font-bold ${tx.type === 'in' ? 'text-green-600' : 'text-orange-600'}`} dir="ltr">{tx.type === 'in' ? '+' : '-'}{tx.quantity}</span></div><div className="rounded-2xl bg-white/75 p-3"><span className="block text-xs text-gray-500">بواسطة</span><span className="mt-1 block font-medium text-gray-800">{tx.user || '-'}</span></div><div className="rounded-2xl bg-white/75 p-3"><span className="block text-xs text-gray-500">المخزن</span><span className="mt-1 block font-medium text-gray-800">{getTransactionWarehouseName(tx)}</span></div><div className="rounded-2xl bg-white/75 p-3"><span className="block text-xs text-gray-500">السائق</span><span className="mt-1 block font-medium text-gray-800">{tx.driverName || '-'}</span></div><div className="rounded-2xl bg-white/75 p-3"><span className="block text-xs text-gray-500">رقم السيارة</span><span className="mt-1 block font-medium text-gray-800">{tx.carNumber || '-'}</span></div><div className="rounded-2xl bg-white/75 p-3"><span className="block text-xs text-gray-500">الخفير</span><span className="mt-1 block font-medium text-gray-800">{tx.guardName || '-'}</span></div></div>{tx.notes && <div className="mt-3 border-t border-white/70 pt-3"><span className="mb-1 block text-xs text-gray-500">ملاحظات</span><p className="text-sm text-gray-700">{tx.notes}</p></div>}</div>)}</div>
              <div className="custom-scrollbar hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-white/70 bg-white/80 shadow-sm md:block"><table className="relative w-full whitespace-nowrap text-right text-sm"><thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/90 text-gray-600 backdrop-blur-sm"><tr><th className="px-4 py-3">التاريخ</th><th className="px-4 py-3">الصنف</th><th className="px-4 py-3">القسم</th><th className="px-4 py-3">المخزن</th><th className="px-4 py-3">نوع الحركة</th><th className="px-4 py-3">الكمية</th><th className="px-4 py-3">المشروع/الموقع</th><th className="px-4 py-3">السائق</th><th className="px-4 py-3">رقم السيارة</th><th className="px-4 py-3">الخفير</th><th className="px-4 py-3">بواسطة</th><th className="px-4 py-3">ملاحظات</th></tr></thead><tbody className="divide-y divide-gray-100">{filteredTransactions.length === 0 ? <tr><td colSpan={12} className="px-4 py-8 text-center text-gray-500">لا توجد حركات مطابقة للبحث الحالي</td></tr> : filteredTransactions.map((tx) => <tr key={tx.id} className="transition-colors hover:bg-teal-50/30"><td className="px-4 py-3 text-xs text-gray-500">{format(new Date(tx.date), 'PP p', { locale: ar })}</td><td className="px-4 py-3 font-bold text-gray-800">{tx.itemName}</td><td className="px-4 py-3"><span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">{getTransactionCategoryName(tx)}</span></td><td className="px-4 py-3 text-xs">{getTransactionWarehouseName(tx)}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tx.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{tx.type === 'in' ? 'إضافة (توريد)' : 'صرف (سحب)'}</span></td><td className="px-4 py-3 font-bold" dir="ltr"><span className={tx.type === 'in' ? 'text-green-600' : 'text-orange-600'}>{tx.type === 'in' ? '+' : '-'}{tx.quantity}</span></td><td className="px-4 py-3">{tx.projectName || '-'}</td><td className="px-4 py-3 text-xs">{tx.driverName || '-'}</td><td className="px-4 py-3 text-xs">{tx.carNumber || '-'}</td><td className="px-4 py-3 text-xs">{tx.guardName || '-'}</td><td className="px-4 py-3 text-xs">{tx.user || '-'}</td><td className="max-w-[220px] truncate px-4 py-3 text-xs text-gray-500" title={tx.notes}>{tx.notes || '-'}</td></tr>)}</tbody></table></div>
            </div>
          )}
        </main>
      </div>
      <Modal isOpen={isTransactionModalOpen} onClose={() => { setIsTransactionModalOpen(false); setTransactionError(null); }} title={`حركة مخزنية: ${selectedItemForTx?.name}`}>
        <form onSubmit={handleSaveTransaction} className="space-y-4">
          {transactionError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{transactionError}</div>}
          <div className="mb-4 flex gap-6 rounded-lg border border-gray-200 bg-gray-50 p-3"><label className="flex cursor-pointer items-center gap-2"><input type="radio" name="txType" value="out" className="h-4 w-4 text-blue-600" checked={transactionData.type === 'out'} onChange={() => setTransactionData({ ...transactionData, type: 'out' })} /><span className="font-medium text-orange-700">صرف (سحب)</span></label><label className="flex cursor-pointer items-center gap-2"><input type="radio" name="txType" value="in" className="h-4 w-4 text-blue-600" checked={transactionData.type === 'in'} onChange={() => setTransactionData({ ...transactionData, type: 'in' })} /><span className="font-medium text-green-700">إضافة (توريد)</span></label></div>
          <div className="grid grid-cols-2 gap-4"><div><label className="mb-1 block text-sm font-medium">الكمية</label><Input type="number" min="0.01" step="any" required value={transactionData.quantity || ''} onChange={(e) => setTransactionData({ ...transactionData, quantity: e.target.value })} /></div><div><label className="mb-1 block text-sm font-medium">الكمية الحالية</label><Input disabled value={selectedItemForTx?.quantity || 0} className="bg-gray-100" /></div></div>
          {transactionData.type === 'out' && <div><label className="mb-1 block text-sm font-medium text-orange-700">اسم المشروع / الموقع المنصرف إليه</label><Input placeholder="مثال: مشروع العاصمة الإدارية" required value={transactionData.projectName || ''} onChange={(e) => setTransactionData({ ...transactionData, projectName: e.target.value })} /></div>}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3"><div><label className="mb-1 block text-sm font-medium">السائق (اختياري)</label><select className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" value={transactionData.driverName || ''} onChange={(e) => setTransactionData({ ...transactionData, driverName: e.target.value })}><option value="">اختر السائق...</option>{drivers.map((driver) => <option key={driver.id} value={driver.name}>{driver.name}</option>)}</select></div><div><label className="mb-1 block text-sm font-medium">السيارة (اختياري)</label><select className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" value={transactionData.carNumber || ''} onChange={(e) => setTransactionData({ ...transactionData, carNumber: e.target.value })}><option value="">اختر السيارة...</option>{cars.map((car) => <option key={car.id} value={car.number}>{car.number}</option>)}</select></div><div><label className="mb-1 block text-sm font-medium">الخفير (اختياري)</label><select className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" value={transactionData.guardName || ''} onChange={(e) => setTransactionData({ ...transactionData, guardName: e.target.value })}><option value="">اختر الخفير...</option>{guards.map((guard) => <option key={guard.id} value={guard.name}>{guard.name}</option>)}</select></div></div>
          <div><label className="mb-1 block text-sm font-medium">ملاحظات (اختياري)</label><Input placeholder="أي تفاصيل إضافية..." value={transactionData.notes || ''} onChange={(e) => setTransactionData({ ...transactionData, notes: e.target.value })} /></div>
          <Button type="submit" className="w-full">تأكيد الحركة</Button>
        </form>
      </Modal>
    </div>
  );
}
