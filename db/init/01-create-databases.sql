-- Runs ONCE, the first time the PostgreSQL container starts with an empty data volume.
-- Creates one database per service, each with its own login ("key").
-- Passwords are for local development only.

-- Project Service's cabinet
CREATE USER project_user WITH PASSWORD 'project_pass';
CREATE DATABASE projects_db OWNER project_user;

-- Crew Service's cabinet
CREATE USER crew_user WITH PASSWORD 'crew_pass';
CREATE DATABASE crews_db OWNER crew_user;

-- By default every user may connect to every database. Take that away,
-- so each service can open only its own cabinet (owners keep access).
REVOKE CONNECT ON DATABASE projects_db FROM PUBLIC;
REVOKE CONNECT ON DATABASE crews_db FROM PUBLIC;
