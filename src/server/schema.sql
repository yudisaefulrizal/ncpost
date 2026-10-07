CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bab diinput lewat aplikasi (judul buku + judul bab).
CREATE TABLE IF NOT EXISTS chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  book VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  -- Nomor bagian dalam bukunya (bisa diedit; unik per buku).
  part_number INT NULL,
  article MEDIUMTEXT NOT NULL,
  article_status VARCHAR(32) NOT NULL DEFAULT 'belum',
  visual_status VARCHAR(64) NOT NULL DEFAULT 'belum',
  panel_status VARCHAR(32) NOT NULL DEFAULT 'belum',
  production_status VARCHAR(32) NOT NULL DEFAULT 'belum',
  instagram_status VARCHAR(32) NOT NULL DEFAULT 'belum',
  -- Post IG carousel lewat NC-WA: status mengikuti NC-WA (processing → published/unknown/failed).
  post_status VARCHAR(32) NOT NULL DEFAULT 'belum',
  post_request_id VARCHAR(64) NULL,
  post_media_id VARCHAR(64) NULL,
  -- Status Reels IG (job REELS_IG) dari NC-WA, terpisah dari carousel.
  reels_status VARCHAR(32) NOT NULL DEFAULT 'belum',
  reels_request_id VARCHAR(64) NULL,
  reels_media_id VARCHAR(64) NULL,
  revision INT NOT NULL DEFAULT 0,
  preview MEDIUMTEXT NULL,
  report MEDIUMTEXT NULL,
  -- Quote 2 kalimat dari kelima paragraf (job QUOTE).
  quote TEXT NULL,
  -- Gambar quote (job QUOTE_IMAGE): {style,file,renderedAt}.
  quote_image TEXT NULL,
  -- Audio per kalimat (job TTS_KALIMAT): kalimat_NN.mp3 di output/audio-kalimat/<id>/.
  sentence_audio TEXT NULL,
  -- Video per kalimat (job VIDEO_KALIMAT): output/video-kalimat/<id>/.
  sentence_video TEXT NULL,
  -- Video per kalimat horizontal 1920×1080 (job VIDEO_KALIMAT_H): output/video-kalimat-h/<id>/.
  sentence_video_h TEXT NULL,
  -- Manifest panel PNG hasil render (output/panels/<id>/).
  panels MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- active_key hanya terisi untuk job queued/running sehingga satu bab
-- tidak bisa punya dua job aktif berjenis sama.
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  state VARCHAR(16) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  lease BIGINT NOT NULL DEFAULT 0,
  revision INT NOT NULL,
  -- 1 = regenerate: stok gambar dibuat baru tanpa mencocokkan kolam.
  force_new TINYINT NOT NULL DEFAULT 0,
  error TEXT NULL,
  active_key VARCHAR(64) AS (
    IF(state IN ('queued', 'running'), CONCAT(chapter_id, ':', kind), NULL)
  ) STORED,
  UNIQUE KEY active_job (active_key),
  KEY jobs_state (state),
  KEY jobs_chapter (chapter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  file VARCHAR(500) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL,
  prompt TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY assets_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chapter_stock (
  chapter_id INT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  panel TINYINT NOT NULL,
  asset_id INT NOT NULL,
  PRIMARY KEY (chapter_id, kind, panel),
  KEY chapter_stock_asset (asset_id),
  CONSTRAINT chapter_stock_asset_fk FOREIGN KEY (asset_id) REFERENCES assets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pengaturan konten per judul buku (kunci = judul buku dinormalisasi:
-- spasi dirapikan, huruf kecil). Buku tanpa baris memakai pengaturan bawaan.
CREATE TABLE IF NOT EXISTS book_settings (
  book_key VARCHAR(255) NOT NULL PRIMARY KEY,
  settings TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
