-- ============================================================
-- File Merger Agent - PostgreSQL Database Setup
-- Run this file ONCE before starting the backend
-- Command: psql -U postgres -f init_db.sql
-- ============================================================

-- Step 1: Create the database
CREATE DATABASE file_merger_db;

-- Step 2: Connect to the new database
\c file_merger_db

-- Step 3: Create the history table
CREATE TABLE IF NOT EXISTS merge_history (
    id              SERIAL PRIMARY KEY,
    session_name    VARCHAR(255)    NOT NULL,
    input_files     JSONB           NOT NULL,
    output_format   VARCHAR(20)     NOT NULL,
    output_filename VARCHAR(255)    NOT NULL,
    output_path     TEXT            NOT NULL,
    file_count      INTEGER         NOT NULL DEFAULT 1,
    created_at      TIMESTAMP       DEFAULT NOW()
);

-- Step 4: Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_merge_history_created_at ON merge_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merge_history_format     ON merge_history (output_format);

-- Confirmation message
SELECT 'Database file_merger_db created and table merge_history ready!' AS status;
