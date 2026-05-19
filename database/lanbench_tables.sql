
-- phpMyAdmin SQL Dump
-- version 5.2.0
--
-- Servidor: 127.0.0.1
-- Fecha de generación: 05-05-2026
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

CREATE TABLE `activesessions` (
  `idDataset` int(11) NOT NULL,
  `idUser` int(11) NOT NULL,
  `mode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sectionnumber` int(11) NOT NULL,
  `entrynumber` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `annotation` (
  `idAnnotation` int(11) NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `idUser` int(11) NOT NULL,
  `sentenceIndex` int(10) UNSIGNED NOT NULL,
  `sentence` text NOT NULL,
  `rejectionReason` text DEFAULT NULL,
  `origin` varchar(20) NOT NULL DEFAULT 'manual',
  `acceptedFirstTry` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `annotationalertdecision` (
  `idDecision` int(11) NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `idUser` int(11) NOT NULL,
  `sentenceIndex` int(10) UNSIGNED NOT NULL,
  `alertCode` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alertType` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `decision` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `suggestion` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appliedSentence` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dataset` (
  `idDataset` int(11) NOT NULL,
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entries` int(11) NOT NULL,
  `content` mediumblob NOT NULL,
  `languages` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `colorClass` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'dataset-purple',
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `sectionsCompleted` int(10) UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Número de secciones completadas',
  `sectionsInReview` int(10) UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Número de secciones pendientes de revisión',
  `sectionsPending` int(10) UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Número de secciones sin anotar',
  `llmMode` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `reviewEnabled` tinyint(1) NOT NULL DEFAULT 0,
  `additionalReviews` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dbpedialink` (
  `id` int(10) UNSIGNED NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `direction` varchar(20) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `predicate` varchar(100) NOT NULL,
  `object` varchar(500) NOT NULL,
  `position` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `entry` (
  `idEntry` int(11) NOT NULL,
  `idDataset` int(11) NOT NULL,
  `eid` int(10) UNSIGNED NOT NULL,
  `category` varchar(100) NOT NULL,
  `shape` varchar(50) DEFAULT NULL,
  `shape_type` varchar(50) DEFAULT NULL,
  `size` tinyint(3) UNSIGNED NOT NULL,
  `position` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `evaluationcriterion` (
  `idCriterion` int(11) NOT NULL,
  `key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sortOrder` int(11) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `version` int(11) NOT NULL DEFAULT 1,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `lex` (
  `id` int(10) UNSIGNED NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `lid` varchar(20) NOT NULL,
  `lang` char(5) NOT NULL,
  `comment` varchar(500) DEFAULT NULL,
  `text` text NOT NULL,
  `position` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `link` (
  `id` int(10) UNSIGNED NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `direction` varchar(20) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `predicate` varchar(100) NOT NULL,
  `object` varchar(500) NOT NULL,
  `position` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `permits` (
  `idDataset` int(11) NOT NULL,
  `idUser` int(11) NOT NULL,
  `isOwned` tinyint(1) NOT NULL DEFAULT 0,
  `isAnnotator` tinyint(1) NOT NULL DEFAULT 1,
  `isReviewer` tinyint(1) NOT NULL DEFAULT 0,
  `isAdmin` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `review` (
  `idReview` int(11) NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `idReviewer` int(11) NOT NULL,
  `idAnnotator` int(11) NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `currentCriterionIndex` int(11) NOT NULL DEFAULT 0,
  `assignedAt` datetime NOT NULL DEFAULT current_timestamp(),
  `expiresAt` datetime NOT NULL,
  `timeSpentSeconds` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `completedAt` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reviewcomment` (
  `idComment` int(11) NOT NULL,
  `idReview` int(11) NOT NULL,
  `sentenceIndex` int(10) UNSIGNED NOT NULL,
  `originalSentence` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `correctedSentence` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `acceptedFirstTry` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `reviewdecision` (
  `idDecision` int(11) NOT NULL,
  `idReview` int(11) NOT NULL,
  `criterionCode` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `decision` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `decidedAt` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `section` (
  `idSection` int(11) NOT NULL,
  `idDataset` int(11) NOT NULL,
  `block` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `sectionassignment` (
  `idAssignment` int(11) NOT NULL,
  `idUser` int(11) NOT NULL,
  `idDataset` int(11) NOT NULL,
  `sectionIndex` int(11) NOT NULL,
  `assignedAt` datetime NOT NULL DEFAULT current_timestamp(),
  `expiresAt` datetime NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `timeSpentSeconds` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `triple` (
  `id` int(10) UNSIGNED NOT NULL,
  `tripleset_id` int(10) UNSIGNED NOT NULL,
  `position` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `subject` varchar(500) NOT NULL,
  `predicate` varchar(500) NOT NULL,
  `object` varchar(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `tripleset` (
  `id` int(10) UNSIGNED NOT NULL,
  `idEntry` int(10) UNSIGNED NOT NULL,
  `type` enum('original','modified') NOT NULL,
  `position` int(10) UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `user` (
  `idUser` int(11) NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'annotator'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indices
--

ALTER TABLE `activesessions`
  ADD PRIMARY KEY (`idDataset`,`idUser`,`mode`),
  ADD KEY `idx_activesession_user` (`idUser`);

ALTER TABLE `annotation`
  ADD PRIMARY KEY (`idAnnotation`),
  ADD UNIQUE KEY `uq_annotation_entry_user_sentence` (`idEntry`,`idUser`,`sentenceIndex`),
  ADD KEY `idx_annotation_user` (`idUser`),
  ADD KEY `idx_annotation_entry` (`idEntry`);

ALTER TABLE `annotationalertdecision`
  ADD PRIMARY KEY (`idDecision`),
  ADD KEY `idx_alert_decision_entry` (`idEntry`),
  ADD KEY `idx_alert_decision_user` (`idUser`);

ALTER TABLE `dataset`
  ADD PRIMARY KEY (`idDataset`);

ALTER TABLE `dbpedialink`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_dbpedialink_entry_position` (`idEntry`,`position`),
  ADD KEY `idx_dbpedialink_entry` (`idEntry`);

ALTER TABLE `entry`
  ADD PRIMARY KEY (`idEntry`),
  ADD UNIQUE KEY `uq_entry_dataset_eid` (`idDataset`,`eid`),
  ADD UNIQUE KEY `uq_entry_dataset_position` (`idDataset`,`position`),
  ADD KEY `idx_entry_dataset` (`idDataset`),
  ADD KEY `idx_entry_dataset_status` (`idDataset`,`status`);

ALTER TABLE `evaluationcriterion`
  ADD PRIMARY KEY (`idCriterion`),
  ADD UNIQUE KEY `EvaluationCriterion_key_key` (`key`),
  ADD KEY `idx_criterion_active_order` (`active`,`sortOrder`);

ALTER TABLE `lex`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_lex` (`idEntry`,`lid`,`lang`),
  ADD KEY `idx_lex_entry` (`idEntry`),
  ADD KEY `idx_lex_entry_position` (`idEntry`,`position`);

ALTER TABLE `link`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_link_entry_position` (`idEntry`,`position`),
  ADD KEY `idx_link_entry` (`idEntry`);

ALTER TABLE `permits`
  ADD PRIMARY KEY (`idDataset`,`idUser`),
  ADD KEY `idx_permits_user` (`idUser`);

ALTER TABLE `review`
  ADD PRIMARY KEY (`idReview`),
  ADD KEY `idx_review_entry` (`idEntry`),
  ADD KEY `idx_review_reviewer` (`idReviewer`),
  ADD KEY `idx_review_annotator` (`idAnnotator`),
  ADD KEY `idx_review_status` (`status`);

ALTER TABLE `reviewcomment`
  ADD PRIMARY KEY (`idComment`),
  ADD KEY `idx_review_comment_review` (`idReview`);

ALTER TABLE `reviewdecision`
  ADD PRIMARY KEY (`idDecision`),
  ADD UNIQUE KEY `uq_review_decision_review_criterion` (`idReview`,`criterionCode`),
  ADD KEY `idx_review_decision_review` (`idReview`);

ALTER TABLE `section`
  ADD PRIMARY KEY (`idSection`),
  ADD KEY `idx_section_dataset` (`idDataset`);

ALTER TABLE `sectionassignment`
  ADD PRIMARY KEY (`idAssignment`),
  ADD KEY `idx_assignment_user` (`idUser`),
  ADD KEY `idx_assignment_dataset` (`idDataset`),
  ADD KEY `idx_assignment_section_status` (`idDataset`,`sectionIndex`,`status`);

ALTER TABLE `triple`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_triple_tripleset_position` (`tripleset_id`,`position`),
  ADD KEY `idx_triple_tripleset` (`tripleset_id`);

ALTER TABLE `tripleset`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tripleset_entry_type_position` (`idEntry`,`type`,`position`),
  ADD KEY `idx_tripleset_entry` (`idEntry`);

ALTER TABLE `user`
  ADD PRIMARY KEY (`idUser`),
  ADD UNIQUE KEY `uq_user_email` (`email`),
  ADD UNIQUE KEY `User_email_key` (`email`);

ALTER TABLE `annotation`
  MODIFY `idAnnotation` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `annotationalertdecision`
  MODIFY `idDecision` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `dataset`
  MODIFY `idDataset` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `dbpedialink`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `entry`
  MODIFY `idEntry` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `evaluationcriterion`
  MODIFY `idCriterion` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `lex`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `link`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `review`
  MODIFY `idReview` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `reviewcomment`
  MODIFY `idComment` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `reviewdecision`
  MODIFY `idDecision` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `sectionassignment`
  MODIFY `idAssignment` int(11) NOT NULL AUTO_INCREMENT;

ALTER TABLE `triple`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `tripleset`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `user`
  MODIFY `idUser` int(11) NOT NULL AUTO_INCREMENT;

--
-- Filtros
--

ALTER TABLE `activesessions`
  ADD CONSTRAINT `activesessions_idDataset_fkey` FOREIGN KEY (`idDataset`) REFERENCES `dataset` (`idDataset`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `activesessions_idUser_fkey` FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `annotation`
  ADD CONSTRAINT `Annotation_idUser_fkey` FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `annotationalertdecision`
  ADD CONSTRAINT `AnnotationAlertDecision_idUser_fkey` FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `entry`
  ADD CONSTRAINT `entry_idDataset_fkey` FOREIGN KEY (`idDataset`) REFERENCES `dataset` (`idDataset`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `permits`
  ADD CONSTRAINT `Permits_idDataset_fkey` FOREIGN KEY (`idDataset`) REFERENCES `dataset` (`idDataset`) ON UPDATE CASCADE,
  ADD CONSTRAINT `Permits_idUser_fkey` FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON UPDATE CASCADE;

ALTER TABLE `review`
  ADD CONSTRAINT `Review_idAnnotator_fkey` FOREIGN KEY (`idAnnotator`) REFERENCES `user` (`idUser`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `Review_idReviewer_fkey` FOREIGN KEY (`idReviewer`) REFERENCES `user` (`idUser`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `reviewcomment`
  ADD CONSTRAINT `ReviewComment_idReview_fkey` FOREIGN KEY (`idReview`) REFERENCES `review` (`idReview`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `reviewdecision`
  ADD CONSTRAINT `ReviewDecision_idReview_fkey` FOREIGN KEY (`idReview`) REFERENCES `review` (`idReview`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `section`
  ADD CONSTRAINT `Section_idDataset_fkey` FOREIGN KEY (`idDataset`) REFERENCES `dataset` (`idDataset`) ON UPDATE CASCADE;

ALTER TABLE `sectionassignment`
  ADD CONSTRAINT `SectionAssignment_idDataset_fkey` FOREIGN KEY (`idDataset`) REFERENCES `dataset` (`idDataset`) ON DELETE CASCADE ON UPDATE NO ACTION,
  ADD CONSTRAINT `SectionAssignment_idUser_fkey` FOREIGN KEY (`idUser`) REFERENCES `user` (`idUser`) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE `triple`
  ADD CONSTRAINT `triple_tripleset_id_fkey` FOREIGN KEY (`tripleset_id`) REFERENCES `tripleset` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
