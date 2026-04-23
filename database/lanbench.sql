-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Versión del servidor: 10.4.25-MariaDB
-- Versión de PHP: 8.1.10

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `lanbench`
--

CREATE DATABASE IF NOT EXISTS lanbench
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE lanbench;

-- --------------------------------------------------------

CREATE TABLE `Dataset` (
  `idDataset` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(128) NOT NULL,
  `entries` INT NOT NULL,
  `content` MEDIUMBLOB NOT NULL,
  `languages` TEXT NULL,
  `completedPercent` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `withoutReviewPercent` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `remainPercent` TINYINT UNSIGNED NOT NULL DEFAULT 100,
  `colorClass` VARCHAR(64) NOT NULL DEFAULT 'dataset-purple',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idDataset`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;

-- --------------------------------------------------------

CREATE TABLE `User` (
  `idUser` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT 'annotator',
  PRIMARY KEY (`idUser`),
  UNIQUE KEY `uq_user_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;

-- --------------------------------------------------------

CREATE TABLE `Section` (
  `idSection` INT NOT NULL,
  `idDataset` INT NOT NULL,
  `block` INT NOT NULL,
  PRIMARY KEY (`idSection`),
  INDEX `idx_section_dataset` (`idDataset`),
  CONSTRAINT `fk_section_dataset`
    FOREIGN KEY (`idDataset`)
    REFERENCES `Dataset` (`idDataset`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;

-- --------------------------------------------------------

CREATE TABLE `Permits` (
  `idDataset` INT NOT NULL,
  `idUser` INT NOT NULL,
  `isOwned` BOOLEAN NOT NULL,
  PRIMARY KEY (`idDataset`, `idUser`),
  INDEX `idx_permits_user` (`idUser`),
  CONSTRAINT `fk_permits_dataset`
    FOREIGN KEY (`idDataset`)
    REFERENCES `Dataset` (`idDataset`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT `fk_permits_user`
    FOREIGN KEY (`idUser`)
    REFERENCES `User` (`idUser`)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Tabla gestionada automáticamente por express-mysql-session

CREATE TABLE `sessions` (
  `session_id` VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `expires` INT UNSIGNED NOT NULL,
  `data` MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `entry` (
  `idEntry` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `idDataset` INT NOT NULL,
  `eid` INT UNSIGNED NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `shape` VARCHAR(50) NULL,
  `shape_type` VARCHAR(50) NULL,
  `size` TINYINT UNSIGNED NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`idEntry`),
  UNIQUE KEY `uq_entry_dataset_eid` (`idDataset`, `eid`),
  UNIQUE KEY `uq_entry_dataset_position` (`idDataset`, `position`),
  KEY `idx_entry_dataset` (`idDataset`),
  CONSTRAINT `fk_entry_dataset`
    FOREIGN KEY (`idDataset`)
    REFERENCES `Dataset` (`idDataset`)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `tripleset` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `idEntry` INT UNSIGNED NOT NULL,
  `type` ENUM('original', 'modified') NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tripleset_entry_type_position` (`idEntry`, `type`, `position`),
  KEY `idx_tripleset_entry` (`idEntry`),
  CONSTRAINT `fk_tripleset_entry`
    FOREIGN KEY (`idEntry`)
    REFERENCES `entry` (`idEntry`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `triple` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tripleset_id` INT UNSIGNED NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  `subject` VARCHAR(500) NOT NULL,
  `predicate` VARCHAR(500) NOT NULL,
  `object` VARCHAR(500) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_triple_tripleset_position` (`tripleset_id`, `position`),
  KEY `idx_triple_tripleset` (`tripleset_id`),
  CONSTRAINT `fk_triple_tripleset`
    FOREIGN KEY (`tripleset_id`)
    REFERENCES `tripleset` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `lex` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `idEntry` INT UNSIGNED NOT NULL,
  `lid` VARCHAR(20) NOT NULL,
  `lang` CHAR(5) NOT NULL,
  `comment` VARCHAR(500) NULL,
  `text` TEXT NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lex` (`idEntry`, `lid`, `lang`),
  KEY `idx_lex_entry` (`idEntry`),
  KEY `idx_lex_entry_position` (`idEntry`, `position`),
  CONSTRAINT `fk_lex_entry`
    FOREIGN KEY (`idEntry`)
    REFERENCES `entry` (`idEntry`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `dbpedialink` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `idEntry` INT UNSIGNED NOT NULL,
  `direction` VARCHAR(20) NOT NULL,
  `subject` VARCHAR(500) NOT NULL,
  `predicate` VARCHAR(100) NOT NULL,
  `object` VARCHAR(500) NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dbpedialink_entry_position` (`idEntry`, `position`),
  KEY `idx_dbpedialink_entry` (`idEntry`),
  CONSTRAINT `fk_dbpedialink_entry`
    FOREIGN KEY (`idEntry`)
    REFERENCES `entry` (`idEntry`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `link` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `idEntry` INT UNSIGNED NOT NULL,
  `direction` VARCHAR(20) NOT NULL,
  `subject` VARCHAR(500) NOT NULL,
  `predicate` VARCHAR(100) NOT NULL,
  `object` VARCHAR(500) NOT NULL,
  `position` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_link_entry_position` (`idEntry`, `position`),
  KEY `idx_link_entry` (`idEntry`),
  CONSTRAINT `fk_link_entry`
    FOREIGN KEY (`idEntry`)
    REFERENCES `entry` (`idEntry`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

CREATE TABLE `Annotation` (
  `idAnnotation` INT NOT NULL AUTO_INCREMENT,
  `idEntry` INT UNSIGNED NOT NULL,
  `idUser` INT NOT NULL,
  `sentenceIndex` INT UNSIGNED NOT NULL,
  `sentence` TEXT NOT NULL,
  `rejectionReason` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idAnnotation`),
  UNIQUE KEY `uq_annotation_entry_user_sentence` (`idEntry`, `idUser`, `sentenceIndex`),
  KEY `idx_annotation_user` (`idUser`),
  KEY `idx_annotation_entry` (`idEntry`),
  CONSTRAINT `fk_annotation_entry`
    FOREIGN KEY (`idEntry`)
    REFERENCES `entry` (`idEntry`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_annotation_user`
    FOREIGN KEY (`idUser`)
    REFERENCES `User` (`idUser`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
