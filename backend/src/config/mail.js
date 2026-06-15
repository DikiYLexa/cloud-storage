const nodemailer = require('nodemailer');
require('dotenv').config();

const sendVerificationEmail = async (to, code, username) => {
    console.log('========== 🎫 ОТПРАВКА КОДА ==========');
    console.log(`Email: ${to}`);
    console.log(`Код: ${code}`);
    console.log('======================================');
    
    // РЕАЛЬНАЯ ОТПРАВКА ЧЕРЕЗ MAIL.RU
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        secure: true, // для порта 465 нужно true
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: `"CloudStorage" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Подтверждение регистрации в CloudStorage',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #e94560;">Добро пожаловать в CloudStorage!</h2>
                <p>Здравствуйте, <strong>${username}</strong>!</p>
                <p>Ваш код подтверждения:</p>
                <div style="font-size: 36px; letter-spacing: 5px; padding: 20px; background: #f0f0f0; display: inline-block; border-radius: 10px; font-weight: bold;">
                    ${code}
                </div>
                <p>Введите этот код на сайте для завершения регистрации.</p>
                <p>Код действителен 24 часа.</p>
                <hr>
                <p style="font-size: 12px; color: #666;">CloudStorage - безопасное облачное хранилище</p>
            </div>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Письмо отправлено на ${to}`);
        console.log(`📨 ID письма: ${info.messageId}`);
        return { success: true, code };
    } catch (error) {
        console.error('❌ Ошибка отправки письма:', error.message);
        console.log('📌 Код сохранён в консоли для теста');
        return { success: false, code };
    }
};

module.exports = { sendVerificationEmail };