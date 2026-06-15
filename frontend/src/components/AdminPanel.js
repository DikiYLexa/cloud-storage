import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = 'http://localhost:5000/api';

const AdminPanel = ({ token, colors }) => {
    const [users, setUsers] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAdminData();
    }, []);

    const loadAdminData = async () => {
        setLoading(true);
        try {
            const [usersRes, statsRes] = await Promise.all([
                axios.get(`${API_URL}/admin/users`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                axios.get(`${API_URL}/admin/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);
            setUsers(usersRes.data);
            setStats(statsRes.data);
        } catch (error) {
            console.error('Load admin data error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateLimit = async (userId, newLimitMb) => {
        try {
            await axios.put(`${API_URL}/admin/users/${userId}/limit`,
                { limit_mb: newLimitMb },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            loadAdminData();
        } catch (error) {
            console.error('Update limit error:', error);
        }
    };

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px' }}>Загрузка админ-панели...</div>;
    }

    return (
        <div style={{
            background: colors.cardBg,
            borderRadius: '20px',
            padding: '25px',
            marginBottom: '30px',
            border: `1px solid ${colors.border}`
        }}>
            <h2 style={{ marginBottom: '20px', color: colors.accent, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>👑</span> Админ-панель
            </h2>

            {/* Статистика */}
            {stats && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '15px',
                    marginBottom: '30px'
                }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '5px' }}>💾</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.storage.used_mb} MB / {stats.storage.limit_mb} MB</div>
                        <div style={{ marginTop: '8px', height: '6px', background: colors.border, borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${stats.storage.usage_percent}%`, height: '100%', background: colors.accent, borderRadius: '3px' }} />
                        </div>
                        <div style={{ fontSize: '12px', marginTop: '5px' }}>Заполнено {stats.storage.usage_percent}%</div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '5px' }}>👥</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.users.total} пользователей</div>
                        <div style={{ fontSize: '12px', marginTop: '5px' }}>
                            ✅ Активных: {stats.users.active}<br />
                            💤 Неактивных: {stats.users.inactive}
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '32px', marginBottom: '5px' }}>📁</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{stats.files.total} файлов</div>
                        <div style={{ fontSize: '12px', marginTop: '5px' }}>
                            🗑️ В корзине: {stats.files.deleted} ({stats.files.deleted_size_mb} MB)
                        </div>
                    </div>
                </div>
            )}

            {/* Таблица пользователей */}
            <h3 style={{ marginBottom: '15px' }}>📋 Пользователи</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <th style={{ padding: '10px', textAlign: 'left' }}>ID</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Email</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Имя</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Использовано</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Лимит (MB)</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Прогресс</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Роль</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Последний вход</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                                <td style={{ padding: '10px' }}>{user.id}</td>
                                <td style={{ padding: '10px' }}>{user.email}</td>
                                <td style={{ padding: '10px' }}>{user.full_name || '-'}</td>
                                <td style={{ padding: '10px' }}>{user.storage_used_mb} MB</td>
                                <td style={{ padding: '10px' }}>
                                    <input
                                        type="number"
                                        defaultValue={user.storage_limit_mb}
                                        onBlur={(e) => {
                                            const newLimit = parseInt(e.target.value);
                                            if (newLimit >= 100 && newLimit !== parseFloat(user.storage_limit_mb)) {
                                                handleUpdateLimit(user.id, newLimit);
                                            }
                                        }}
                                        style={{
                                            width: '80px',
                                            padding: '5px',
                                            borderRadius: '5px',
                                            border: `1px solid ${colors.border}`,
                                            background: colors.cardBg,
                                            color: colors.text
                                        }}
                                    />
                                </td>
                                <td style={{ padding: '10px', width: '100px' }}>
                                    <div style={{ height: '6px', background: colors.border, borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(user.usage_percent, 100)}%`, height: '100%', background: colors.accent, borderRadius: '3px' }} />
                                    </div>
                                    <div style={{ fontSize: '10px', marginTop: '3px' }}>{user.usage_percent}%</div>
                                </td>
                                <td style={{ padding: '10px' }}>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        background: user.role === 'admin' ? colors.accent : 'rgba(255,255,255,0.1)'
                                    }}>
                                        {user.role === 'admin' ? 'Админ' : 'Пользователь'}
                                    </span>
                                </td>
                               <td style={{ padding: '10px', fontSize: '11px' }}>
                                    {user.last_login && user.last_login !== 'Никогда' ? new Date(user.last_login).toLocaleString('ru-RU') : 'Никогда'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminPanel;