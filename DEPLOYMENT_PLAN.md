# Deployment Plan (AWS ECS Fargate + S3 + EFS + ALB)

This plan is tailored to the current repository setup:
- Backend FastAPI container (`backend/Dockerfile`) on port **8000**, storing state under `/data` (SQLite + manifests), with built-in S3 support via `STORAGE_BACKEND=s3`.
- Frontend Next.js container (`frontend/Dockerfile`) on port **3000**, proxying `/api/*` to the backend; `NEXT_PUBLIC_API_BASE` must point to the backend URL.
- Local artifacts and DB currently live under `data/`; for durability in AWS we will mount EFS at `/data`. Uploaded PDFs and generated EPUB/CSV will live in S3.

## Prerequisites
- AWS account with a VPC: at least 2 public subnets (for ALB) and 2 private subnets (for ECS tasks) plus NAT for outbound internet.
- ACM certificates issued in the deployment region for `api.yourdomain.com` and `app.yourdomain.com`.
- AWS CLI configured with rights for ECR, ECS, EFS, S3, ACM, IAM, CloudWatch Logs, and Route 53 (or your DNS provider).

## Build and Push Images (ECR)
- Create two ECR repos: `book-translator-backend`, `book-translator-frontend`.
- Backend:
  - `docker build -t <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-backend:latest ./backend`
  - `docker push <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-backend:latest`
- Frontend:
  - Build with `NEXT_PUBLIC_API_BASE=https://api.yourdomain.com` (ARG/ENV already present in `frontend/Dockerfile`).
  - `docker build -t <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-frontend:latest ./frontend`
  - `docker push <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-frontend:latest`
- Tag strategy: keep `:latest` plus an immutable tag (e.g., git SHA) for rollbacks.

## Storage (S3)
- Create S3 bucket `book-translator-artifacts` (block public access). This holds uploads and generated EPUB/flashcards.
- Optional logging bucket (e.g., `book-translator-logs`) if you want access logs.
- IAM policy for backend task role: allow `s3:PutObject/GetObject/DeleteObject/ListBucket` on `arn:aws:s3:::book-translator-artifacts/*`.

## Persistent State (EFS)
- Create an EFS filesystem with mount targets in private subnets.
- Add an access point (e.g., `/data`) with POSIX ownership matching the container user (root is acceptable with current Dockerfile).
- Security group: allow NFS (2049) from ECS tasks to EFS.
- Mount EFS at `/data` in the backend task. Set `DB_URL=sqlite+aiosqlite:////data/app.db`; manifests/uploads also stay under `/data`.

## Networking and Load Balancing
- ALB in public subnets with two target groups:
  - `/api/*` → backend target group on port **8000**.
  - `/*` → frontend target group on port **3000**.
- Security groups:
  - ALB: allow 80/443 from internet.
  - Backend tasks: allow inbound from ALB SG on 8000.
  - Frontend tasks: allow inbound from ALB SG on 3000.
- Health checks: backend `HTTP:8000/healthz`; frontend `HTTP:3000/` (or another simple path that returns 200).

## ECS Fargate Services
- Cluster: one ECS cluster for both services.
- Backend task definition:
  - Image: backend ECR image.
  - CPU/memory: start with 0.5 vCPU / 1–2 GB.
  - Port mapping: 8000.
  - Env vars (SSM/Secrets Manager recommended):
    - `STORAGE_BACKEND=s3`
    - `S3_BUCKET=book-translator-artifacts`
    - `S3_ENDPOINT=https://s3.amazonaws.com` (or blank)
    - `S3_ACCESS_KEY`, `S3_SECRET_KEY` only if not using IAM; otherwise omit and rely on task role
    - `TRANSLATOR_PROVIDER`, `OPENAI_API_KEY`
    - `MAX_PDF_MB`, `MAX_PAGES`, `TARGET_LANGS` (mirror `.env.example`)
    - `DB_MODE=sqlite`
    - `DB_URL=sqlite+aiosqlite:////data/app.db`
    - `CORS_ALLOW_ORIGINS=https://app.yourdomain.com`
  - Volume: mount EFS access point at `/data`.
  - IAM: task role with S3 permissions; execution role for image pulls/logs.
  - Logs: send to CloudWatch Logs (e.g., `/ecs/book-translator-backend`).
- Backend service:
  - Desired count: 1–2.
  - Attach to backend target group; enable deployment circuit breaker.
- Frontend task definition:
  - Image: frontend ECR image.
  - CPU/memory: start with 0.25 vCPU / 0.5–1 GB.
  - Port: 3000.
  - Env: `NEXT_PUBLIC_API_BASE=https://api.yourdomain.com`.
  - Logs: `/ecs/book-translator-frontend`.
- Frontend service:
  - Desired count: 1–2.
  - Attach to frontend target group.

## TLS and DNS
- Attach ACM certs to ALB HTTPS listener (443).
- DNS records:
  - `api.yourdomain.com` → ALB (backend target group on `/api/*`).
  - `app.yourdomain.com` → ALB (frontend target group on `/`).
- If later moving frontend to S3/CloudFront, repoint `app.yourdomain.com` to CloudFront while keeping `api` on ALB.

## Validation After Deploy
- `https://api.yourdomain.com/healthz` returns 200.
- Upload a small PDF via UI; observe status updates; confirm artifacts appear in `book-translator-artifacts`.
- Poll `/api/jobs/{id}` from the public frontend to verify CORS/routing.
- Check CloudWatch logs for both services; ensure ALB target health is green.

## Rollout and Operations
- Deploy with new image tags; update ECS services with `force-new-deployment`.
- Consider autoscaling on CPU or ALB 5xx alarms.
- Backups: if staying on SQLite, enable EFS backup; plan future migration to managed DB if needed.
- Monitoring: CloudWatch alarms on 5xx, latency, and task restarts.
