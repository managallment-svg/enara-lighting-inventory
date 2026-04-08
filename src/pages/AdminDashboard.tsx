import React, { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { db, logOut } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { LogOut, Plus, Warehouse as WarehouseIcon, Layers, Package, Trash2, Edit, Search, Download, Upload, RefreshCw, ArrowRightLeft, AlertTriangle, AlertCircle, CheckCircle2, Users, Printer, FileText, FileSpreadsheet } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import brandLogoFull from '../assets/brand-logo-full.png';
import { createFullBackupPayload, downloadBackupJson, importBackupToFirestore, parseBackupJson, resetServerData, syncManagedCollections } from '../lib/dataManagement';
import { exportSheetsToExcel, exportSheetsToPdf, printSheets, type ExportSheet } from '../lib/reportExports';

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

const TABLE_PANEL_HEIGHT_STORAGE_KEY = 'enara-admin-table-panel-height';
const MIN_DESKTOP_TABLE_HEIGHT = 420;
const MAX_DESKTOP_TABLE_OFFSET = 180;
const DEFAULT_DESKTOP_TABLE_RATIO = 0.74;

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'warehouses' | 'categories' | 'items' | 'transactions' | 'people'>('items');
  
  // Data states
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [cars, setCars] = useState<any[]>([]);
  const [guards, setGuards] = useState<any[]>([]);
  
  // Modal states
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [isCarModalOpen, setIsCarModalOpen] = useState(false);
  const [isGuardModalOpen, setIsGuardModalOpen] = useState(false);
  const [isDataToolsModalOpen, setIsDataToolsModalOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  // Form states
  const [formData, setFormData] = useState<any>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [transactionData, setTransactionData] = useState<any>({ type: 'out' });
  const [selectedItemForTx, setSelectedItemForTx] = useState<any>(null);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterUnit, setFilterUnit] = useState('all');
  
  // Transaction Filters
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');

  // View Mode
  const [itemViewMode, setItemViewMode] = useState<'detailed' | 'grouped'>('detailed');
  const [syncState, setSyncState] = useState<{
    tone: SyncState;
    message: string;
    timestamp: string | null;
  }>({
    tone: 'idle',
    message: 'البيانات جاهزة ويمكنك تصدير نسخة احتياطية أو مزامنتها يدويًا مع Firebase.',
    timestamp: null,
  });
  const [isBackupProcessing, setIsBackupProcessing] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isResettingServer, setIsResettingServer] = useState(false);
  const [reportAction, setReportAction] = useState<'idle' | 'print' | 'pdf' | 'excel'>('idle');
  const [desktopContentHeight, setDesktopContentHeight] = useState<number | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const desktopResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const clampDesktopTableHeight = (value: number) => {
    if (typeof window === 'undefined') {
      return Math.max(MIN_DESKTOP_TABLE_HEIGHT, value);
    }

    const maxHeight = Math.max(MIN_DESKTOP_TABLE_HEIGHT, window.innerHeight - MAX_DESKTOP_TABLE_OFFSET);
    return Math.max(MIN_DESKTOP_TABLE_HEIGHT, Math.min(Math.round(value), maxHeight));
  };

  useEffect(() => {
    const unsubWarehouses = onSnapshot(collection(db, 'warehouses'), (snapshot) => {
      setWarehouses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCategories = onSnapshot(collection(db, 'categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubTransactions = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc')), (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snapshot) => {
      setDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubCars = onSnapshot(collection(db, 'cars'), (snapshot) => {
      setCars(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGuards = onSnapshot(collection(db, 'guards'), (snapshot) => {
      setGuards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubWarehouses();
      unsubCategories();
      unsubItems();
      unsubTransactions();
      unsubDrivers();
      unsubCars();
      unsubGuards();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedHeight = window.localStorage.getItem(TABLE_PANEL_HEIGHT_STORAGE_KEY);
    const preferredHeight = Number(storedHeight || Math.round(window.innerHeight * DEFAULT_DESKTOP_TABLE_RATIO));
    setDesktopContentHeight(clampDesktopTableHeight(preferredHeight));

    const handleResize = () => {
      setDesktopContentHeight((current) => clampDesktopTableHeight(
        current ?? Math.round(window.innerHeight * DEFAULT_DESKTOP_TABLE_RATIO),
      ));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || desktopContentHeight == null) return;
    window.localStorage.setItem(TABLE_PANEL_HEIGHT_STORAGE_KEY, String(desktopContentHeight));
  }, [desktopContentHeight]);

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

  const runSyncedMutation = async (
    action: () => Promise<void>,
    successMessage: string,
    syncingMessage = 'جاري مزامنة التعديل مع Firebase...',
  ) => {
    setSyncState((current) => ({
      tone: 'syncing',
      message: syncingMessage,
      timestamp: current.timestamp,
    }));

    try {
      await action();
      markSyncSuccess(successMessage);
      return true;
    } catch (error) {
      markSyncFailure(error, 'تعذر حفظ التعديل على Firebase.');
      return false;
    }
  };

  const handleExportBackup = async () => {
    setIsBackupProcessing(true);
    setSyncState((current) => ({
      tone: 'syncing',
      message: 'جاري تجهيز ملف النسخة الاحتياطية JSON...',
      timestamp: current.timestamp,
    }));

    try {
      const payload = await createFullBackupPayload(db, profile?.name || 'مدير النظام');
      const exportResult = await downloadBackupJson(payload);
      const successMessage =
        exportResult.method === 'browser-download'
          ? 'تم تصدير جميع البيانات والإعدادات إلى ملف JSON محلي بنجاح.'
          : exportResult.shareSheetOpened
            ? `تم إنشاء الملف ${exportResult.fileName} وفتح نافذة الحفظ أو المشاركة. اختر "حفظ في الملفات" للاحتفاظ بالنسخة خارج التطبيق.`
            : `تم إنشاء الملف ${exportResult.fileName} داخل مستندات التطبيق. إذا لم يظهر في مدير الملفات، أعد التصدير واختر الحفظ من نافذة المشاركة.`;
      markSyncSuccess(successMessage);
    } catch (error) {
      markSyncFailure(error, 'تعذر تصدير النسخة الاحتياطية.');
    } finally {
      setIsBackupProcessing(false);
    }
  };

  const handleImportBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const payload = parseBackupJson(await file.text());
      const collectionsLabel = payload.includedCollections.map((entry) => entry).join('، ');

      setConfirmDialog({
        isOpen: true,
        title: 'استيراد نسخة احتياطية',
        message: `سيتم استبدال البيانات الحالية بالمحتوى الموجود في الملف للمجموعات التالية: ${collectionsLabel}. هل تريد المتابعة؟`,
        onConfirm: async () => {
          setConfirmDialog((previous) => ({ ...previous, isOpen: false }));
          setIsBackupProcessing(true);
          setSyncState((current) => ({
            tone: 'syncing',
            message: 'جاري استيراد ملف JSON ومزامنته مع Firebase...',
            timestamp: current.timestamp,
          }));

          try {
            const result = await importBackupToFirestore(db, payload, {
              preserveUserIds: profile?.uid ? [profile.uid] : [],
            });
            markSyncSuccess(`تم استيراد النسخة الاحتياطية ومزامنة ${result.setCount.toLocaleString('ar-EG')} سجل مع Firebase.`);
          } catch (error) {
            markSyncFailure(error, 'تعذر استيراد النسخة الاحتياطية.');
          } finally {
            setIsBackupProcessing(false);
          }
        }
      });
    } catch (error) {
      markSyncFailure(error, 'تعذر قراءة ملف النسخة الاحتياطية.');
    }
  };

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    setSyncState((current) => ({
      tone: 'syncing',
      message: 'جاري رفع النسخة الحالية من البيانات إلى Firebase...',
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
      markSyncSuccess(`اكتملت مزامنة البيانات الحالية مع Firebase. تم تحديث ${result.setCount.toLocaleString('ar-EG')} سجل.`);
    } catch (error) {
      markSyncFailure(error, 'تعذرت مزامنة البيانات الحالية.');
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleDeleteTransaction = async (tx: any) => {
    setConfirmDialog({
      isOpen: true,
      title: 'حذف حركة مخزنية',
      message: `سيتم حذف الحركة الخاصة بالصنف "${tx.itemName}" مع إلغاء أثرها من السجل${tx.itemId ? ' وتحديث رصيد الصنف المرتبط بها' : ''}. هل تريد المتابعة؟`,
      onConfirm: async () => {
        setConfirmDialog((previous) => ({ ...previous, isOpen: false }));

        const linkedItem = items.find((item) => item.id === tx.itemId);
        const quantity = Number(tx.quantity || 0);

        if (!linkedItem || !Number.isFinite(quantity) || quantity <= 0) {
          await runSyncedMutation(async () => {
            await deleteDoc(doc(db, 'transactions', tx.id));
          }, 'تم حذف الحركة من السجل. لم يتم تعديل الرصيد لأن الصنف المرتبط بها غير متاح حالياً.');
          return;
        }

        const revertedQuantity = tx.type === 'in'
          ? linkedItem.quantity - quantity
          : linkedItem.quantity + quantity;

        if (revertedQuantity < 0) {
          markSyncFailure(
            new Error('لا يمكن حذف حركة التوريد لأن الرصيد الحالي أقل من كمية هذه الحركة.'),
            'تعذر حذف الحركة المخزنية.',
          );
          return;
        }

        const batch = writeBatch(db);
        batch.delete(doc(db, 'transactions', tx.id));
        batch.update(doc(db, 'items', linkedItem.id), {
          quantity: revertedQuantity,
          lastUpdated: new Date().toISOString(),
          updatedBy: profile?.name || 'Admin',
        });

        await runSyncedMutation(async () => {
          await batch.commit();
        }, 'تم حذف الحركة وتحديث رصيد الصنف المرتبط بها على Firebase.');
      }
    });
  };

  const handleResetServerData = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'تصفير جميع بيانات السيرفر',
      message: 'سيتم حذف جميع المخازن والأقسام والأصناف والحركات والسائقين والسيارات والغفراء والمستخدمين والإعدادات من Firebase، مع الاحتفاظ بحساب المدير الحالي فقط حتى لا تفقد صلاحية الدخول. هل تريد المتابعة؟',
      onConfirm: async () => {
        setConfirmDialog((previous) => ({ ...previous, isOpen: false }));
        setIsResettingServer(true);
        setSyncState((current) => ({
          tone: 'syncing',
          message: 'جاري حذف جميع بيانات التطبيق من Firebase وإعادة التهيئة...',
          timestamp: current.timestamp,
        }));

        try {
          const result = await resetServerData(db, {
            preserveUserIds: profile?.uid ? [profile.uid] : [],
          });

          setSearchQuery('');
          setFilterWarehouse('all');
          setFilterCategory('all');
          setFilterUnit('all');
          setTxSearchQuery('');
          setTxTypeFilter('all');
          setTxCategoryFilter('all');
          setItemViewMode('detailed');
          setActiveTab('items');
          setFormData({});
          setEditingId(null);
          setTransactionData({ type: 'out' });
          setSelectedItemForTx(null);
          setTransactionError(null);
          setIsWarehouseModalOpen(false);
          setIsCategoryModalOpen(false);
          setIsItemModalOpen(false);
          setIsTransactionModalOpen(false);
          setIsDriverModalOpen(false);
          setIsCarModalOpen(false);
          setIsGuardModalOpen(false);

          markSyncSuccess(`تم حذف ${result.deleteCount.toLocaleString('ar-EG')} سجل من السيرفر، وعادت بيانات التطبيق إلى حالة البداية مع الاحتفاظ بحساب المدير الحالي.`);
        } catch (error) {
          markSyncFailure(error, 'تعذر حذف جميع البيانات من السيرفر.');
        } finally {
          setIsResettingServer(false);
        }
      }
    });
  };

  const isManagementBusy = isBackupProcessing || isManualSyncing || isResettingServer;
  const isToolsBusy = isManagementBusy || reportAction !== 'idle';

  const handleTablePanelResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return;

    event.preventDefault();
    const startHeight = desktopContentHeight ?? clampDesktopTableHeight(window.innerHeight * DEFAULT_DESKTOP_TABLE_RATIO);
    const startY = event.clientY;

    desktopResizeStateRef.current = { startY, startHeight };

    const handlePointerMove = (moveEvent: MouseEvent) => {
      const nextHeight = startHeight + (startY - moveEvent.clientY);
      setDesktopContentHeight(clampDesktopTableHeight(nextHeight));
    };

    const handlePointerUp = () => {
      desktopResizeStateRef.current = null;
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
  };

  const statsCards = [
    { label: 'إجمالي المخازن', value: warehouses.length, icon: WarehouseIcon },
    { label: 'التصنيفات', value: categories.length, icon: Layers },
    { label: 'إجمالي الأصناف', value: items.length, icon: Package },
  ];

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || Date.now().toString();
    const saved = await runSyncedMutation(async () => {
      await setDoc(doc(db, 'warehouses', id), {
        id,
        name: (formData.name || '').trim(),
        location: (formData.location || '').trim(),
        locationUrl: (formData.locationUrl || '').trim(),
        createdAt: formData.createdAt || new Date().toISOString()
      });
    }, 'تم حفظ المخزن ومزامنته مع Firebase.');
    if (!saved) return;
    setIsWarehouseModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || Date.now().toString();
    const saved = await runSyncedMutation(async () => {
      await setDoc(doc(db, 'categories', id), {
        id,
        name: formData.name,
        description: formData.description || ''
      });
    }, 'تم حفظ القسم ومزامنته مع Firebase.');
    if (!saved) return;
    setIsCategoryModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || Date.now().toString();
    const saved = await runSyncedMutation(async () => {
      await setDoc(doc(db, 'drivers', id), {
        id,
        name: (formData.name || '').trim()
      });
    }, 'تم حفظ السائق ومزامنته مع Firebase.');
    if (!saved) return;
    setIsDriverModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleSaveCar = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || Date.now().toString();
    const saved = await runSyncedMutation(async () => {
      await setDoc(doc(db, 'cars', id), {
        id,
        number: (formData.number || '').trim()
      });
    }, 'تم حفظ السيارة ومزامنتها مع Firebase.');
    if (!saved) return;
    setIsCarModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleSaveGuard = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || Date.now().toString();
    const saved = await runSyncedMutation(async () => {
      await setDoc(doc(db, 'guards', id), {
        id,
        name: (formData.name || '').trim()
      });
    }, 'تم حفظ الخفير ومزامنته مع Firebase.');
    if (!saved) return;
    setIsGuardModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = editingId || Date.now().toString();
    const saved = await runSyncedMutation(async () => {
      await setDoc(doc(db, 'items', id), {
        id,
        warehouseId: formData.warehouseId,
        categoryId: formData.categoryId,
        name: formData.name,
        quantity: Number(formData.quantity),
        minQuantity: Number(formData.minQuantity || 0),
        unit: formData.unit,
        lastUpdated: new Date().toISOString(),
        updatedBy: profile?.name || 'Admin'
      });
    }, 'تم حفظ الصنف ومزامنته مع Firebase.');
    if (!saved) return;
    setIsItemModalOpen(false);
    setFormData({});
    setEditingId(null);
  };

  const handleDelete = async (collectionName: string, id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'تأكيد الحذف',
      message: 'هل أنت متأكد من أنك تريد حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        await runSyncedMutation(async () => {
          await deleteDoc(doc(db, collectionName, id));
        }, 'تم حذف العنصر ومزامنة التعديل مع Firebase.');
      }
    });
  };

  const handleDeleteAllCategories = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'حذف جميع التصنيفات',
      message: 'هل أنت متأكد من أنك تريد حذف جميع التصنيفات؟ لا يمكن التراجع عن هذا الإجراء.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        await runSyncedMutation(async () => {
          for (const cat of categories) {
            await deleteDoc(doc(db, 'categories', cat.id));
          }
        }, 'تم حذف جميع الأقسام ومزامنة التعديل مع Firebase.');
      }
    });
  };

  const handleSeedCategories = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'تحميل التصنيفات',
      message: 'هل تريد إضافة التصنيفات الشائعة لمجال المقاولات الكهربائية؟',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        const defaultCategories = [
          { name: 'كابلات جهد متوسط', description: 'كابلات وموصلات الجهد المتوسط' },
          { name: 'كابلات جهد منخفض', description: 'كابلات وموصلات الجهد المنخفض' },
          { name: 'كابلات تحكم واتصالات', description: 'كابلات الكنترول، الداتا، والاتصالات' },
          { name: 'لوحات كهربائية', description: 'لوحات التوزيع، مفاتيح الفصل، والقواطع' },
          { name: 'محولات كهربائية', description: 'محولات الجهد والتيار' },
          { name: 'أنظمة إنارة', description: 'كشافات، لمبات، وأنظمة الإنارة الداخلية والخارجية' },
          { name: 'حوامل كابلات ومواسير', description: 'Cable Trays, Trunking, Conduits' },
          { name: 'مخارج ومفاتيح', description: 'برايز، مفاتيح إنارة، وعلب ماجيك' },
          { name: 'أنظمة تأريض', description: 'حراب تأريض، كابلات نحاس عاري، ومانعات صواعق' },
          { name: 'أنظمة إنذار حريق', description: 'حساسات، لوحات إنذار، وكواشف' },
          { name: 'أنظمة تيار خفيف', description: 'كاميرات مراقبة، أنظمة صوتيات، شبكات' },
          { name: 'عدد وأدوات', description: 'عدد يدوية، أجهزة قياس، ومعدات تركيب' },
          { name: 'مهمات أمن وسلامة', description: 'خوذ، قفازات، وأحذية سلامة' },
          { name: 'اكسسوارات وقطع غيار', description: 'ترامل، رووزتات، شريط لحام، ومسامير' },
          { name: 'مواسير وقطع اتصال', description: 'مواسير بلاستيك، حديد، ولوازمها' },
          { name: 'مولدات كهربائية', description: 'مولدات ديزل، بنزين، وقطع غيارها' },
          { name: 'أنظمة طاقة شمسية', description: 'ألواح شمسية، إنفرتر، وبطاريات' },
          { name: 'أنظمة تحكم ذكي', description: 'أنظمة السمارت هوم و KNX' },
          { name: 'كابلات ألياف ضوئية', description: 'Fiber Optic Cables وملحقاتها' },
          { name: 'لوحات تحكم ومحركات', description: 'Motor Control Centers - MCC' },
          { name: 'بطاريات وشواحن', description: 'بطاريات صناعية وشواحن' }
        ];

        await runSyncedMutation(async () => {
          for (const cat of defaultCategories) {
            const id = Date.now().toString() + Math.random().toString(36).substring(7);
            await setDoc(doc(db, 'categories', id), {
              id,
              name: cat.name,
              description: cat.description
            });
          }
        }, 'تم تحميل الأقسام الافتراضية ومزامنتها مع Firebase.');
      }
    });
  };

  const [transactionError, setTransactionError] = useState<string | null>(null);

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransactionError(null);
    if (!selectedItemForTx) return;

    const qty = Number(transactionData.quantity);
    if (qty <= 0) {
      setTransactionError('الكمية يجب أن تكون أكبر من صفر');
      return;
    }

    const newQty = transactionData.type === 'in' 
      ? selectedItemForTx.quantity + qty 
      : selectedItemForTx.quantity - qty;

    if (newQty < 0) {
      setTransactionError('الكمية المتاحة غير كافية لهذه الحركة!');
      return;
    }

    const batch = writeBatch(db);
    const txId = Date.now().toString();
    const txRef = doc(db, 'transactions', txId);
    const itemRef = doc(db, 'items', selectedItemForTx.id);
    const warehouseName = warehouses.find(w => w.id === selectedItemForTx.warehouseId)?.name || '';

    batch.set(txRef, {
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

    batch.update(itemRef, {
      quantity: newQty,
      lastUpdated: new Date().toISOString(),
      updatedBy: profile?.name || 'Unknown'
    });

    const saved = await runSyncedMutation(async () => {
      await batch.commit();
    }, 'تم تسجيل الحركة المخزنية ومزامنتها مع Firebase.');
    if (!saved) return;
    setIsTransactionModalOpen(false);
    setTransactionData({ type: 'out' });
    setSelectedItemForTx(null);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesWarehouse = filterWarehouse === 'all' || item.warehouseId === filterWarehouse;
    const matchesCategory = filterCategory === 'all' || item.categoryId === filterCategory;
    const matchesUnit = filterUnit === 'all' || item.unit === filterUnit;
    return matchesSearch && matchesWarehouse && matchesCategory && matchesUnit;
  }).sort((a, b) => {
    const catA = categories.find(c => c.id === a.categoryId)?.name || '';
    const catB = categories.find(c => c.id === b.categoryId)?.name || '';
    if (catA !== catB) return catA.localeCompare(catB, 'ar');
    return a.name.localeCompare(b.name, 'ar');
  });

  const groupedItems = Object.values(filteredItems.reduce((acc: any, item) => {
    const key = `${item.categoryId}-${item.name}-${item.unit}`;
    if (!acc[key]) {
      acc[key] = { 
        ...item, 
        quantity: 0, 
        warehouseDetails: [] 
      };
    }
    acc[key].quantity += item.quantity;
    const whName = warehouses.find(w => w.id === item.warehouseId)?.name || 'غير محدد';
    acc[key].warehouseDetails.push(`${whName} (${item.quantity})`);
    return acc;
  }, {}));

  const categoryNameById: Record<string, string> = {};
  categories.forEach((category) => {
    categoryNameById[category.id] = category.name;
  });

  const warehouseNameById: Record<string, string> = {};
  warehouses.forEach((warehouse) => {
    warehouseNameById[warehouse.id] = warehouse.name;
  });

  const itemCategoryIdByItemId: Record<string, string | undefined> = {};
  items.forEach((item) => {
    itemCategoryIdByItemId[item.id] = item.categoryId;
  });

  const itemWarehouseIdByItemId: Record<string, string | undefined> = {};
  items.forEach((item) => {
    itemWarehouseIdByItemId[item.id] = item.warehouseId;
  });

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

  const getWarehouseLocationHref = (warehouse: any) => {
    const locationUrl = (warehouse.locationUrl || '').trim();
    if (locationUrl) {
      return /^(https?:\/\/|geo:)/i.test(locationUrl)
        ? locationUrl
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationUrl)}`;
    }
    const location = (warehouse.location || '').trim();
    return location
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
      : '';
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = tx.itemName.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
                          (tx.projectName && tx.projectName.toLowerCase().includes(txSearchQuery.toLowerCase()));
    const matchesType = txTypeFilter === 'all' || tx.type === txTypeFilter;
    const matchesCategory = txCategoryFilter === 'all' || getTransactionCategoryId(tx) === txCategoryFilter;
    return matchesSearch && matchesType && matchesCategory;
  });

  const transactionSummary = filteredTransactions.reduce((summary, tx) => {
    summary.total += 1;
    if (tx.type === 'in') {
      summary.inbound += Number(tx.quantity || 0);
    } else {
      summary.outbound += Number(tx.quantity || 0);
    }
    return summary;
  }, { total: 0, inbound: 0, outbound: 0 });

  const uniqueUnits = Array.from(new Set(items.map(item => item.unit))).filter(Boolean);
  const currentReportConfig = (() => {
    if (activeTab === 'warehouses') {
      return {
        title: 'تقرير المخازن',
        filePrefix: 'enara-warehouses-report',
        sheets: [
          {
            name: 'المخازن',
            columns: [
              { key: 'name', label: 'اسم المخزن' },
              { key: 'location', label: 'الموقع' },
              { key: 'locationUrl', label: 'رابط اللوكيشن' },
              { key: 'createdAt', label: 'تاريخ الإنشاء' },
            ],
            rows: warehouses.map((warehouse) => ({
              name: warehouse.name || '-',
              location: warehouse.location || '-',
              locationUrl: getWarehouseLocationHref(warehouse) || '-',
              createdAt: warehouse.createdAt ? format(new Date(warehouse.createdAt), 'PP p', { locale: ar }) : '-',
            })),
          },
        ] as ExportSheet[],
      };
    }

    if (activeTab === 'categories') {
      return {
        title: 'تقرير الأقسام',
        filePrefix: 'enara-categories-report',
        sheets: [
          {
            name: 'الأقسام',
            columns: [
              { key: 'name', label: 'اسم القسم' },
              { key: 'description', label: 'الوصف' },
            ],
            rows: categories.map((category) => ({
              name: category.name || '-',
              description: category.description || '-',
            })),
          },
        ] as ExportSheet[],
      };
    }

    if (activeTab === 'items') {
      return {
        title: itemViewMode === 'detailed' ? 'تقرير الأصناف والمخزون' : 'تقرير الأصناف المجمعة',
        filePrefix: itemViewMode === 'detailed' ? 'enara-items-report' : 'enara-items-grouped-report',
        sheets: (
          itemViewMode === 'detailed'
            ? [
                {
                  name: 'الأصناف',
                  columns: [
                    { key: 'name', label: 'الصنف' },
                    { key: 'category', label: 'القسم' },
                    { key: 'warehouse', label: 'المخزن' },
                    { key: 'quantity', label: 'الكمية' },
                    { key: 'unit', label: 'الوحدة' },
                    { key: 'minQuantity', label: 'حد الطلب' },
                    { key: 'updatedBy', label: 'بواسطة' },
                    { key: 'lastUpdated', label: 'آخر تحديث' },
                  ],
                  rows: filteredItems.map((item) => ({
                    name: item.name || '-',
                    category: categoryNameById[item.categoryId] || 'غير محدد',
                    warehouse: warehouseNameById[item.warehouseId] || 'غير محدد',
                    quantity: item.quantity ?? 0,
                    unit: item.unit || '-',
                    minQuantity: item.minQuantity ?? 0,
                    updatedBy: item.updatedBy || '-',
                    lastUpdated: item.lastUpdated ? format(new Date(item.lastUpdated), 'PP p', { locale: ar }) : '-',
                  })),
                },
              ]
            : [
                {
                  name: 'الأصناف المجمعة',
                  columns: [
                    { key: 'name', label: 'الصنف' },
                    { key: 'category', label: 'القسم' },
                    { key: 'quantity', label: 'إجمالي الكمية' },
                    { key: 'unit', label: 'الوحدة' },
                    { key: 'minQuantity', label: 'حد الطلب' },
                    { key: 'warehouses', label: 'التوزيع على المخازن' },
                  ],
                  rows: groupedItems.map((item: any) => ({
                    name: item.name || '-',
                    category: categoryNameById[item.categoryId] || 'غير محدد',
                    quantity: item.quantity ?? 0,
                    unit: item.unit || '-',
                    minQuantity: item.minQuantity ?? 0,
                    warehouses: Array.isArray(item.warehouseDetails) ? item.warehouseDetails.join(' | ') : '-',
                  })),
                },
              ]
        ) as ExportSheet[],
      };
    }

    if (activeTab === 'transactions') {
      return {
        title: 'تقرير سجل الحركات',
        filePrefix: 'enara-transactions-report',
        sheets: [
          {
            name: 'الحركات',
            columns: [
              { key: 'date', label: 'التاريخ' },
              { key: 'itemName', label: 'الصنف' },
              { key: 'category', label: 'القسم' },
              { key: 'warehouse', label: 'المخزن' },
              { key: 'type', label: 'نوع الحركة' },
              { key: 'quantity', label: 'الكمية' },
              { key: 'projectName', label: 'المشروع/الموقع' },
              { key: 'driverName', label: 'السائق' },
              { key: 'carNumber', label: 'رقم السيارة' },
              { key: 'guardName', label: 'الخفير' },
              { key: 'user', label: 'بواسطة' },
              { key: 'notes', label: 'ملاحظات' },
            ],
            rows: filteredTransactions.map((tx) => ({
              date: tx.date ? format(new Date(tx.date), 'PP p', { locale: ar }) : '-',
              itemName: tx.itemName || '-',
              category: getTransactionCategoryName(tx),
              warehouse: getTransactionWarehouseName(tx),
              type: tx.type === 'in' ? 'إضافة (توريد)' : 'صرف (سحب)',
              quantity: `${tx.type === 'in' ? '+' : '-'}${tx.quantity ?? 0}`,
              projectName: tx.projectName || '-',
              driverName: tx.driverName || '-',
              carNumber: tx.carNumber || '-',
              guardName: tx.guardName || '-',
              user: tx.user || '-',
              notes: tx.notes || '-',
            })),
          },
        ] as ExportSheet[],
      };
    }

    return {
      title: 'تقرير الأفراد والمركبات',
      filePrefix: 'enara-people-report',
      sheets: [
        {
          name: 'السائقين',
          columns: [{ key: 'name', label: 'اسم السائق' }],
          rows: drivers.map((driver) => ({ name: driver.name || '-' })),
        },
        {
          name: 'السيارات',
          columns: [{ key: 'number', label: 'رقم السيارة' }],
          rows: cars.map((car) => ({ number: car.number || '-' })),
        },
        {
          name: 'الغفراء',
          columns: [{ key: 'name', label: 'اسم الخفير' }],
          rows: guards.map((guard) => ({ name: guard.name || '-' })),
        },
      ] as ExportSheet[],
    };
  })();

  const runReportAction = async (
    action: 'print' | 'pdf' | 'excel',
    runner: () => Promise<void> | void,
    successMessage: string,
  ) => {
    setReportAction(action);

    try {
      await runner();
      markSyncSuccess(successMessage);
    } catch (error) {
      markSyncFailure(error, 'تعذر تنفيذ عملية التصدير أو الطباعة.');
    } finally {
      setReportAction('idle');
    }
  };

  const handlePrintCurrentView = () =>
    runReportAction(
      'print',
      () => printSheets(currentReportConfig.title, currentReportConfig.sheets),
      'تم فتح نافذة الطباعة للعرض الحالي.',
    );

  const handleExportCurrentViewPdf = () =>
    runReportAction(
      'pdf',
      () => exportSheetsToPdf(currentReportConfig.filePrefix, currentReportConfig.title, currentReportConfig.sheets),
      'تم تصدير العرض الحالي إلى ملف PDF بنجاح.',
    );

  const handleExportCurrentViewExcel = () =>
    runReportAction(
      'excel',
      () => exportSheetsToExcel(currentReportConfig.filePrefix, currentReportConfig.sheets),
      'تم تصدير العرض الحالي إلى ملف Excel بنجاح.',
    );

  const openEditModal = (type: string, item: any) => {
    setFormData(item);
    setEditingId(item.id);
    if (type === 'warehouse') setIsWarehouseModalOpen(true);
    if (type === 'category') setIsCategoryModalOpen(true);
    if (type === 'item') setIsItemModalOpen(true);
  };

  return (
    <div className="app-shell flex h-[100dvh] overflow-hidden text-right font-sans" dir="rtl">
      {/* Sidebar / Bottom Nav */}
      <aside className="fixed bottom-0 z-50 flex w-full rounded-t-[2rem] bg-[linear-gradient(180deg,#003a34_0%,#004d40_48%,#016b5b_100%)] text-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] md:inset-y-0 md:right-0 md:w-64 md:rounded-none md:flex-col md:shadow-2xl">
        <div className="hidden md:flex p-6 flex-col items-center justify-center border-b border-white/10">
          <div className="mb-4 rounded-[28px] bg-white/95 p-3 shadow-xl shadow-black/10">
            <img src={brandLogoFull} alt="شعار إنارة ستوك" className="h-auto w-40 max-w-full" />
          </div>
          <h2 className="text-xl font-black tracking-wider text-center">إدارة مخازن إنارة</h2>
        </div>
        
        <div className="hidden md:flex mx-4 mt-6 p-4 bg-black/20 rounded-2xl items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-[#00bfa5] flex items-center justify-center font-bold text-lg shrink-0">
            {profile?.name?.charAt(0) || 'م'}
          </div>
          <div className="overflow-hidden">
            <p className="font-bold text-sm truncate">{profile?.name}</p>
            <p className="text-xs text-[#00bfa5]">المدير العام</p>
          </div>
        </div>

        <nav className="flex-1 flex md:flex-col px-2 py-2 md:px-4 md:py-6 gap-1 md:space-y-2 overflow-x-auto md:overflow-y-auto no-scrollbar justify-around md:justify-start">
          <button onClick={() => setActiveTab('items')} className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all duration-200 min-w-[70px] md:min-w-0 ${activeTab === 'items' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <Package className="h-5 w-5 md:h-5 md:w-5" />
            <span className="font-bold text-[10px] md:text-sm">المنتجات</span>
          </button>
          <button onClick={() => setActiveTab('categories')} className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all duration-200 min-w-[70px] md:min-w-0 ${activeTab === 'categories' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <Layers className="h-5 w-5 md:h-5 md:w-5" />
            <span className="font-bold text-[10px] md:text-sm">التصنيفات</span>
          </button>
          <button onClick={() => setActiveTab('warehouses')} className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all duration-200 min-w-[70px] md:min-w-0 ${activeTab === 'warehouses' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <WarehouseIcon className="h-5 w-5 md:h-5 md:w-5" />
            <span className="font-bold text-[10px] md:text-sm">المخازن</span>
          </button>
          <button onClick={() => setActiveTab('transactions')} className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all duration-200 min-w-[70px] md:min-w-0 ${activeTab === 'transactions' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <ArrowRightLeft className="h-5 w-5 md:h-5 md:w-5" />
            <span className="font-bold text-[10px] md:text-sm">سجل الحركات</span>
          </button>
          <button onClick={() => setActiveTab('people')} className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-3 py-2 md:px-4 md:py-3 rounded-xl transition-all duration-200 min-w-[70px] md:min-w-0 ${activeTab === 'people' ? 'bg-[#00bfa5] text-white shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            <Users className="h-5 w-5 md:h-5 md:w-5" />
            <span className="font-bold text-[10px] md:text-sm">الأفراد والمركبات</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="mb-20 flex min-h-0 flex-1 flex-col overflow-hidden md:mb-0 md:mr-64">
        {/* Top Header */}
        <header className="dashboard-shell sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-white/60 px-4 py-3 md:px-6">
          <h1 className="text-2xl font-black text-[#004d40]">
            {activeTab === 'items' && 'إدارة المنتجات'}
            {activeTab === 'categories' && 'إدارة التصنيفات'}
            {activeTab === 'warehouses' && 'إدارة المخازن'}
            {activeTab === 'transactions' && 'سجل الحركات'}
            {activeTab === 'people' && 'إدارة الأفراد والمركبات'}
          </h1>
          <div className="flex items-center gap-4">
            <Button onClick={logOut} variant="ghost" className="text-red-500 hover:bg-red-50 rounded-xl">
              <LogOut className="h-5 w-5 ml-2" /> تسجيل الخروج
            </Button>
          </div>
        </header>

        <main className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-28 pt-3 md:px-6 md:pb-6 md:pt-4">
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportBackupFile}
          />

          <div className="mb-2 grid gap-2 lg:grid-cols-[minmax(0,1fr)_210px]">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {statsCards.map((stat) => (
                <div
                  key={stat.label}
                  className="dashboard-panel group relative flex min-h-[58px] flex-col justify-between overflow-hidden rounded-[18px] px-2.5 py-2 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[64px] sm:flex-row sm:items-center sm:rounded-[20px] sm:px-3"
                >
                  <div className="absolute top-0 right-0 w-1.5 h-full bg-[#00bfa5]"></div>
                  <div className="min-w-0 pr-1 sm:pr-2">
                    <h3 className="text-[9px] font-bold leading-3 text-gray-500 sm:text-[11px]">{stat.label}</h3>
                    <p className="mt-0.5 text-base font-black text-[#004d40] sm:text-[1.6rem]">{stat.value}</p>
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[#00bfa5] transition-transform duration-300 group-hover:scale-105 sm:h-9 sm:w-9 sm:rounded-2xl">
                    <stat.icon className="h-3.5 w-3.5 sm:h-[18px] sm:w-[18px]" />
                  </div>
                </div>
              ))}
            </div>

            <div className="dashboard-panel flex min-h-[58px] flex-col justify-between gap-1.5 rounded-[18px] px-2.5 py-2 sm:min-h-[64px] sm:px-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-[#004d40] sm:text-xs">النسخ والمزامنة</p>
                  <p className="mt-0.5 text-[9px] leading-3 text-gray-500 sm:text-[10px]">
                    أدوات سريعة لنافذة مستقلة.
                  </p>
                </div>
                <div
                  className={`mt-0.5 shrink-0 rounded-full p-1 ${
                    syncState.tone === 'success'
                      ? 'bg-emerald-50 text-emerald-600'
                      : syncState.tone === 'error'
                        ? 'bg-red-50 text-red-600'
                        : syncState.tone === 'syncing'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {syncState.tone === 'success' && <CheckCircle2 className="h-4 w-4" />}
                  {syncState.tone === 'error' && <AlertCircle className="h-4 w-4" />}
                  {syncState.tone === 'syncing' && <RefreshCw className="h-4 w-4 animate-spin" />}
                  {syncState.tone === 'idle' && <Download className="h-4 w-4" />}
                </div>
              </div>
              <Button
                onClick={() => setIsDataToolsModalOpen(true)}
                className="h-8 rounded-xl bg-[#00bfa5] px-2.5 text-[10px] text-white hover:bg-[#00a68f] sm:text-xs"
              >
                <Download className="ml-1.5 h-3.5 w-3.5" />
                فتح الأدوات
              </Button>
            </div>
          </div>

          <div className="dashboard-panel mb-2 flex flex-col gap-1 rounded-[16px] px-2.5 py-1.5 sm:px-3">
            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <span
                  className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold sm:text-[10px] ${
                    syncState.tone === 'success'
                      ? 'bg-emerald-50 text-emerald-700'
                      : syncState.tone === 'error'
                        ? 'bg-red-50 text-red-700'
                        : syncState.tone === 'syncing'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {syncState.tone === 'success' && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                  {syncState.tone === 'error' && <AlertCircle className="h-3 w-3 shrink-0" />}
                  {syncState.tone === 'syncing' && <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />}
                  {syncState.tone === 'idle' && <Download className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{syncState.message}</span>
                </span>
              </div>
              {syncState.timestamp && (
                <span className="text-[9px] font-medium text-gray-500 sm:text-[10px]">
                  آخر مزامنة: {format(new Date(syncState.timestamp), 'PP p', { locale: ar })}
                </span>
              )}
            </div>
            <p className="text-[9px] leading-3 text-gray-500 sm:text-[10px]">
              أدوات النسخ والمزامنة متاحة من الزر أعلاه.
            </p>
          </div>

          <div className="mb-2 hidden justify-center md:flex">
            <div
              onMouseDown={handleTablePanelResizeStart}
              className="flex cursor-row-resize select-none items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[10px] font-bold text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-white"
            >
              <span className="inline-block h-1.5 w-8 rounded-full bg-gray-300"></span>
              اسحب لتكبير أو تصغير مساحة الجداول
            </div>
          </div>

          {/* Content */}
          <div
            className="dashboard-shell flex flex-1 flex-col overflow-visible rounded-[24px] p-3 md:flex-none md:overflow-hidden md:p-4"
            style={desktopContentHeight != null ? { height: `${desktopContentHeight}px` } : undefined}
          >
          {activeTab === 'warehouses' && (
            <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
              <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center flex-shrink-0">
                <h2 className="text-lg font-semibold">المخازن</h2>
                <Button onClick={() => { setFormData({}); setEditingId(null); setIsWarehouseModalOpen(true); }}>
                  <Plus className="ml-2 h-4 w-4" /> إضافة مخزن
                </Button>
              </div>
              
              {/* Mobile View */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {warehouses.map(w => (
                  <div key={w.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-gray-900">{w.name}</h3>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal('warehouse', w)}>
                          <Edit className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete('warehouses', w.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium text-gray-500">الموقع:</span> {w.location}</p>
                      <p><span className="font-medium text-gray-500">تاريخ الإنشاء:</span> {format(new Date(w.createdAt), 'PP', { locale: ar })}</p>
                    </div>
                    {getWarehouseLocationHref(w) && (
                      <div className="mt-3">
                        <a
                          href={getWarehouseLocationHref(w)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-100"
                        >
                          فتح اللوكيشن
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Desktop View */}
              <div className="custom-scrollbar hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-white/70 bg-white/80 shadow-sm md:block">
                <table className="w-full text-right text-sm whitespace-nowrap relative">
                  <thead className="bg-gray-50/90 text-gray-600 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3">اسم المخزن</th>
                      <th className="px-4 py-3">الموقع</th>
                      <th className="px-4 py-3">تاريخ الإنشاء</th>
                      <th className="px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {warehouses.map(w => (
                      <tr key={w.id} className="hover:bg-teal-50/30 transition-colors group">
                        <td className="px-4 py-3 font-bold text-gray-800">{w.name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span>{w.location}</span>
                            {getWarehouseLocationHref(w) && (
                              <a
                                href={getWarehouseLocationHref(w)}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
                              >
                                فتح اللوكيشن
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">{format(new Date(w.createdAt), 'PP', { locale: ar })}</td>
                        <td className="px-4 py-3 flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal('warehouse', w)}>
                            <Edit className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete('warehouses', w.id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
              <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center flex-shrink-0">
                <h2 className="text-lg font-semibold">التصنيفات</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="destructive" onClick={handleDeleteAllCategories}>
                    <Trash2 className="ml-2 h-4 w-4" /> حذف الكل
                  </Button>
                  <Button variant="outline" onClick={handleSeedCategories}>
                    <Download className="ml-2 h-4 w-4" /> تحميل التصنيفات الشائعة
                  </Button>
                  <Button onClick={() => { setFormData({}); setEditingId(null); setIsCategoryModalOpen(true); }}>
                    <Plus className="ml-2 h-4 w-4" /> إضافة تصنيف
                  </Button>
                </div>
              </div>

              {/* Mobile View */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {categories.map(c => (
                  <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg text-gray-900">{c.name}</h3>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditModal('category', c)}>
                          <Edit className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete('categories', c.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">{c.description}</p>
                  </div>
                ))}
              </div>

              {/* Desktop View */}
              <div className="custom-scrollbar hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-white/70 bg-white/80 shadow-sm md:block">
                <table className="w-full text-right text-sm whitespace-nowrap relative">
                  <thead className="bg-gray-50/90 text-gray-600 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3">اسم التصنيف</th>
                      <th className="px-4 py-3">الوصف</th>
                      <th className="px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categories.map(c => (
                      <tr key={c.id} className="hover:bg-teal-50/30 transition-colors group">
                        <td className="px-4 py-3 font-bold text-gray-800">{c.name}</td>
                        <td className="px-4 py-3">{c.description}</td>
                        <td className="px-4 py-3 flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => openEditModal('category', c)}>
                            <Edit className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete('categories', c.id)}>
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
              <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center flex-shrink-0">
                <h2 className="text-lg font-semibold">الأصناف والمخزون</h2>
                <div className="flex items-center gap-4">
                  <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                      onClick={() => setItemViewMode('detailed')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${itemViewMode === 'detailed' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      عرض مفصل
                    </button>
                    <button 
                      onClick={() => setItemViewMode('grouped')}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${itemViewMode === 'grouped' ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                      تجميع بالصنف
                    </button>
                  </div>
                  <Button onClick={() => { setFormData({}); setEditingId(null); setIsItemModalOpen(true); }}>
                    <Plus className="ml-2 h-4 w-4" /> إضافة صنف
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input 
                    placeholder="بحث عن صنف..." 
                    className="pr-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <select 
                  className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:w-40"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="all">جميع التصنيفات</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select 
                  className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:w-40"
                  value={filterWarehouse}
                  onChange={(e) => setFilterWarehouse(e.target.value)}
                >
                  <option value="all">جميع المخازن</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <select 
                  className="flex h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:w-40"
                  value={filterUnit}
                  onChange={(e) => setFilterUnit(e.target.value)}
                >
                  <option value="all">جميع الوحدات</option>
                  {uniqueUnits.map(u => <option key={String(u)} value={String(u)}>{String(u)}</option>)}
                </select>
              </div>

              {/* Mobile View */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {itemViewMode === 'detailed' ? (
                  filteredItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 border rounded-lg bg-gray-50">
                      لا توجد أصناف مطابقة للبحث
                    </div>
                  ) : (
                    filteredItems.map(item => {
                      const cat = categories.find(c => c.id === item.categoryId);
                      const wh = warehouses.find(w => w.id === item.warehouseId);
                      return (
                        <div key={item.id} className={`rounded-lg border bg-white p-4 shadow-sm ${item.quantity <= (item.minQuantity || 0) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                                {item.quantity <= (item.minQuantity || 0) && (
                                  <AlertTriangle className="h-5 w-5 text-red-500" />
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{cat?.name || 'غير محدد'}</span>
                                <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-1 text-xs">{wh?.name || 'غير محدد'}</span>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSelectedItemForTx(item); setIsTransactionModalOpen(true); }}>
                                <ArrowRightLeft className="h-3 w-3 ml-1" /> حركة
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditModal('item', item)}>
                                <Edit className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete('items', item.id)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3 bg-white/50 p-2 rounded border border-gray-100">
                            <div>
                              <span className="text-gray-500 block text-xs">الكمية</span>
                              <span className={`font-bold text-lg ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</span> <span className="text-gray-600">{item.unit}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-xs">حد الطلب</span>
                              <span className="font-bold text-gray-700 text-lg">{item.minQuantity || 0}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end text-xs text-gray-500">
                            <div>
                              <span className="block">آخر تحديث: {format(new Date(item.lastUpdated), 'PP p', { locale: ar })}</span>
                              <span className="block mt-0.5">بواسطة: {item.updatedBy}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : (
                  groupedItems.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 border rounded-lg bg-gray-50">
                      لا توجد أصناف مطابقة للبحث
                    </div>
                  ) : (
                    groupedItems.map((item: any, idx: number) => {
                      const cat = categories.find(c => c.id === item.categoryId);
                      return (
                        <div key={idx} className={`rounded-lg border bg-white p-4 shadow-sm ${item.quantity <= (item.minQuantity || 0) ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-lg text-gray-900">{item.name}</h3>
                                {item.quantity <= (item.minQuantity || 0) && (
                                  <AlertTriangle className="h-5 w-5 text-red-500" />
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 mt-1">
                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{cat?.name || 'غير محدد'}</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3 bg-white/50 p-2 rounded border border-gray-100">
                            <div>
                              <span className="text-gray-500 block text-xs">إجمالي الكمية</span>
                              <span className={`font-bold text-lg ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</span> <span className="text-gray-600">{item.unit}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block text-xs">حد الطلب</span>
                              <span className="font-bold text-gray-700 text-lg">{item.minQuantity || 0}</span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            <span className="font-medium text-gray-700 mb-1 block">التوزيع على المخازن:</span>
                            <div className="flex flex-wrap gap-1">
                              {item.warehouseDetails.map((w: string, i: number) => (
                                <span key={i} className="bg-gray-100 px-2 py-1 rounded-md">{w}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )
                )}
              </div>

              {/* Desktop View */}
              <div className="custom-scrollbar hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-white/70 bg-white/80 shadow-sm md:block">
                <table className="w-full text-right text-sm whitespace-nowrap relative">
                  <thead className="bg-gray-50/90 text-gray-600 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
                    {itemViewMode === 'detailed' ? (
                      <tr>
                        <th className="px-4 py-3">الصنف</th>
                        <th className="px-4 py-3">التصنيف</th>
                        <th className="px-4 py-3">المخزن</th>
                        <th className="px-4 py-3">الكمية</th>
                        <th className="px-4 py-3">الوحدة</th>
                        <th className="px-4 py-3">آخر تحديث</th>
                        <th className="px-4 py-3">بواسطة</th>
                        <th className="px-4 py-3">إجراءات</th>
                      </tr>
                    ) : (
                      <tr>
                        <th className="px-4 py-3">الصنف</th>
                        <th className="px-4 py-3">التصنيف</th>
                        <th className="px-4 py-3">إجمالي الكمية</th>
                        <th className="px-4 py-3">الوحدة</th>
                        <th className="px-4 py-3">التوزيع على المخازن</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {itemViewMode === 'detailed' ? (
                      filteredItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                            لا توجد أصناف مطابقة للبحث
                          </td>
                        </tr>
                      ) : (
                        filteredItems.map(item => {
                          const cat = categories.find(c => c.id === item.categoryId);
                          const wh = warehouses.find(w => w.id === item.warehouseId);
                          return (
                            <tr key={item.id} className={`hover:bg-gray-50 ${item.quantity <= (item.minQuantity || 0) ? 'bg-red-50' : ''}`}>
                            <td className="px-4 py-3 font-medium flex items-center gap-2">
                              {item.quantity <= (item.minQuantity || 0) && <AlertTriangle className="h-4 w-4 text-red-500" />}
                              {item.name}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{cat?.name || 'غير محدد'}</span>
                            </td>
                            <td className="px-4 py-3">{wh?.name || 'غير محدد'}</td>
                            <td className={`px-4 py-3 font-bold ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</td>
                            <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                            <td className="px-4 py-3 text-xs text-gray-500">
                              {format(new Date(item.lastUpdated), 'PP p', { locale: ar })}
                            </td>
                            <td className="px-4 py-3 text-xs">{item.updatedBy}</td>
                            <td className="px-4 py-3 flex gap-2">
                              <Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => { setSelectedItemForTx(item); setIsTransactionModalOpen(true); }}>
                                <ArrowRightLeft className="h-3 w-3 ml-1" /> حركة
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditModal('item', item)}>
                                <Edit className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete('items', item.id)}>
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </td>
                          </tr>
                        );
                      }))
                    ) : (
                      groupedItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            لا توجد أصناف مطابقة للبحث
                          </td>
                        </tr>
                      ) : (
                        groupedItems.map((item: any, idx: number) => {
                          const cat = categories.find(c => c.id === item.categoryId);
                          return (
                            <tr key={idx} className={`hover:bg-teal-50/30 transition-colors group ${item.quantity <= (item.minQuantity || 0) ? 'bg-red-50' : ''}`}>
                              <td className="px-4 py-3 font-bold text-gray-800 flex items-center gap-2">
                                {item.quantity <= (item.minQuantity || 0) && <AlertTriangle className="h-4 w-4 text-red-500" />}
                                {item.name}
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs">{cat?.name || 'غير محدد'}</span>
                              </td>
                              <td className={`px-4 py-3 font-bold ${item.quantity <= (item.minQuantity || 0) ? 'text-red-600' : 'text-blue-600'}`}>{item.quantity}</td>
                              <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {item.warehouseDetails.map((w: string, i: number) => (
                                    <span key={i} className="bg-gray-100 px-2 py-1 rounded-md text-xs">{w}</span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === 'transactions' && (
            <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
              <div className="sticky-toolbar -mx-3 -mt-3 mb-3 px-3 pb-3 pt-3 md:-mx-4 md:-mt-4 md:px-4 md:pb-4 md:pt-4">
                <div className="dashboard-panel rounded-[24px] p-3 md:p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-base font-black text-[#004d40] md:text-lg">سجل الحركات المخزنية</h2>
                        <p className="mt-0.5 text-xs text-gray-600 md:text-sm">تتبع الصرف والتوريد حسب القسم والمشروع مع بقاء شريط البحث والفلترة ثابتاً أثناء التصفح.</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-semibold sm:flex sm:flex-wrap sm:text-xs">
                        <div className="rounded-xl bg-white/75 px-2.5 py-1.5 text-gray-600">
                          <span className="block text-[10px] text-gray-500">الحركات</span>
                          <span className="mt-0.5 block text-sm text-[#004d40] md:text-base">{transactionSummary.total.toLocaleString('ar-EG')}</span>
                        </div>
                        <div className="rounded-xl bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
                          <span className="block text-[10px] text-emerald-600">توريد</span>
                          <span className="mt-0.5 block text-sm md:text-base">{transactionSummary.inbound.toLocaleString('ar-EG')}</span>
                        </div>
                        <div className="rounded-xl bg-orange-50 px-2.5 py-1.5 text-orange-700">
                          <span className="block text-[10px] text-orange-600">صرف</span>
                          <span className="mt-0.5 block text-sm md:text-base">{transactionSummary.outbound.toLocaleString('ar-EG')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <Input
                          placeholder="بحث بالصنف أو المشروع..."
                          className="h-10 rounded-xl border-white/70 bg-white/85 pr-10 shadow-sm"
                          value={txSearchQuery}
                          onChange={(e) => setTxSearchQuery(e.target.value)}
                        />
                      </div>
                      <select
                        className="flex h-10 rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        value={txCategoryFilter}
                        onChange={(e) => setTxCategoryFilter(e.target.value)}
                      >
                        <option value="all">جميع الأقسام</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <select
                        className="flex h-10 rounded-xl border border-white/70 bg-white/85 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        value={txTypeFilter}
                        onChange={(e) => setTxTypeFilter(e.target.value)}
                      >
                        <option value="all">جميع الحركات</option>
                        <option value="in">إضافة (توريد)</option>
                        <option value="out">صرف (سحب)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:hidden">
                {filteredTransactions.length === 0 ? (
                  <div className="dashboard-panel rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
                    لا توجد حركات مطابقة للبحث الحالي
                  </div>
                ) : (
                  filteredTransactions.map((tx) => (
                    <div key={tx.id} className="dashboard-panel rounded-2xl p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{tx.itemName}</h3>
                          <p className="mt-1 text-xs text-gray-500">{format(new Date(tx.date), 'PP p', { locale: ar })}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tx.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                          {tx.type === 'in' ? 'إضافة (توريد)' : 'صرف (سحب)'}
                        </span>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">{getTransactionCategoryName(tx)}</span>
                        {tx.projectName && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{tx.projectName}</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded-2xl bg-white/75 p-3">
                          <span className="block text-xs text-gray-500">الكمية</span>
                          <span className={`mt-1 block font-bold ${tx.type === 'in' ? 'text-green-600' : 'text-orange-600'}`} dir="ltr">
                            {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                          </span>
                        </div>
                        <div className="rounded-2xl bg-white/75 p-3">
                          <span className="block text-xs text-gray-500">بواسطة</span>
                          <span className="mt-1 block font-medium text-gray-800">{tx.user || '-'}</span>
                        </div>
                        <div className="rounded-2xl bg-white/75 p-3">
                          <span className="block text-xs text-gray-500">السائق</span>
                          <span className="mt-1 block font-medium text-gray-800">{tx.driverName || '-'}</span>
                        </div>
                        <div className="rounded-2xl bg-white/75 p-3">
                          <span className="block text-xs text-gray-500">رقم السيارة</span>
                          <span className="mt-1 block font-medium text-gray-800">{tx.carNumber || '-'}</span>
                        </div>
                        <div className="rounded-2xl bg-white/75 p-3">
                          <span className="block text-xs text-gray-500">الخفير</span>
                          <span className="mt-1 block font-medium text-gray-800">{tx.guardName || '-'}</span>
                        </div>
                        <div className="rounded-2xl bg-white/75 p-3">
                          <span className="block text-xs text-gray-500">المخزن</span>
                          <span className="mt-1 block font-medium text-gray-800">{getTransactionWarehouseName(tx)}</span>
                        </div>
                      </div>
                      {tx.notes && (
                        <div className="mt-3 border-t border-white/70 pt-3">
                          <span className="mb-1 block text-xs text-gray-500">ملاحظات</span>
                          <p className="text-sm text-gray-700">{tx.notes}</p>
                        </div>
                      )}
                      <div className="mt-3 flex justify-end border-t border-white/70 pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDeleteTransaction(tx)}
                        >
                          <Trash2 className="ml-1 h-4 w-4" />
                          حذف الحركة
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="custom-scrollbar hidden min-h-0 flex-1 overflow-auto rounded-2xl border border-white/70 bg-white/80 shadow-sm md:block">
                <table className="relative w-full whitespace-nowrap text-right text-sm">
                  <thead className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/90 text-gray-600 backdrop-blur-sm">
                    <tr>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">الصنف</th>
                      <th className="px-4 py-3">القسم</th>
                      <th className="px-4 py-3">المخزن</th>
                      <th className="px-4 py-3">نوع الحركة</th>
                      <th className="px-4 py-3">الكمية</th>
                      <th className="px-4 py-3">المشروع/الموقع</th>
                      <th className="px-4 py-3">السائق</th>
                      <th className="px-4 py-3">رقم السيارة</th>
                      <th className="px-4 py-3">الخفير</th>
                      <th className="px-4 py-3">بواسطة</th>
                      <th className="px-4 py-3">ملاحظات</th>
                      <th className="px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                          لا توجد حركات مطابقة للبحث الحالي
                        </td>
                      </tr>
                    ) : (
                      filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="transition-colors hover:bg-teal-50/30">
                          <td className="px-4 py-3 text-xs text-gray-500">{format(new Date(tx.date), 'PP p', { locale: ar })}</td>
                          <td className="px-4 py-3 font-bold text-gray-800">{tx.itemName}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">{getTransactionCategoryName(tx)}</span>
                          </td>
                          <td className="px-4 py-3 text-xs">{getTransactionWarehouseName(tx)}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tx.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                              {tx.type === 'in' ? 'إضافة (توريد)' : 'صرف (سحب)'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold" dir="ltr">
                            <span className={tx.type === 'in' ? 'text-green-600' : 'text-orange-600'}>
                              {tx.type === 'in' ? '+' : '-'}{tx.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3">{tx.projectName || '-'}</td>
                          <td className="px-4 py-3 text-xs">{tx.driverName || '-'}</td>
                          <td className="px-4 py-3 text-xs">{tx.carNumber || '-'}</td>
                          <td className="px-4 py-3 text-xs">{tx.guardName || '-'}</td>
                          <td className="px-4 py-3 text-xs">{tx.user || '-'}</td>
                          <td className="max-w-[220px] truncate px-4 py-3 text-xs text-gray-500" title={tx.notes}>{tx.notes || '-'}</td>
                          <td className="px-4 py-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => handleDeleteTransaction(tx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {activeTab === 'people' && (
            <div className="flex flex-1 flex-col gap-4 md:min-h-0 md:overflow-hidden">
              <div className="grid flex-1 grid-cols-1 gap-4 md:min-h-0 md:grid-cols-3">
                {/* Drivers */}
                <Card className="dashboard-panel flex min-h-[240px] flex-col overflow-hidden md:min-h-0">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-gray-50/50 pb-3">
                    <CardTitle className="text-base text-[#004d40]">السائقين</CardTitle>
                    <Button onClick={() => { setFormData({}); setEditingId(null); setIsDriverModalOpen(true); }} size="sm" className="bg-[#00bfa5] hover:bg-[#00a08a] text-white">
                      <Plus className="h-4 w-4 ml-1" /> إضافة
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-col p-0 md:min-h-0 md:flex-1 md:overflow-hidden">
                    <div className="custom-scrollbar overflow-visible md:min-h-0 md:flex-1 md:overflow-y-auto">
                      <table className="w-full text-right text-sm relative">
                        <thead className="bg-gray-50/90 text-gray-600 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="px-4 py-3">الاسم</th>
                            <th className="px-4 py-3">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drivers.length === 0 ? (
                            <tr><td className="px-4 py-8 text-center text-gray-500">لا يوجد سائقين</td></tr>
                          ) : (
                            drivers.map(driver => (
                              <tr key={driver.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 font-medium">{driver.name}</td>
                                <td className="px-4 py-3 w-20">
                                  <div className="flex gap-1 justify-end">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setFormData(driver); setEditingId(driver.id); setIsDriverModalOpen(true); }}>
                                      <Edit className="h-3 w-3 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete('drivers', driver.id)}>
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Cars */}
                <Card className="dashboard-panel flex min-h-[240px] flex-col overflow-hidden md:min-h-0">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-gray-50/50 pb-3">
                    <CardTitle className="text-base text-[#004d40]">السيارات</CardTitle>
                    <Button onClick={() => { setFormData({}); setEditingId(null); setIsCarModalOpen(true); }} size="sm" className="bg-[#00bfa5] hover:bg-[#00a08a] text-white">
                      <Plus className="h-4 w-4 ml-1" /> إضافة
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-col p-0 md:min-h-0 md:flex-1 md:overflow-hidden">
                    <div className="custom-scrollbar overflow-visible md:min-h-0 md:flex-1 md:overflow-y-auto">
                      <table className="w-full text-right text-sm relative">
                        <thead className="bg-gray-50/90 text-gray-600 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="px-4 py-3">الرقم</th>
                            <th className="px-4 py-3">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cars.length === 0 ? (
                            <tr><td className="px-4 py-8 text-center text-gray-500">لا يوجد سيارات</td></tr>
                          ) : (
                            cars.map(car => (
                              <tr key={car.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 font-medium" dir="ltr">{car.number}</td>
                                <td className="px-4 py-3 w-20">
                                  <div className="flex gap-1 justify-end">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setFormData(car); setEditingId(car.id); setIsCarModalOpen(true); }}>
                                      <Edit className="h-3 w-3 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete('cars', car.id)}>
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Guards */}
                <Card className="dashboard-panel flex min-h-[240px] flex-col overflow-hidden md:min-h-0">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-gray-50/50 pb-3">
                    <CardTitle className="text-base text-[#004d40]">الغفراء</CardTitle>
                    <Button onClick={() => { setFormData({}); setEditingId(null); setIsGuardModalOpen(true); }} size="sm" className="bg-[#00bfa5] hover:bg-[#00a08a] text-white">
                      <Plus className="h-4 w-4 ml-1" /> إضافة
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-col p-0 md:min-h-0 md:flex-1 md:overflow-hidden">
                    <div className="custom-scrollbar overflow-visible md:min-h-0 md:flex-1 md:overflow-y-auto">
                      <table className="w-full text-right text-sm relative">
                        <thead className="bg-gray-50/90 text-gray-600 border-b border-gray-100 sticky top-0 z-10 backdrop-blur-sm">
                          <tr>
                            <th className="px-4 py-3">الاسم</th>
                            <th className="px-4 py-3">إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {guards.length === 0 ? (
                            <tr><td className="px-4 py-8 text-center text-gray-500">لا يوجد غفراء</td></tr>
                          ) : (
                            guards.map(guard => (
                              <tr key={guard.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                <td className="px-4 py-3 font-medium">{guard.name}</td>
                                <td className="px-4 py-3 w-20">
                                  <div className="flex gap-1 justify-end">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setFormData(guard); setEditingId(guard.id); setIsGuardModalOpen(true); }}>
                                      <Edit className="h-3 w-3 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete('guards', guard.id)}>
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
        </main>
      </div>

      {/* Modals */}
      <Modal
        isOpen={isDataToolsModalOpen}
        onClose={() => setIsDataToolsModalOpen(false)}
        title="أدوات النسخ الاحتياطي والمزامنة"
        className="max-w-3xl p-5 sm:p-6"
      >
        <div className="space-y-5">
          <div className="rounded-[24px] border border-teal-100 bg-teal-50/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <span
                  className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${
                    syncState.tone === 'success'
                      ? 'bg-emerald-100 text-emerald-700'
                      : syncState.tone === 'error'
                        ? 'bg-red-100 text-red-700'
                        : syncState.tone === 'syncing'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-white text-slate-700'
                  }`}
                >
                  {syncState.tone === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                  {syncState.tone === 'error' && <AlertCircle className="h-4 w-4 shrink-0" />}
                  {syncState.tone === 'syncing' && <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />}
                  {syncState.tone === 'idle' && <Download className="h-4 w-4 shrink-0" />}
                  <span className="break-words">{syncState.message}</span>
                </span>
                <p className="text-sm leading-7 text-gray-600">
                  يمكنك تصدير كل البيانات والإعدادات كنسخة JSON محلية، واستيرادها لاحقًا، أو إعادة مزامنة البيانات الحالية يدويًا مع Firebase.
                </p>
              </div>
              {syncState.timestamp && (
                <span className="text-xs font-medium text-gray-500">
                  آخر مزامنة: {format(new Date(syncState.timestamp), 'PP p', { locale: ar })}
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Button
              onClick={handleExportBackup}
              className="h-12 rounded-2xl bg-[#00bfa5] text-white hover:bg-[#00a68f]"
              disabled={isToolsBusy}
            >
              <Download className="ml-2 h-4 w-4" />
              {isBackupProcessing ? 'جاري التصدير...' : 'تصدير JSON'}
            </Button>
            <Button
              variant="outline"
              onClick={() => importFileRef.current?.click()}
              className="h-12 rounded-2xl border-teal-200 text-teal-700 hover:bg-teal-50"
              disabled={isToolsBusy}
            >
              <Upload className="ml-2 h-4 w-4" />
              استيراد JSON
            </Button>
            <Button
              variant="secondary"
              onClick={handleManualSync}
              className="h-12 rounded-2xl bg-slate-100 text-slate-800 hover:bg-slate-200"
              disabled={isToolsBusy}
            >
              <RefreshCw className={`ml-2 h-4 w-4 ${isManualSyncing ? 'animate-spin' : ''}`} />
              {isManualSyncing ? 'جاري المزامنة...' : 'مزامنة Firebase'}
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetServerData}
              className="h-12 rounded-2xl"
              disabled={isToolsBusy}
            >
              <Trash2 className={`ml-2 h-4 w-4 ${isResettingServer ? 'animate-pulse' : ''}`} />
              {isResettingServer ? 'جاري التصفير...' : 'حذف جميع البيانات'}
            </Button>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
            <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-black text-[#004d40]">تصدير وطباعة العرض الحالي</h3>
                <p className="mt-1 text-sm text-gray-600">
                  سيتم استخدام التاب الحالي مع نفس البحث والفلاتر الظاهرة الآن.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                العرض الحالي: {currentReportConfig.title}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Button
                variant="secondary"
                onClick={handlePrintCurrentView}
                className="h-12 rounded-2xl bg-slate-100 text-slate-800 hover:bg-slate-200"
                disabled={isToolsBusy}
              >
                <Printer className="ml-2 h-4 w-4" />
                {reportAction === 'print' ? 'جاري التحضير...' : 'طباعة'}
              </Button>
              <Button
                onClick={handleExportCurrentViewPdf}
                className="h-12 rounded-2xl bg-[#0f766e] text-white hover:bg-[#0b5c56]"
                disabled={isToolsBusy}
              >
                <FileText className="ml-2 h-4 w-4" />
                {reportAction === 'pdf' ? 'جاري التصدير...' : 'تصدير PDF'}
              </Button>
              <Button
                variant="outline"
                onClick={handleExportCurrentViewExcel}
                className="h-12 rounded-2xl border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={isToolsBusy}
              >
                <FileSpreadsheet className="ml-2 h-4 w-4" />
                {reportAction === 'excel' ? 'جاري التصدير...' : 'تصدير Excel'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isWarehouseModalOpen} onClose={() => setIsWarehouseModalOpen(false)} title={editingId ? "تعديل مخزن" : "إضافة مخزن جديد"}>
        <form onSubmit={handleSaveWarehouse} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">اسم المخزن</label>
            <Input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">العنوان / وصف الموقع</label>
            <Input required value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">رابط اللوكيشن على الخرائط (اختياري)</label>
            <Input
              dir="ltr"
              placeholder="https://maps.app.goo.gl/... أو رابط Google Maps"
              value={formData.locationUrl || ''}
              onChange={e => setFormData({...formData, locationUrl: e.target.value})}
            />
          </div>
          <Button type="submit" className="w-full">حفظ</Button>
        </form>
      </Modal>

      <Modal isOpen={isCategoryModalOpen} onClose={() => setIsCategoryModalOpen(false)} title={editingId ? "تعديل تصنيف" : "إضافة تصنيف جديد"}>
        <form onSubmit={handleSaveCategory} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">اسم التصنيف</label>
            <Input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الوصف</label>
            <Input value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} />
          </div>
          <Button type="submit" className="w-full">حفظ</Button>
        </form>
      </Modal>

      <Modal isOpen={isItemModalOpen} onClose={() => setIsItemModalOpen(false)} title={editingId ? "تعديل صنف" : "إضافة صنف جديد"}>
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">اسم الصنف (كابل، سلك، لوحة...)</label>
            <Input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">التصنيف</label>
              <select 
                required 
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                value={formData.categoryId || ''} 
                onChange={e => setFormData({...formData, categoryId: e.target.value})}
              >
                <option value="">اختر التصنيف...</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">المخزن</label>
              <select 
                required 
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                value={formData.warehouseId || ''} 
                onChange={e => setFormData({...formData, warehouseId: e.target.value})}
              >
                <option value="">اختر المخزن...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">الكمية الحالية</label>
              <Input type="number" min="0" step="any" required value={formData.quantity || ''} onChange={e => setFormData({...formData, quantity: e.target.value})} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">حد الطلب (تنبيه النواقص)</label>
              <Input type="number" min="0" step="any" value={formData.minQuantity || ''} onChange={e => setFormData({...formData, minQuantity: e.target.value})} placeholder="مثال: 10" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الوحدة</label>
            <select 
              required 
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              value={formData.unit || ''} 
              onChange={e => setFormData({...formData, unit: e.target.value})}
            >
                <option value="">اختر الوحدة...</option>
                <option value="متر">متر</option>
                <option value="لفة">لفة</option>
                <option value="قطعة">قطعة</option>
                <option value="علبة">علبة</option>
                <option value="كرتونة">كرتونة</option>
                <option value="طقم">طقم</option>
                <option value="بكرة">بكرة</option>
                <option value="كيلو">كيلو</option>
                <option value="طن">طن</option>
                <option value="لتر">لتر</option>
              </select>
            </div>
          <Button type="submit" className="w-full">حفظ</Button>
        </form>
      </Modal>

      <Modal isOpen={isTransactionModalOpen} onClose={() => { setIsTransactionModalOpen(false); setTransactionError(null); }} title={`حركة مخزنية: ${selectedItemForTx?.name}`}>
        <form onSubmit={handleSaveTransaction} className="space-y-4">
          {transactionError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {transactionError}
            </div>
          )}
          <div className="flex gap-6 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="txType" value="out" className="w-4 h-4 text-blue-600" checked={transactionData.type === 'out'} onChange={() => setTransactionData({...transactionData, type: 'out'})} />
              <span className="font-medium text-orange-700">صرف (سحب)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="txType" value="in" className="w-4 h-4 text-blue-600" checked={transactionData.type === 'in'} onChange={() => setTransactionData({...transactionData, type: 'in'})} />
              <span className="font-medium text-green-700">إضافة (توريد)</span>
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">الكمية</label>
              <Input type="number" min="0.01" step="any" required value={transactionData.quantity || ''} onChange={e => setTransactionData({...transactionData, quantity: e.target.value})} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">الكمية الحالية</label>
              <Input disabled value={selectedItemForTx?.quantity || 0} className="bg-gray-100" />
            </div>
          </div>

          {transactionData.type === 'out' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-orange-700">اسم المشروع / الموقع المنصرف إليه</label>
              <Input required placeholder="مثال: مشروع العاصمة الإدارية" value={transactionData.projectName || ''} onChange={e => setTransactionData({...transactionData, projectName: e.target.value})} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">السائق (اختياري)</label>
              <select 
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={transactionData.driverName || ''} 
                onChange={e => setTransactionData({...transactionData, driverName: e.target.value})}
              >
                <option value="">اختر السائق...</option>
                {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">السيارة (اختياري)</label>
              <select 
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={transactionData.carNumber || ''} 
                onChange={e => setTransactionData({...transactionData, carNumber: e.target.value})}
              >
                <option value="">اختر السيارة...</option>
                {cars.map(c => <option key={c.id} value={c.number}>{c.number}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">الغفير (اختياري)</label>
              <select 
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={transactionData.guardName || ''} 
                onChange={e => setTransactionData({...transactionData, guardName: e.target.value})}
              >
                <option value="">اختر الغفير...</option>
                {guards.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
              </select>
            </div>
          </div>
          
          <div>
            <label className="mb-1 block text-sm font-medium">ملاحظات (اختياري)</label>
            <Input placeholder="أي تفاصيل إضافية..." value={transactionData.notes || ''} onChange={e => setTransactionData({...transactionData, notes: e.target.value})} />
          </div>
          
          <Button type="submit" className="w-full">تأكيد الحركة</Button>
        </form>
      </Modal>

      <Modal isOpen={confirmDialog.isOpen} onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} title={confirmDialog.title}>
        <div className="space-y-4">
          <p className="text-gray-700">{confirmDialog.message}</p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}>إلغاء</Button>
            <Button variant="default" onClick={confirmDialog.onConfirm}>تأكيد</Button>
          </div>
        </div>
      </Modal>

      {/* People Modals */}
      <Modal isOpen={isDriverModalOpen} onClose={() => setIsDriverModalOpen(false)} title={editingId ? "تعديل سائق" : "إضافة سائق جديد"}>
        <form onSubmit={handleSaveDriver} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">اسم السائق</label>
            <Input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <Button type="submit" className="w-full">حفظ</Button>
        </form>
      </Modal>

      <Modal isOpen={isCarModalOpen} onClose={() => setIsCarModalOpen(false)} title={editingId ? "تعديل سيارة" : "إضافة سيارة جديدة"}>
        <form onSubmit={handleSaveCar} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">رقم السيارة</label>
            <Input required value={formData.number || ''} onChange={e => setFormData({...formData, number: e.target.value})} dir="ltr" className="text-right" />
          </div>
          <Button type="submit" className="w-full">حفظ</Button>
        </form>
      </Modal>

      <Modal isOpen={isGuardModalOpen} onClose={() => setIsGuardModalOpen(false)} title={editingId ? "تعديل غفير" : "إضافة غفير جديد"}>
        <form onSubmit={handleSaveGuard} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">اسم الغفير</label>
            <Input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <Button type="submit" className="w-full">حفظ</Button>
        </form>
      </Modal>

    </div>
  );
}
