CREATE DATABASE IF NOT EXISTS lanbench
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE lanbench;

CREATE TABLE `Dataset` (
  `idDataset` INT NOT NULL,
  `entries` INT NOT NULL,
  `content` BLOB NOT NULL,
  PRIMARY KEY (`idDataset`)
) ENGINE=InnoDB;

CREATE TABLE `User` (
  `idUser` INT NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`idUser`)
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

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
) ENGINE=InnoDB;

-- Tabla principal: cada entrada del benchmark
CREATE TABLE entry (
  eid        INT UNSIGNED     NOT NULL,
  category   VARCHAR(100)     NOT NULL,
  shape      VARCHAR(50)      NULL,
  shape_type VARCHAR(50)      NULL,
  size       TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (eid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agrupa los triples de una entry (original o modificado)
-- Una entry puede tener varios originaltripleset y varios modifiedtripleset
CREATE TABLE tripleset (
  id    INT UNSIGNED                NOT NULL AUTO_INCREMENT,
  eid   INT UNSIGNED                NOT NULL,
  type  ENUM('original','modified') NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (eid) REFERENCES entry(eid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cada triple individual dentro de un tripleset
CREATE TABLE triple (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  tripleset_id INT UNSIGNED  NOT NULL,
  subject      VARCHAR(500)  NOT NULL,
  predicate    VARCHAR(500)  NOT NULL,
  object       VARCHAR(500)  NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (tripleset_id) REFERENCES tripleset(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Frases de referencia (0..N por entry, 1..N idiomas por lid)
-- lid agrupa las traducciones de una misma frase (Id1, Id2, ...)
CREATE TABLE lex (
  id      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  eid     INT UNSIGNED  NOT NULL,
  lid     VARCHAR(20)   NOT NULL,   -- e.g. "Id1", "Id2"
  lang    CHAR(5)       NOT NULL,   -- e.g. "en", "ru"
  comment VARCHAR(500)  NULL,
  text    TEXT          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lex (eid, lid, lang),
  FOREIGN KEY (eid) REFERENCES entry(eid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enlaces a DBpedia (sameAs entre entidades en distintos idiomas)
CREATE TABLE dbpedialink (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  eid       INT UNSIGNED NOT NULL,
  direction VARCHAR(20)  NOT NULL,   -- e.g. "en2ru"
  subject   VARCHAR(500) NOT NULL,
  predicate VARCHAR(100) NOT NULL,   -- típicamente "sameAs"
  object    VARCHAR(500) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (eid) REFERENCES entry(eid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enlaces libres (entidades no en DBpedia)
CREATE TABLE link (
  id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
  eid       INT UNSIGNED NOT NULL,
  direction VARCHAR(20)  NOT NULL,
  subject   VARCHAR(500) NOT NULL,
  predicate VARCHAR(100) NOT NULL,
  object    VARCHAR(500) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (eid) REFERENCES entry(eid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;