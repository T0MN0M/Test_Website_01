-- The server runs this automatically on startup, so you normally don't need to.
-- You can also run it by hand in MySQL Workbench if you'd like.

CREATE DATABASE IF NOT EXISTS fun_test_site
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fun_test_site;

CREATE TABLE IF NOT EXISTS messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50)  NOT NULL,
  message    VARCHAR(280) NOT NULL,
  emoji      VARCHAR(16)  NOT NULL DEFAULT '🎉',
  color      VARCHAR(7)   NOT NULL DEFAULT '#ff6ec7',
  likes      INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
