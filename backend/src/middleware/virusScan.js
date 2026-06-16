const fs = require('fs');
const path = require('path');

// Простая проверка расширений (без VirusTotal API)
const scanFileForViruses = async (filePath, fileName) => {
    console.log(`\n🔍 Проверка файла "${fileName}"...`);
    
    return {
        isInfected: false,
        message: 'Проверка не выполнена (режим разработки)',
        scanPerformed: false
    };
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

module.exports = { scanFileForViruses, quickExtensionCheck };