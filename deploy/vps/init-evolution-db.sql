-- Executado uma vez pelo Postgres na primeira subida (docker-entrypoint-initdb.d).
-- A Evolution API v2 precisa de um banco próprio, separado do RT Finance.
SELECT 'CREATE DATABASE evolution'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
