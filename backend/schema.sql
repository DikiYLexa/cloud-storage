-- Создание таблицы Roles
CREATE TABLE IF NOT EXISTS Roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- Создание таблицы Users
CREATE TABLE IF NOT EXISTS Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role_id INT DEFAULT 1,
    storage_used BIGINT DEFAULT 0,
    storage_limit BIGINT DEFAULT 52428800,
    is_email_confirmed BOOLEAN DEFAULT FALSE,
    email_confirmation_token VARCHAR(10),
    email_confirmation_sent_at DATETIME,
    email_confirmed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    FOREIGN KEY (role_id) REFERENCES Roles(id)
);

-- Создание таблицы Files
CREATE TABLE IF NOT EXISTS Files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    stored_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    is_deleted BOOLEAN DEFAULT FALSE,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Создание таблицы SharedLinks
CREATE TABLE IF NOT EXISTS SharedLinks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT NOT NULL,
    user_id INT NOT NULL,
    token VARCHAR(100) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    download_count INT DEFAULT 0,
    max_downloads INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES Files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
);

-- Вставка ролей
INSERT IGNORE INTO Roles (id, name) VALUES (1, 'user');
INSERT IGNORE INTO Roles (id, name) VALUES (2, 'admin');