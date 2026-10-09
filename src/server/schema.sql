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

-- Cron independen per buku/jenis; last_tick mengunci eksekusi per menit lintas worker.
CREATE TABLE IF NOT EXISTS book_cron (
  book_key VARCHAR(255) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 0,
  expression VARCHAR(100) NOT NULL DEFAULT '0 9 * * *', -- kolom legacy, tidak lagi dipakai
  interval_hours INT NOT NULL DEFAULT 24,
  next_run BIGINT NULL,
  last_tick BIGINT NULL,
  last_result TEXT NULL,
  PRIMARY KEY (book_key, kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tahap artikel berita terpisah dari data dan antrean produksi buku.
CREATE TABLE IF NOT EXISTS news_articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(32) NOT NULL DEFAULT 'teknologi',
  state VARCHAR(16) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  lease BIGINT NOT NULL DEFAULT 0,
  title VARCHAR(500) NOT NULL,
  article MEDIUMTEXT NOT NULL,
  source_url TEXT NULL,
  source_hash CHAR(64) NULL,
  candidates MEDIUMTEXT NULL,
  artifacts MEDIUMTEXT NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY news_source (source_hash),
  KEY news_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS news_content_settings (
 category VARCHAR(32) PRIMARY KEY,
 settings TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS news_media_jobs (
 id INT AUTO_INCREMENT PRIMARY KEY,
 news_id INT NOT NULL,
 revision INT NOT NULL,
 kind VARCHAR(32) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued',
 attempts INT NOT NULL DEFAULT 0,
 lease BIGINT NOT NULL DEFAULT 0,
 force_new TINYINT NOT NULL DEFAULT 0,
 settings TEXT NOT NULL,
 error TEXT NULL,
 active_key VARCHAR(80) AS (IF(state IN ('queued','running'),CONCAT(news_id,':',kind),NULL)) STORED,
 UNIQUE KEY news_media_active(active_key),
 KEY news_media_state(state), KEY news_media_owner(news_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS news_media_outputs (
 news_id INT NOT NULL,
 revision INT NOT NULL,
 kind VARCHAR(32) NOT NULL,
 data MEDIUMTEXT NOT NULL,
 PRIMARY KEY(news_id,revision,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS news_stock (
 news_id INT NOT NULL,
 revision INT NOT NULL,
 kind VARCHAR(32) NOT NULL,
 panel INT NOT NULL,
 asset_id INT NOT NULL,
 PRIMARY KEY(news_id,revision,kind,panel),
 KEY news_stock_asset(asset_id),
 CONSTRAINT news_stock_asset_fk FOREIGN KEY(asset_id) REFERENCES assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS news_cron (
 category VARCHAR(32) NOT NULL,
 kind VARCHAR(32) NOT NULL,
 enabled TINYINT NOT NULL DEFAULT 0,
 interval_hours INT NOT NULL DEFAULT 24,
 next_run BIGINT NULL,
 last_tick BIGINT NULL,
 last_result TEXT NULL,
 PRIMARY KEY(category,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Riwayat publikasi Zernio; fingerprint mencegah pengiriman ganda per video/akun.
CREATE TABLE IF NOT EXISTS zernio_publications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fingerprint CHAR(64) NOT NULL UNIQUE,
  source_key VARCHAR(190) NOT NULL,
  title VARCHAR(500) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  account_id VARCHAR(24) NOT NULL,
  post_id VARCHAR(24) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'submitting',
  result TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_prompts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference_key VARCHAR(64) NULL,
  reference_image VARCHAR(40) NULL,
  logo_image VARCHAR(40) NULL,
  reference_images TEXT NULL,
  kind VARCHAR(16) NOT NULL,
  image_type VARCHAR(16) NOT NULL DEFAULT 'illustration',
  name VARCHAR(190) NOT NULL,
  prompt MEDIUMTEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lab_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reference_key VARCHAR(64) NULL,
  reference_image VARCHAR(40) NULL,
  logo_image VARCHAR(40) NULL,
  reference_images TEXT NULL,
  resolved_prompt MEDIUMTEXT NULL,
  kind VARCHAR(16) NOT NULL,
  image_type VARCHAR(16) NOT NULL DEFAULT 'illustration',
  name VARCHAR(190) NOT NULL,
  prompt MEDIUMTEXT NOT NULL,
  input TEXT NOT NULL,
  orientation VARCHAR(16) NOT NULL DEFAULT 'bebas',
  state VARCHAR(16) NOT NULL DEFAULT 'queued',
  lease BIGINT NOT NULL DEFAULT 0,
  result MEDIUMTEXT NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  KEY lab_queue(state,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_types (
 id INT AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(190) NOT NULL,
 engine VARCHAR(16) NOT NULL,
 outputs TEXT NOT NULL,
 settings TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO content_types(id,name,engine,outputs) VALUES
 (1,'Buku','book','["ARTICLE","QUOTE","QUOTE_IMAGE","IMAGES_PANEL","IMAGES_VIDEO","TTS_KALIMAT","VIDEO_KALIMAT","VIDEO_KALIMAT_H","PANEL"]'),
 (2,'Berita','news','["ARTICLE","POST_IMAGE","IMAGES_PANEL","IMAGES_VIDEO","TTS_KALIMAT","VIDEO_KALIMAT","VIDEO_KALIMAT_H","PANEL"]');

CREATE TABLE IF NOT EXISTS lab_images (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'reference',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
