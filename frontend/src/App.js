import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import AdminPanel from './components/AdminPanel';

const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:5000/api' 
  : '/api';

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState(null);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [message, setMessage] = useState('');
    const [messageType] = useState('');
    const [loading, setLoading] = useState(false);
    const [files, setFiles] = useState([]);
    const [hoveredFile, setHoveredFile] = useState(null);
    const [sortBy, setSortBy] = useState('date');
    const [sortOrder, setSortOrder] = useState('desc');
    const [searchTerm, setSearchTerm] = useState('');
    const [showWelcome, setShowWelcome] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [selectAll, setSelectAll] = useState(false);
    const [userRole, setUserRole] = useState('user');
    const [showTrash, setShowTrash] = useState(false);
    const [trashFiles, setTrashFiles] = useState([]);
    const [showVerificationDialog, setShowVerificationDialog] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [pendingEmail, setPendingEmail] = useState('');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef(null);

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
    
    const getFileIcon = useCallback((mimeType) => {
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType === 'application/pdf') return '📄';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📊';
        if (mimeType.includes('word') || mimeType === 'application/msword') return '📝';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '🗜️';
        return '📁';
    }, []);

    const showToast = useCallback((message, type = 'success') => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
    }, []);

    // ========== ОСНОВНЫЕ ФУНКЦИИ ==========
    
    const loadFiles = useCallback(async (token) => {
        try {
            const res = await axios.get(`${API_URL}/files`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const formattedFiles = res.data.map(file => ({
                id: file.id,
                name: file.original_name,
                size: file.file_size / 1024 / 1024,
                sizeFormatted: (file.file_size / 1024 / 1024).toFixed(2) + ' MB',
                date: new Date(file.uploaded_at),
                dateObj: new Date(file.uploaded_at),
                type: file.mime_type.split('/')[0],
                icon: getFileIcon(file.mime_type)
            }));
            setFiles(formattedFiles);
        } catch (error) {
            console.error('Error loading files:', error);
        }
    }, [getFileIcon]);

    const checkAuth = useCallback(async (token) => {
        try {
            const res = await axios.get(`${API_URL}/profile`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setUser(res.data);
            setUserRole(res.data.role);
            setIsLoggedIn(true);
        } catch (error) {
            localStorage.removeItem('token');
        }
    }, []);

    const loadTrashFiles = useCallback(async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await axios.get(`${API_URL}/files/trash`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const formattedFiles = res.data.map(file => ({
                id: file.id,
                name: file.original_name,
                size: file.file_size / 1024 / 1024,
                sizeFormatted: (file.file_size / 1024 / 1024).toFixed(2) + ' MB',
                date: file.deleted_at ? new Date(file.deleted_at) : new Date(file.uploaded_at),
                dateObj: new Date(file.deleted_at || file.uploaded_at),
                type: file.mime_type.split('/')[0],
                icon: getFileIcon(file.mime_type)
            }));
            setTrashFiles(formattedFiles);
        } catch (error) {
            console.error('Error loading trash:', error);
        }
    }, [getFileIcon]);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            checkAuth(token);
            loadFiles(token);
        }
        const timer = setTimeout(() => setShowWelcome(false), 5000);
        return () => clearTimeout(timer);
    }, [checkAuth, loadFiles]);

    // ========== DRAG AND DROP ==========
    
    const handleDrag = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const fileList = Array.from(e.dataTransfer.files);
            uploadFiles(fileList);
        }
    }, []);

    // ========== ЗАГРУЗКА ФАЙЛОВ (МНОЖЕСТВЕННАЯ) ==========
    
    const uploadFiles = useCallback(async (fileList) => {
        if (!fileList || fileList.length === 0) return;
        
        const token = localStorage.getItem('token');
        if (!token) {
            showToast('⚠️ Не авторизован', 'error');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        
        let successCount = 0;
        let failCount = 0;
        const totalFiles = fileList.length;
        
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                await axios.post(`${API_URL}/files/upload`, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: `Bearer ${token}`
                    }
                });
                successCount++;
            } catch (error) {
                console.error('Upload error for file:', file.name, error);
                failCount++;
            }
            
            setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
        }
        
        setUploading(false);
        setUploadProgress(0);
        
        await loadFiles(token);
        
        if (successCount > 0 && failCount === 0) {
            showToast(`✅ Загружено ${successCount} файлов`, 'success');
        } else if (successCount > 0 && failCount > 0) {
            showToast(`⚠️ Загружено ${successCount}, ошибок ${failCount}`, 'warning');
        } else {
            showToast(`❌ Не удалось загрузить файлы`, 'error');
        }
    }, [loadFiles, showToast]);

    // ========== ОСТАЛЬНЫЕ ФУНКЦИИ ==========
    
    const toggleMenu = () => setMenuOpen(!menuOpen);

    const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
        const res = await axios.post(`${API_URL}/auth/register`, {
            email,
            password,
            full_name: fullName
        });
        
        if (res.data.needVerification) {
            setPendingEmail(email);
            
            // Если есть dev_code - значит письмо не отправилось, показываем код
            if (res.data.dev_code) {
                setVerificationCode(res.data.dev_code);
                setMessage('⚠️ Письмо не отправлено, код на экране');
                setShowVerificationDialog(true);
            } else {
                // Письмо отправлено, код не показываем
                setVerificationCode('');
                setMessage('📧 Код подтверждения отправлен на почту!');
                setShowVerificationDialog(true);
            }
        } else {
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            setIsLoggedIn(true);
            setMessage('Регистрация успешна! Добро пожаловать!');
            setShowWelcome(true);
            setTimeout(() => setShowWelcome(false), 5000);
        }
    } catch (error) {
        console.error('Registration error:', error);
        setMessage(error.response?.data?.error || 'Ошибка регистрации');
    } finally {
        setLoading(false);
    }
};

    const handleCreateShareLink = async (fileId, fileName) => {
        const token = localStorage.getItem('token');
        try {
            const res = await axios.post(`${API_URL}/files/${fileId}/share`, {
                expiresInHours: 24,
                maxDownloads: 0
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await navigator.clipboard.writeText(res.data.shareUrl);
            showToast(`✅ Ссылка на "${fileName}" скопирована!`, 'success');
        } catch (error) {
            showToast('❌ Ошибка при создании ссылки', 'error');
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            const res = await axios.post(`${API_URL}/auth/login`, {
                email,
                password
            });
            localStorage.setItem('token', res.data.token);
            setUser(res.data.user);
            setUserRole(res.data.user?.role || 'user');
            setIsLoggedIn(true);
            setMessage('Добро пожаловать!');
            loadFiles(res.data.token);
            setShowWelcome(true);
            setTimeout(() => setShowWelcome(false), 5000);
        } catch (error) {
            const errorMsg = error.response?.data?.error || 'Ошибка входа';
            setMessage(errorMsg);
            if (error.response?.data?.needVerification && error.response?.data?.email) {
                setPendingEmail(email);
                setShowVerificationDialog(true);
                setMessage('Подтвердите email. Проверьте почту.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setUser(null);
    setFiles([]);
    setMessage('Вы вышли из системы');
    setIsLogin(true);
    setMenuOpen(false);
    setTimeout(() => setMessage(''), 2000);
};

    const handleFileInputChange = (event) => {
        if (event.target.files && event.target.files.length > 0) {
            const fileList = Array.from(event.target.files);
            uploadFiles(fileList);
        }
        event.target.value = '';
    };

    const handleDelete = async (fileId) => {
        const token = localStorage.getItem('token');
        try {
            await axios.delete(`${API_URL}/files/${fileId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await loadFiles(token);
            setMessage('Файл удалён');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage('Ошибка при удалении');
        }
    };

    const handleDownload = async (fileId, fileName) => {
        const token = localStorage.getItem('token');
        try {
            const response = await axios.get(`${API_URL}/files/${fileId}/download`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setMessage('Ошибка при скачивании файла');
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const handleRestore = async (fileId) => {
        const token = localStorage.getItem('token');
        try {
            await axios.put(`${API_URL}/files/${fileId}/restore`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (showTrash) {
                await loadTrashFiles();
            } else {
                await loadFiles(token);
            }
            setMessage('Файл восстановлен');
            setTimeout(() => setMessage(''), 3000);
        } catch (error) {
            setMessage('Ошибка при восстановлении');
        }
    };

    const handlePermanentDelete = async (fileId) => {
        const token = localStorage.getItem('token');
        if (window.confirm('Удалить файл навсегда? Это действие нельзя отменить.')) {
            try {
                await axios.delete(`${API_URL}/files/${fileId}/permanent`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                await loadTrashFiles();
                await loadFiles(token);
                setMessage('Файл удалён навсегда');
                setTimeout(() => setMessage(''), 3000);
            } catch (error) {
                setMessage('Ошибка при удалении');
            }
        }
    };

    const toggleFileSelection = (fileId) => {
        if (selectedFiles.includes(fileId)) {
            setSelectedFiles(selectedFiles.filter(id => id !== fileId));
        } else {
            setSelectedFiles([...selectedFiles, fileId]);
        }
    };

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedFiles([]);
        } else {
            setSelectedFiles(trashFiles.map(file => file.id));
        }
        setSelectAll(!selectAll);
    };

    const handleMassRestore = async () => {
        if (selectedFiles.length === 0) {
            setMessage('Выберите файлы для восстановления');
            return;
        }
        const token = localStorage.getItem('token');
        try {
            for (const fileId of selectedFiles) {
                await axios.put(`${API_URL}/files/${fileId}/restore`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            await loadTrashFiles();
            await loadFiles(token);
            setSelectedFiles([]);
            setSelectAll(false);
            showToast(`✅ Восстановлено ${selectedFiles.length} файлов`, 'success');
        } catch (error) {
            setMessage('Ошибка при восстановлении');
        }
    };

    const handleMassDelete = async () => {
        if (selectedFiles.length === 0) {
            setMessage('Выберите файлы для удаления');
            return;
        }
        if (window.confirm(`Удалить навсегда ${selectedFiles.length} файлов? Это действие нельзя отменить.`)) {
            const token = localStorage.getItem('token');
            try {
                for (const fileId of selectedFiles) {
                    await axios.delete(`${API_URL}/files/${fileId}/permanent`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                }
                await loadTrashFiles();
                await loadFiles(token);
                setSelectedFiles([]);
                setSelectAll(false);
                showToast(`🗑️ Удалено ${selectedFiles.length} файлов`, 'error');
            } catch (error) {
                setMessage('Ошибка при удалении');
            }
        }
    };

    const handleVerifyCode = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            setMessage('Введите 6-значный код');
            return;
        }
        setLoading(true);
        try {
            const res = await axios.post(`${API_URL}/auth/verify-code`, {
                email: pendingEmail,
                code: verificationCode
            });
            if (res.data.success) {
                const loginRes = await axios.post(`${API_URL}/auth/login`, {
                    email: pendingEmail,
                    password: password
                });
                localStorage.setItem('token', loginRes.data.token);
                setUser(loginRes.data.user);
                setIsLoggedIn(true);
                setMessage('✅ Email подтверждён! Добро пожаловать!');
                setShowVerificationDialog(false);
                setVerificationCode('');
                setShowWelcome(true);
                setTimeout(() => setShowWelcome(false), 5000);
            }
        } catch (error) {
            setMessage(error.response?.data?.error || 'Неверный код');
        } finally {
            setLoading(false);
        }
    };

    // ========== СОРТИРОВКА И ФИЛЬТРАЦИЯ ==========
    
    const sortedFiles = [...files].sort((a, b) => {
        let comparison = 0;
        switch(sortBy) {
            case 'name': comparison = a.name.localeCompare(b.name); break;
            case 'size': comparison = a.size - b.size; break;
            case 'date': comparison = a.dateObj - b.dateObj; break;
            case 'type': comparison = a.type.localeCompare(b.type); break;
            default: comparison = 0;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const filteredFiles = sortedFiles.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(field);
            setSortOrder('asc');
        }
    };

    const getSortIcon = (field) => {
        if (sortBy !== field) return '↕️';
        return sortOrder === 'asc' ? '↑' : '↓';
    };

    const formatDate = (date) => {
        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Доброе утро';
        if (hour < 18) return 'Добрый день';
        return 'Добрый вечер';
    };

    // ========== СТИЛИ ==========
    
    const colors = {
        dark: '#1a1a2e',
        darker: '#0f0f1a',
        accent: '#e94560',
        accentLight: '#ff6b8a',
        cardBg: 'rgba(255,255,255,0.05)',
        text: '#ffffff',
        textSecondary: '#a0a0c0',
        border: 'rgba(255,255,255,0.1)',
        success: '#4ecdc4',
        error: '#ff6b6b'
    };

    const styles = {
        container: { minHeight: '100vh', background: `linear-gradient(135deg, ${colors.dark} 0%, ${colors.darker} 100%)`, fontFamily: "'Poppins', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: colors.text, position: 'relative', overflowX: 'hidden' },
        welcomeOverlay: { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1000, animation: 'fadeInOut 3s ease-in-out forwards', pointerEvents: 'none' },
        welcomeCard: { background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, borderRadius: '25px', padding: '30px 50px', color: colors.text, boxShadow: '0 25px 50px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '20px', textAlign: 'center' },
        header: { backgroundColor: colors.cardBg, backdropFilter: 'blur(10px)', borderBottom: `1px solid ${colors.border}`, padding: '0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', height: '70px', position: 'sticky', top: 0, zIndex: 100, minHeight: '70px' },
        burgerButton: { background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: colors.text, display: 'none', padding: '5px' },
        mobileMenu: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: colors.dark, zIndex: 999, transform: menuOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s ease', padding: '60px 20px 20px 20px', display: 'flex', flexDirection: 'column', gap: '20px' },
        mobileMenuClose: { position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', fontSize: '28px', color: colors.text, cursor: 'pointer' },
        mobileMenuItem: { padding: '15px', background: colors.cardBg, borderRadius: '12px', textAlign: 'center', cursor: 'pointer', border: `1px solid ${colors.border}`, fontSize: '18px', fontWeight: '500', transition: 'all 0.2s ease' },
        logo: { fontSize: '24px', fontWeight: 'bold', background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', display: 'flex', alignItems: 'center', gap: '10px' },
        userInfo: { display: 'flex', alignItems: 'center', gap: '20px' },
        greeting: { fontSize: '14px', color: colors.textSecondary },
        userName: { color: colors.text, fontWeight: '600', fontSize: '14px' },
        logoutBtn: { background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`, color: colors.text, border: 'none', padding: '8px 24px', borderRadius: '25px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.3s ease', boxShadow: '0 4px 15px rgba(233,69,96,0.3)' },
        main: { padding: '40px', maxWidth: '1400px', margin: '0 auto' },
        statsBar: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' },
        statCard: { background: colors.cardBg, borderRadius: '15px', padding: '20px', textAlign: 'center', border: `1px solid ${colors.border}`, backdropFilter: 'blur(10px)', transition: 'transform 0.3s ease, box-shadow 0.3s ease', cursor: 'pointer' },
        searchBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' },
        searchInput: { flex: 1, padding: '12px 20px', backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '25px', color: colors.text, fontSize: '14px', outline: 'none' },
        uploadCard: { background: colors.cardBg, borderRadius: '20px', padding: '30px', marginBottom: '40px', backdropFilter: 'blur(10px)', border: `1px solid ${colors.border}`, textAlign: 'center' },
        uploadArea: { border: `2px dashed ${colors.accent}`, borderRadius: '15px', padding: '40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease', backgroundColor: 'rgba(233,69,96,0.05)' },
        uploadAreaDragActive: { border: `2px solid ${colors.accentLight}`, borderRadius: '15px', padding: '40px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s ease', backgroundColor: 'rgba(233,69,96,0.15)' },
        fileList: { background: colors.cardBg, borderRadius: '20px', overflow: 'hidden', backdropFilter: 'blur(10px)', border: `1px solid ${colors.border}` },
        fileHeader: { display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 80px', padding: '15px 20px', backgroundColor: 'rgba(233,69,96,0.1)', fontWeight: 'bold', borderBottom: `1px solid ${colors.border}`, fontSize: '14px' },
        sortHeader: { cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '5px', transition: 'color 0.3s ease' },
        fileRow: { display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 80px', padding: '15px 20px', borderBottom: `1px solid ${colors.border}`, transition: 'all 0.3s ease', cursor: 'pointer', alignItems: 'center' },
        card: { background: colors.cardBg, borderRadius: '20px', backdropFilter: 'blur(10px)', border: `1px solid ${colors.border}`, width: '100%', maxWidth: '450px', padding: '40px', margin: '50px auto' },
        input: { width: '100%', padding: '14px 18px', fontSize: '16px', backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, borderRadius: '10px', outline: 'none', color: colors.text, transition: 'all 0.3s ease', boxSizing: 'border-box' },
        button: { width: '100%', padding: '14px', fontSize: '16px', background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`, color: colors.text, border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.3s ease' },
        title: { textAlign: 'center', marginBottom: '30px', fontSize: '32px', fontWeight: '700', background: `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
        form: { display: 'flex', flexDirection: 'column', gap: '15px' },
        toast: { position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, padding: '12px 24px', borderRadius: '12px', color: '#fff', fontSize: '14px', fontWeight: '500', textAlign: 'center', animation: 'slideUp 0.3s ease-out', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' },
        toastSuccess: { backgroundColor: '#4ecdc4' },
        toastError: { backgroundColor: '#e94560' },
        toastWarning: { backgroundColor: '#ffa500' },
        toastInfo: { backgroundColor: '#3498db' },
        uploadProgressBar: { width: '100%', height: '6px', backgroundColor: colors.border, borderRadius: '3px', overflow: 'hidden', marginTop: '10px' },
        uploadProgressFill: { height: '100%', background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentLight})`, borderRadius: '3px', transition: 'width 0.3s ease' }
    };

    const animationStyles = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translate(-50%, 20px); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes fadeOut { to { opacity: 0; visibility: hidden; } }
        @keyframes fadeInOut { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.7); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 85% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
        .stat-card:hover { transform: translateY(-5px); box-shadow: 0 10px 30px rgba(233,69,96,0.2); }
        .file-row:hover { background-color: rgba(233,69,96,0.1); transform: translateX(5px); }
        .upload-area:hover { border-color: #ff6b8a; background-color: rgba(233,69,96,0.1); transform: scale(1.02); }
        button:hover { transform: scale(1.02); opacity: 0.9; }
        @media (max-width: 768px) { .desktop-menu { display: none !important; } .burger-btn { display: block !important; } }
        @media (min-width: 769px) { .burger-btn { display: none !important; } .mobile-menu { display: none !important; } }
    `;

    const responsiveStyles = `
        @media (max-width: 768px) {
            .file-header { display: none !important; }
            .file-row { display: flex !important; flex-direction: column !important; padding: 12px !important; margin-bottom: 10px !important; border-radius: 12px !important; background: rgba(255,255,255,0.08) !important; border: 1px solid rgba(255,255,255,0.1) !important; }
            .file-row > div { display: flex !important; justify-content: space-between !important; padding: 5px 0 !important; }
            .file-row > div:first-child { font-size: 13px !important; font-weight: bold !important; gap: 8px !important; justify-content: flex-start !important; }
            .file-row > div:first-child span:first-child { font-size: 24px !important; }
            .file-row > div:nth-child(2)::before { content: "📦 Размер: "; font-size: 11px !important; }
            .file-row > div:nth-child(3)::before { content: "📅 Дата: "; font-size: 11px !important; }
            .file-row > div:nth-child(4)::before { content: "📄 Тип: "; font-size: 11px !important; }
            .file-row > div:last-child { justify-content: flex-end !important; gap: 10px !important; margin-top: 5px !important; padding-top: 5px !important; border-top: 1px solid rgba(255,255,255,0.1) !important; }
            .file-row button { padding: 5px 10px !important; font-size: 12px !important; min-width: 55px !important; white-space: nowrap !important; }
            .statsBar { grid-template-columns: 1fr !important; gap: 8px !important; }
            .stat-card { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 10px 12px !important; text-align: left !important; }
            .stat-card div:first-child { font-size: 24px !important; margin-bottom: 0 !important; }
            .stat-card div:nth-child(2) { font-size: 18px !important; }
            .stat-card div:last-child { font-size: 10px !important; }
            .searchInput { font-size: 12px !important; padding: 8px 10px !important; }
            .uploadArea { padding: 15px !important; }
            .uploadArea div:first-child { font-size: 36px !important; }
            .uploadArea h3 { font-size: 14px !important; }
            .main { padding: 10px !important; }
            .trash-header { flex-direction: column !important; align-items: stretch !important; }
            .trash-actions { flex-direction: column !important; width: 100% !important; }
            .trash-actions button { width: 100% !important; justify-content: center !important; margin: 2px 0 !important; }
        }
        @media (max-width: 600px) {
            .file-row { padding: 10px !important; }
            .file-row > div:first-child { font-size: 12px !important; }
            .file-row > div:first-child span:first-child { font-size: 22px !important; }
            .file-row button { padding: 4px 8px !important; font-size: 11px !important; min-width: 50px !important; }
            .stat-card { padding: 8px 10px !important; }
            .stat-card div:first-child { font-size: 22px !important; }
            .stat-card div:nth-child(2) { font-size: 16px !important; }
            .uploadArea { padding: 12px !important; }
            .uploadArea div:first-child { font-size: 32px !important; }
            .uploadArea h3 { font-size: 13px !important; }
            .searchInput { font-size: 11px !important; padding: 6px 8px !important; }
        }
        @media (max-width: 500px) {
            .file-row { padding: 8px !important; }
            .file-row > div { padding: 4px 0 !important; }
            .file-row > div:first-child { font-size: 11px !important; }
            .file-row > div:first-child span:first-child { font-size: 20px !important; }
            .file-row > div:nth-child(2)::before, .file-row > div:nth-child(3)::before, .file-row > div:nth-child(4)::before { font-size: 9px !important; }
            .file-row > div:nth-child(2), .file-row > div:nth-child(3), .file-row > div:nth-child(4) { font-size: 9px !important; }
            .file-row button { padding: 3px 6px !important; font-size: 10px !important; min-width: 45px !important; }
            .stat-card { padding: 6px 8px !important; }
            .stat-card div:first-child { font-size: 18px !important; }
            .stat-card div:nth-child(2) { font-size: 13px !important; }
            .stat-card div:last-child { font-size: 9px !important; }
            .uploadArea { padding: 10px !important; }
            .uploadArea div:first-child { font-size: 26px !important; }
            .uploadArea h3 { font-size: 12px !important; }
            .uploadArea p { font-size: 9px !important; }
            .searchInput { font-size: 10px !important; padding: 5px 7px !important; }
            .main { padding: 8px !important; }
            .uploadCard button { padding: 5px 10px !important; font-size: 10px !important; }
            [style*="display: flex"][style*="gap: 10px"] { gap: 5px !important; }
            button[onclick*="handleMassRestore"], button[onclick*="handleMassDelete"] { padding: 3px 5px !important; font-size: 9px !important; }
            label { font-size: 9px !important; }
        }
        @media (max-width: 400px) {
            .file-row { padding: 6px !important; }
            .file-row > div { padding: 3px 0 !important; }
            .file-row > div:first-child { font-size: 10px !important; }
            .file-row > div:first-child span:first-child { font-size: 18px !important; }
            .file-row > div:nth-child(2)::before, .file-row > div:nth-child(3)::before, .file-row > div:nth-child(4)::before { font-size: 8px !important; }
            .file-row > div:nth-child(2), .file-row > div:nth-child(3), .file-row > div:nth-child(4) { font-size: 8px !important; }
            .file-row button { padding: 2px 4px !important; font-size: 9px !important; min-width: 38px !important; }
            .stat-card { padding: 5px 6px !important; }
            .stat-card div:first-child { font-size: 16px !important; }
            .stat-card div:nth-child(2) { font-size: 11px !important; }
            .stat-card div:last-child { font-size: 7px !important; }
            .uploadArea { padding: 8px !important; }
            .uploadArea div:first-child { font-size: 22px !important; }
            .uploadArea h3 { font-size: 10px !important; }
            .uploadArea p { font-size: 8px !important; }
            .searchInput { font-size: 9px !important; padding: 4px 5px !important; }
            .main { padding: 6px !important; }
            .uploadCard button { padding: 4px 8px !important; font-size: 9px !important; }
            button[onclick*="handleMassRestore"], button[onclick*="handleMassDelete"] { padding: 2px 4px !important; font-size: 8px !important; }
            label { font-size: 7px !important; }
            .file-row > div:last-child { gap: 4px !important; }
        }
    `;

    // ========== ДИАЛОГ ПОДТВЕРЖДЕНИЯ ==========
    
    if (showVerificationDialog) {
    const dialogStyles = {
        container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: `linear-gradient(135deg, ${colors.dark} 0%, ${colors.darker} 100%)`, fontFamily: "'Poppins', 'Segoe UI', sans-serif" },
        card: { background: colors.cardBg, borderRadius: '20px', backdropFilter: 'blur(10px)', border: `1px solid ${colors.border}`, width: '100%', maxWidth: '450px', padding: '40px', textAlign: 'center' },
        text: { color: colors.text, marginBottom: '20px', fontSize: '14px' },
        title: { fontSize: '28px', marginBottom: '20px', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
        codeBlock: { background: 'rgba(233,69,96,0.15)', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: `1px solid ${colors.accent}` },
        codeText: { fontSize: '48px', fontWeight: 'bold', letterSpacing: '8px', color: colors.accent, margin: '10px 0', fontFamily: 'monospace' },
        input: { width: '100%', padding: '14px', marginBottom: '15px', backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, borderRadius: '10px', color: colors.text, fontSize: '16px', boxSizing: 'border-box' },
        button: { width: '100%', padding: '14px', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, border: 'none', borderRadius: '10px', color: colors.text, fontSize: '16px', fontWeight: '600', cursor: 'pointer', marginBottom: '10px' },
        resendButton: { width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '10px', color: colors.textSecondary, fontSize: '14px', cursor: 'pointer' },
        message: { marginTop: '15px', padding: '10px', borderRadius: '10px', backgroundColor: colors.accent, color: colors.text, fontSize: '14px' }
    };

    const handleResendCode = async () => {
        setLoading(true);
        try {
            const res = await axios.post(`${API_URL}/auth/resend-code`, { email: pendingEmail });
            setMessage(res.data.message || 'Новый код отправлен!');
            if (res.data.dev_code) {
                setVerificationCode(res.data.dev_code);
                setMessage('⚠️ Письмо не отправлено, код на экране');
            } else {
                setVerificationCode('');
                setMessage('📧 Новый код отправлен на почту!');
            }
        } catch (error) {
            setMessage(error.response?.data?.error || 'Ошибка отправки кода');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={dialogStyles.container}>
            <style>{animationStyles}</style>
            <div style={dialogStyles.card}>
                <h2 style={dialogStyles.title}> Подтверждение email</h2>
                <p style={dialogStyles.text}>Подтверждение для <strong>{pendingEmail}</strong></p>
                
                {/* БЛОК С КОДОМ НА ЭКРАНЕ - ТОЛЬКО ЕСЛИ ПИСЬМО НЕ ОТПРАВИЛОСЬ */}
                {verificationCode && (
                    <div style={dialogStyles.codeBlock}>
                        <p style={{ margin: 0, fontSize: '14px', opacity: 0.8, color: colors.error }}>
                            ⚠️ Не удалось отправить письмо
                        </p>
                        <p style={dialogStyles.codeText}>{verificationCode}</p>
                        <p style={{ margin: 0, fontSize: '12px', opacity: 0.6 }}>Введите код вручную</p>
                    </div>
                )}
                
                {!verificationCode && (
                    <div style={{ 
                        background: 'rgba(78, 205, 196, 0.15)', 
                        padding: '15px', 
                        borderRadius: '10px', 
                        marginBottom: '20px',
                        border: '1px solid #4ecdc4'
                    }}>
                        <p style={{ margin: 0, color: colors.text }}>
                            📧 Код подтверждения отправлен на вашу почту
                        </p>
                        <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.7 }}>
                            Проверьте папку "Спам", если письмо не пришло
                        </p>
                    </div>
                )}
                
                <input
                    type="text"
                    maxLength="6"
                    placeholder="Введите 6-значный код"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    style={dialogStyles.input}
                />
                <button onClick={handleVerifyCode} style={dialogStyles.button}>
                    {loading ? 'Проверка...' : 'Подтвердить email'}
                </button>
                <button onClick={handleResendCode} style={dialogStyles.resendButton} disabled={loading}>
                    Отправить код повторно
                </button>
                <button 
                    onClick={() => {
                        setShowVerificationDialog(false);
                        setMessage('');
                        setVerificationCode('');
                    }} 
                    style={{ ...dialogStyles.resendButton, marginTop: '10px' }}
                >
                    Назад
                </button>
                {message && !message.includes('подтверждён') && <div style={dialogStyles.message}>{message}</div>}
            </div>
        </div>
    );
}
    
    // ========== ОСНОВНОЙ РЕНДЕР (АВТОРИЗОВАН) ==========
    
    if (isLoggedIn && user) {
        const totalFiles = files.length;
        const totalSize = files.reduce((acc, f) => acc + f.size, 0).toFixed(1);
        const usedSpace = Math.min(Math.floor((totalSize / 1024) * 100), 100);

        return (
            <div style={styles.container}>
                <style>{animationStyles}</style>
                <style>{responsiveStyles}</style>
                
                <div className="mobile-menu" style={styles.mobileMenu}>
                    <button onClick={toggleMenu} style={styles.mobileMenuClose}>✕</button>
                    <div style={styles.mobileMenuItem}>
                        <div style={{ fontSize: '14px', opacity: 0.7 }}>{getGreeting()},</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{user.full_name || user.email}</div>
                    </div>
                    <div onClick={() => { setShowTrash(false); loadFiles(localStorage.getItem('token')); toggleMenu(); }} style={{ ...styles.mobileMenuItem, background: !showTrash ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` : colors.cardBg }}>📁 Мои файлы</div>
                    <div onClick={() => { setShowTrash(true); loadTrashFiles(); toggleMenu(); }} style={{ ...styles.mobileMenuItem, background: showTrash ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` : colors.cardBg }}>🗑️ Корзина {trashFiles.length > 0 && `(${trashFiles.length})`}</div>
                    <div onClick={() => { handleLogout(); toggleMenu(); }} style={styles.mobileMenuItem}>🚪 Выйти</div>
                </div>

                {showWelcome && (
                    <div style={styles.welcomeOverlay}>
                        <div style={styles.welcomeCard}>
                            <span style={{ fontSize: '48px' }}>🎉</span>
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '28px', marginBottom: '8px' }}>{getGreeting()}, {user.full_name || user.email}!</div>
                                <div style={{ fontSize: '16px', opacity: 0.95 }}>Добро пожаловать в CloudStorage</div>
                            </div>
                        </div>
                    </div>
                )}

                <div style={styles.header}>
                    <div style={styles.logo}><span>☁️</span> CloudStorage</div>
                    <button onClick={toggleMenu} className="burger-btn" style={styles.burgerButton}>☰</button>
                    <div className="desktop-menu" style={styles.userInfo}>
                        <div style={styles.greeting}>{getGreeting()},</div>
                        <div style={styles.userName}>👋 {user.full_name || user.email}</div>
                        <button onClick={() => { setShowTrash(false); loadFiles(localStorage.getItem('token')); }} style={{ ...styles.logoutBtn, background: !showTrash ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` : 'transparent', border: !showTrash ? 'none' : `1px solid ${colors.border}` }}>📁 Файлы</button>
                        <button onClick={() => { setShowTrash(true); loadTrashFiles(); }} style={{ ...styles.logoutBtn, background: showTrash ? `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})` : 'transparent', border: showTrash ? 'none' : `1px solid ${colors.border}` }}>🗑️ Корзина {trashFiles.length > 0 && `(${trashFiles.length})`}</button>
                        <button onClick={handleLogout} style={styles.logoutBtn}>Выйти</button>
                    </div>
                </div>

                <div style={styles.main}>
                    <div style={styles.statsBar}>
                        <div className="stat-card" style={styles.statCard}><div style={{ fontSize: '32px' }}>📁</div><div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalFiles}</div><div style={{ fontSize: '12px', color: colors.textSecondary }}>Всего файлов</div></div>
                        <div className="stat-card" style={styles.statCard}><div style={{ fontSize: '32px' }}>💾</div><div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalSize} MB</div><div style={{ fontSize: '12px', color: colors.textSecondary }}>Использовано места</div></div>
                        <div className="stat-card" style={styles.statCard}>
                            <div style={{ fontSize: '32px' }}>📊</div>
                            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{usedSpace}%</div>
                            <div style={{ fontSize: '12px', color: colors.textSecondary }}>Заполнено хранилища</div>
                            <div style={{ marginTop: '10px', height: '4px', background: colors.border, borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${usedSpace}%`, height: '100%', background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentLight})`, borderRadius: '2px' }} /></div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                        <div style={{ background: colors.cardBg, borderRadius: '16px', padding: '20px', border: `1px solid ${colors.border}`, backdropFilter: 'blur(10px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}><span style={{ fontSize: '32px' }}>📊</span><h3 style={{ margin: 0, fontSize: '18px' }}>Быстрая статистика</h3></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>📁 Всего файлов:</span><span style={{ fontWeight: 'bold', color: colors.accent }}>{totalFiles}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}><span>💾 Занято места:</span><span style={{ fontWeight: 'bold', color: colors.accent }}>{totalSize} MB</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>🗑️ В корзине:</span><span style={{ fontWeight: 'bold', color: colors.accent }}>{trashFiles.length}</span></div>
                        </div>
                        <div style={{ background: colors.cardBg, borderRadius: '16px', padding: '20px', border: `1px solid ${colors.border}`, backdropFilter: 'blur(10px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}><span style={{ fontSize: '32px' }}>⚡</span><h3 style={{ margin: 0, fontSize: '18px' }}>Быстрый доступ</h3></div>
                            <button onClick={() => { if (showTrash) { setShowTrash(false); setTimeout(() => { if (fileInputRef.current) fileInputRef.current.click(); }, 100); } else { if (fileInputRef.current) fileInputRef.current.click(); } }} style={{ width: '100%', padding: '12px', marginBottom: '10px', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, border: 'none', borderRadius: '12px', color: colors.text, fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>⬆️ Загрузить файл</button>
                            <button onClick={() => { if (showTrash) { setShowTrash(false); const token = localStorage.getItem('token'); if (token) loadFiles(token); } else { loadTrashFiles(); setShowTrash(true); } }} style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${colors.border}`, borderRadius: '12px', color: colors.text, cursor: 'pointer', fontSize: '14px' }}>🗑️ {showTrash ? 'Вернуться к файлам' : 'Перейти в корзину'}</button>
                        </div>
                        <div style={{ background: colors.cardBg, borderRadius: '16px', padding: '20px', border: `1px solid ${colors.border}`, backdropFilter: 'blur(10px)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}><span style={{ fontSize: '32px' }}>💡</span><h3 style={{ margin: 0, fontSize: '18px' }}>Совет</h3></div>
                            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>📱 Вы можете установить это приложение на телефон!<br/>Нажмите "Поделиться" → "На экран Домой"</p>
                        </div>
                    </div>

                    {userRole === 'admin' && !showTrash && <AdminPanel token={localStorage.getItem('token')} colors={colors} />}

                    <div style={styles.searchBar}>
                        <input type="text" placeholder="🔍 Поиск файлов..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={styles.searchInput} />
                    </div>

                    {!showTrash && (
                        <div 
                            style={styles.uploadCard}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <div 
                                className="upload-area" 
                                style={dragActive ? styles.uploadAreaDragActive : styles.uploadArea}
                            >
                                <div style={{ fontSize: '56px', marginBottom: '15px' }}>⬆️</div>
                                <h3>Загрузить файлы до (100 мб)</h3>
                                <p style={{ color: colors.textSecondary }}>
                                    {dragActive ? '📥 Отпустите файлы для загрузки' : 'Перетащите файлы сюда или нажмите для выбора'}
                                </p>
                                <p style={{ color: colors.textSecondary, fontSize: '12px' }}>
                                    Можно выбрать несколько файлов одновременно
                                </p>
                                <input 
                                    type="file" 
                                    style={{ display: 'none' }} 
                                    id="fileInput" 
                                    ref={fileInputRef}
                                    onChange={handleFileInputChange}
                                    multiple 
                                />
                                <button 
                                    onClick={() => fileInputRef.current?.click()} 
                                    style={{ padding: '12px 32px', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, color: colors.text, border: 'none', borderRadius: '25px', cursor: 'pointer' }} 
                                    disabled={uploading}
                                >
                                    {uploading ? 'Загрузка...' : 'Выбрать файлы'}
                                </button>
                                {uploading && (
                                    <div style={styles.uploadProgressBar}>
                                        <div style={{ ...styles.uploadProgressFill, width: `${uploadProgress}%` }} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {showTrash && (
                        <div className="trash-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '15px', background: colors.cardBg, borderRadius: '10px', border: `1px solid ${colors.border}`, flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: colors.text }}>
                                    <input type="checkbox" checked={selectAll} onChange={toggleSelectAll} style={{ width: '18px', height: '18px', cursor: 'pointer' }} /> 
                                    Выбрать все ({trashFiles.length})
                                </label>
                                <span style={{ color: colors.textSecondary }}>Выбрано: {selectedFiles.length}</span>
                            </div>
                            <div className="trash-actions" style={{ display: 'flex', gap: '10px', flexDirection: 'row' }}>
                                <button onClick={handleMassRestore} disabled={selectedFiles.length === 0} style={{ padding: '8px 16px', background: selectedFiles.length > 0 ? `linear-gradient(135deg, #4ecdc4, #44b3a8)` : colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '8px', color: selectedFiles.length > 0 ? colors.text : colors.textSecondary, cursor: selectedFiles.length > 0 ? 'pointer' : 'not-allowed', fontSize: '14px', whiteSpace: 'nowrap' }}>↩️ Восстановить ({selectedFiles.length})</button>
                                <button onClick={handleMassDelete} disabled={selectedFiles.length === 0} style={{ padding: '8px 16px', background: selectedFiles.length > 0 ? `linear-gradient(135deg, ${colors.accent}, #c41e3a)` : colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '8px', color: selectedFiles.length > 0 ? colors.text : colors.textSecondary, cursor: selectedFiles.length > 0 ? 'pointer' : 'not-allowed', fontSize: '14px', whiteSpace: 'nowrap' }}>🗑️ Удалить ({selectedFiles.length})</button>
                            </div>
                        </div>
                    )}

                    <div style={styles.fileList}>
                        <div style={styles.fileHeader}>
                            <div style={styles.sortHeader} onClick={() => handleSort('name')}>Название {getSortIcon('name')}</div>
                            <div style={styles.sortHeader} onClick={() => handleSort('size')}>Размер {getSortIcon('size')}</div>
                            <div style={styles.sortHeader} onClick={() => handleSort('date')}>Дата {getSortIcon('date')}</div>
                            <div style={styles.sortHeader} onClick={() => handleSort('type')}>Тип {getSortIcon('type')}</div>
                            <div>Действия</div>
                        </div>
                        {(showTrash ? trashFiles : filteredFiles).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: colors.textSecondary }}>🗂️ {showTrash ? 'Корзина пуста' : (searchTerm ? 'Ничего не найдено' : 'У вас пока нет файлов')}</div>
                        ) : (
                            (showTrash ? trashFiles : filteredFiles).map(file => (
                                <div key={file.id} className="file-row" style={{ ...styles.fileRow, ...(hoveredFile === file.id && { backgroundColor: 'rgba(233,69,96,0.1)' }) }} onMouseEnter={() => setHoveredFile(file.id)} onMouseLeave={() => setHoveredFile(null)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {showTrash && <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => toggleFileSelection(file.id)} style={{ width: '18px', height: '18px', marginRight: '5px', cursor: 'pointer' }} />}
                                        <span style={{ fontSize: '24px' }}>{file.icon}</span>
                                        <span>{file.name}</span>
                                    </div>
                                    <div>{file.sizeFormatted}</div>
                                    <div>{formatDate(file.dateObj)}</div>
                                    <div>{file.type.toUpperCase()}</div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {showTrash ? (
                                            <>
                                                <button onClick={() => handleRestore(file.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: colors.textSecondary }} title="Восстановить">↩️</button>
                                                <button onClick={() => handlePermanentDelete(file.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: colors.accent }} title="Удалить навсегда">🗑️</button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleDownload(file.id, file.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: colors.textSecondary }} title="Скачать">⬇️</button>
                                                <button onClick={() => handleCreateShareLink(file.id, file.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: colors.textSecondary }} title="Поделиться">🔗</button>
                                                <button onClick={() => handleDelete(file.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: colors.accent }} title="Удалить">🗑️</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {toast.show && (
                    <div style={{ ...styles.toast, ...(toast.type === 'success' ? styles.toastSuccess : toast.type === 'error' ? styles.toastError : toast.type === 'warning' ? styles.toastWarning : styles.toastInfo) }}>
                        {toast.message}
                    </div>
                )}
            </div>
        );
    }

    // ========== ФОРМА ВХОДА/РЕГИСТРАЦИИ ==========
    
    const formStyles = {
        container: { minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: `linear-gradient(135deg, ${colors.dark} 0%, ${colors.darker} 100%)`, fontFamily: "'Poppins', 'Segoe UI', sans-serif" },
        card: { background: colors.cardBg, borderRadius: '20px', backdropFilter: 'blur(10px)', border: `1px solid ${colors.border}`, width: '100%', maxWidth: '450px', padding: '40px' },
        title: { textAlign: 'center', marginBottom: '30px', fontSize: '32px', fontWeight: '700', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
        form: { display: 'flex', flexDirection: 'column', gap: '15px' },
        input: { width: '100%', padding: '14px', backgroundColor: 'rgba(255,255,255,0.05)', border: `1px solid ${colors.border}`, borderRadius: '10px', color: colors.text, fontSize: '16px', boxSizing: 'border-box' },
        button: { width: '100%', padding: '14px', background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`, border: 'none', borderRadius: '10px', color: colors.text, fontSize: '16px', fontWeight: '600', cursor: 'pointer' },
        switchButton: { background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', marginTop: '20px', width: '100%' },
        message: { marginTop: '20px', padding: '12px 20px', borderRadius: '10px', textAlign: 'center', fontSize: '14px', fontWeight: '500', position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, animation: 'slideUp 0.3s ease-out', backgroundColor: messageType === 'success' ? '#4ecdc4' : colors.accent, color: colors.text, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }
    };

    return (
        <div style={formStyles.container}>
            <style>{animationStyles}</style>
            <div style={formStyles.card}>
                <h2 style={formStyles.title}>{isLogin ? 'Добро пожаловать' : 'Создать аккаунт'}</h2>
                <form onSubmit={isLogin ? handleLogin : handleRegister} style={formStyles.form}>
                    {!isLogin && <input type="text" placeholder="Полное имя" value={fullName} onChange={(e) => setFullName(e.target.value)} style={formStyles.input} />}
                    <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={formStyles.input} required />
                    <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} style={formStyles.input} required />
                    <button type="submit" style={formStyles.button} disabled={loading}>{loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}</button>
                </form>
                <button onClick={() => { setIsLogin(!isLogin); setMessage(''); setEmail(''); setPassword(''); setFullName(''); }} style={formStyles.switchButton}>
                    {isLogin ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
                </button>
                {message && <div style={formStyles.message}>{message}</div>}
            </div>
        </div>
    );
}

export default App;