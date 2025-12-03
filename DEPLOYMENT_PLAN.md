# Deployment Plan (Simplest Path: ECS Backend + S3 Static Frontend + S3 Artifacts, No DB/EFS)

This trims prerequisites: no database, no EFS, no frontend ECS service. The backend runs on ECS Fargate; the frontend is exported to static files on S3 (optionally fronted by CloudFront). Artifacts (uploads, EPUBs, flashcards) live in S3. State uses manifest mode; jobs are transient (restart loses in-flight jobs).

## Prerequisites
- AWS VPC with 2 public subnets (for ALB) and 2 private subnets (for ECS tasks) plus NAT for outbound internet.
- ACM certificate for `api.yourdomain.com` in the ALB region.
- ACM certificate for `app.yourdomain.com` (if using CloudFront, cert must be in `us-east-1`).
- AWS CLI with rights for ECR, ECS, S3, ACM, IAM, CloudWatch Logs, and Route 53 (or your DNS provider).

## Frontend (Static)
- Build and export: `cd frontend && npm ci && NEXT_PUBLIC_API_BASE=https://api.yourdomain.com npm run build && npx next export -o out`.
- Host `out/` on S3 (static website hosting). Optional: front with CloudFront for HTTPS and caching.
- If using CloudFront: origin = S3 website endpoint, attach `app.yourdomain.com` cert (in `us-east-1`), create a CNAME `app.yourdomain.com` → CloudFront. If skipping CloudFront, use S3 website endpoint directly (less ideal for HTTPS/custom domain).

## Backend (ECS Fargate)
- ECR: create `book-translator-backend`, build/push:
  - `docker build -t <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-backend:latest ./backend`
  - `docker push <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-backend:latest`
- Task definition (Fargate):
  - Image: backend ECR.
  - CPU/mem: start 0.5 vCPU / 1–2 GB.
  - Port: 8000.
  - Env vars (SSM/Secrets Manager recommended):
    - `STORAGE_BACKEND=s3`
    - `S3_BUCKET=book-translator-artifacts`
    - `S3_ENDPOINT=https://s3.amazonaws.com` (or blank for AWS default)
    - `S3_ACCESS_KEY`, `S3_SECRET_KEY` only if not using IAM; else rely on task role
    - `TRANSLATOR_PROVIDER`, `OPENAI_API_KEY`
    - `MAX_PDF_MB`, `MAX_PAGES`, `TARGET_LANGS`
    - `DB_MODE=manifests` (no DB)
    - `CORS_ALLOW_ORIGINS=https://app.yourdomain.com`
  - Volumes: none (uses container-local `/data`; state is transient).
  - IAM: task role with S3 access (`Put/Get/Delete/List` on the artifacts bucket); execution role for pulls/logs.
  - Logs: CloudWatch Logs group (e.g., `/ecs/book-translator-backend`).
- Service (Fargate):
  - Desired count: 1–2.
  - Attach to ALB target group (port 8000), enable deployment circuit breaker.
- ALB:
  - Listener 443 with ACM cert for `api.yourdomain.com`.
  - Target group: backend on port 8000.
  - Health check: `HTTP:8000/healthz`.
  - Security groups: ALB allow 80/443 from internet; backend tasks allow inbound from ALB SG on 8000.

## Storage (S3)
- Create bucket `book-translator-artifacts` (block public access). Holds uploads and generated EPUB/flashcards.
- IAM for backend task role: `s3:PutObject/GetObject/DeleteObject/ListBucket` on `arn:aws:s3:::book-translator-artifacts/*`.

## DNS and TLS
- `api.yourdomain.com` → ALB (A/AAAA alias). TLS via ACM on ALB.
- `app.yourdomain.com` → CloudFront distribution (recommended) or S3 website endpoint if skipping CloudFront.

## Validation
- `https://api.yourdomain.com/healthz` → 200.
- From the deployed static site, upload a small PDF; watch status updates; confirm artifacts appear in the S3 bucket.
- Verify `/api/jobs/{id}` polling from the public frontend (CORS/routing).
- Check CloudWatch logs for backend; ALB target health is green.

## Operations
- Deploy new backend image tags and `force-new-deployment` on the ECS service.
- Autoscaling (optional) on CPU or ALB 5xx alarms.
- Accept that in-flight jobs are lost on task restart (manifest mode, no DB). If persistence is needed later, move to RDS or reintroduce EFS + SQLite.
