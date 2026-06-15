const fs = require('fs');
const path = require('path');

// Инициализация сканера
let scanner = null;

const initScanner = () => {
    const apiKey = process.env.VT_API_KEY;
    if (!apiKey || apiKey === '241121e4dd252f3fc6523b7f114a47084d2df7704c049a8c3e9ca40c9bd04677') {
        console.log('⚠️ VirusTotal API ключ не настроен');
        return null;
    }
    
    try {
        const vtScanner = require('totalvirus-api');
        scanner = vtScanner(apiKey);  // Просто передаём ключ
        console.log('✅ VirusTotal сканер готов');
        return scanner;
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return null;
    }
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const scanFileForViruses = async (filePath, fileName) => {
    console.log(`\n🔍 Проверка файла "${fileName}"...`);
    
    if (!scanner) {
        scanner = initScanner();
    }
    
    if (!scanner) {
        return {
            isInfected: false,
            message: 'Проверка не выполнена',
            scanPerformed: false
        };
    }
    
    try {
        // 1. Сканируем файл
        console.log('📤 Отправка на VirusTotal...');
        const scanResult = await scanner.scanFile(filePath);
        const analysisId = scanResult.data.id;
        
        // 2. Ждём 20 секунд
        console.log('⏳ Ожидание результатов...');
        await wait(20000);
        
        // 3. Получаем отчёт
        console.log('📊 Получение результатов...');
        const report = await scanner.getReport(analysisId);
        
        const stats = report.data.attributes.stats;
        const malicious = stats.malicious || 0;
        const suspicious = stats.suspicious || 0;
        
        console.log(`📊 Результаты: вредоносных=${malicious}, подозрительных=${suspicious}`);
        
        if (malicious > 0 || suspicious > 0) {
            return {
                isInfected: true,
                message: `Обнаружена угроза! (${malicious} вирусов, ${suspicious} подозрений)`,
                stats: stats,
                scanPerformed: true
            };
        }
        
        return {
            isInfected: false,
            message: 'Файл безопасен',
            stats: stats,
            scanPerformed: true
        };
        
    } catch (error) {
        console.error('❌ Ошибка:', error.message);
        return {
            isInfected: false,
            message: 'Ошибка проверки',
            scanPerformed: false
        };
    }
};

// Быстрая проверка расширений
const quickExtensionCheck = (fileName) => {
    const dangerous = ['.exe', '.bat', '.cmd', '.sh', '.vbs', '.ps1', '.jar', '.scr', '.com', '.dll', '.msi'];
    const ext = path.extname(fileName).toLowerCase();
    
    if (dangerous.includes(ext)) {
        return {
            isDangerous: true,
            message: `Файлы с расширением ${ext} запрещены`
        };
    }
    return { isDangerous: false };
};

initScanner();

module.exports = { scanFileForViruses, quickExtensionCheck };