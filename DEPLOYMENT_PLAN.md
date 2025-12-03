# Deployment Plan (Beginner-Friendly) — Lean Path + POC Shortcut

This explains the simplest ways to get your app running on AWS, assuming you have little AWS experience. It covers how to get the prerequisites, then two deployment modes:
- **Lean (more polished):** Backend on ECS Fargate behind an ALB with HTTPS and a custom domain; static frontend on S3 (optionally via CloudFront) with a custom domain; artifacts in S3; manifest mode (no DB/EFS).
- **POC (fastest to see it work):** No custom domain, no TLS, use the default VPC, give the backend task a public IP, static frontend on S3, and call the backend over plain HTTP using the task IP (or an HTTP-only ALB DNS).

The code already supports: FastAPI backend on port 8000, static Next.js export with configurable `NEXT_PUBLIC_API_BASE`, S3 artifacts, manifest mode (`DB_MODE=manifests`).

---

## 0) Get the Prerequisites (step by step)

1) **Create and secure your AWS account**
   - Sign up at https://aws.amazon.com.
   - Turn on MFA for the root user.
   - In IAM, create an admin user (don’t use root daily). Create access keys for that user and store them in a password manager.

2) **Install and configure the AWS CLI**
   - macOS: `brew install awscli` (or use the AWS installer). Windows: AWS CLI MSI installer.
   - Configure: `aws configure`
     - Enter Access Key ID and Secret from your IAM user.
     - Choose a default region, e.g., `us-east-1`.
     - Output format: `json`.
   - Verify: `aws sts get-caller-identity` (should return your account and user ARN).

3) **Create the S3 buckets**
   - In the AWS console → S3:
     - Create bucket `book-translator-artifacts` (block all public access). This holds uploads and generated EPUB/flashcards.
     - Create bucket `book-translator-web` for the static site. Enable static website hosting on this bucket. For the lean path, you can later put CloudFront in front; for POC you can use the website URL directly (HTTP).

4) **Set up IAM roles/policies for ECS**
   - Task execution role: use AWS-managed policy `AmazonECSTaskExecutionRolePolicy`.
   - Task role (backend): custom inline policy allowing `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on `arn:aws:s3:::book-translator-artifacts/*` and `arn:aws:s3:::book-translator-artifacts`.

5) **Decide your network approach**
   - **POC (easier):** Use the default VPC and its subnets. When creating the ECS service, enable “Assign public IP” so the task gets a public IP. Security group: allow inbound TCP 8000 from 0.0.0.0/0. Skip load balancer; call the task IP directly.
   - **Lean (more robust):** Use (or create) a VPC with 2 public + 2 private subnets and a NAT gateway. Backend tasks live in private subnets; an ALB in public subnets terminates HTTPS and forwards to port 8000.

6) **(Lean only) Get certificates and DNS**
   - ACM: request a public cert for `api.yourdomain.com` in the same region as your ALB. If using CloudFront for the frontend, request `app.yourdomain.com` in `us-east-1`.
   - Validate via DNS: ACM shows CNAMEs; add them in your DNS (Route 53 hosted zone or your registrar).
   - DNS: in Route 53, create `A/AAAA` aliases pointing `api.yourdomain.com` → ALB; `app.yourdomain.com` → CloudFront (or S3 website if you skip CloudFront).

7) **Install Docker locally (to build images)**
   - Install Docker Desktop or the Docker Engine for your OS.

---

## 1) Frontend (Static Export to S3)

1) Build and export with the correct API base:
   - Lean: `cd frontend && npm ci && NEXT_PUBLIC_API_BASE=https://api.yourdomain.com npm run build && npx next export -o out`
   - POC: `cd frontend && npm ci && NEXT_PUBLIC_API_BASE=http://<task-ip>:8000 npm run build && npx next export -o out` (replace `<task-ip>` after the backend is running; or use the ALB DNS if you add an HTTP-only ALB).

2) Upload to the website bucket:
   - `aws s3 sync out/ s3://book-translator-web/`
   - POC: use the S3 “Static website hosting” URL shown in the console (HTTP).
   - Lean: front it with CloudFront for HTTPS and your `app.yourdomain.com` hostname.

---

## 2) Backend (ECR → ECS Fargate)

1) Push image to ECR:
   - Create ECR repo `book-translator-backend`.
   - `aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <acct>.dkr.ecr.<region>.amazonaws.com`
   - `docker build -t <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-backend:latest ./backend`
   - `docker push <acct>.dkr.ecr.<region>.amazonaws.com/book-translator-backend:latest`

2) Create the ECS task definition (Fargate):
   - Container port: 8000.
   - CPU/mem: start with 0.5 vCPU / 1–2 GB.
   - Env vars:
     - `STORAGE_BACKEND=s3`
     - `S3_BUCKET=book-translator-artifacts`
     - `S3_ENDPOINT=https://s3.amazonaws.com` (or leave blank)
     - `TRANSLATOR_PROVIDER`
     - `OPENAI_API_KEY`
     - `MAX_PDF_MB`, `MAX_PAGES`, `TARGET_LANGS`
     - `DB_MODE=manifests`
     - `CORS_ALLOW_ORIGINS`:
       - Lean: `https://app.yourdomain.com`
       - POC: `*` (for quick testing)
   - IAM: attach the task role with S3 access; execution role for pulls/logs.
   - Logging: CloudWatch Logs group, e.g., `/ecs/book-translator-backend`.

3) Create the ECS service:
   - **POC mode:**
     - Launch type: Fargate.
     - Network: default VPC and subnets.
     - Assign public IP: Enabled.
     - Security group: inbound TCP 8000 from 0.0.0.0/0.
     - Desired count: 1 task.
     - No load balancer. After it starts, go to ECS → Tasks, copy the public IP, and test `http://<task-ip>:8000/healthz`.
   - **Lean mode:**
     - Launch type: Fargate.
     - Network: VPC with private subnets; do NOT assign public IP.
     - Security group: allow inbound 8000 from ALB SG.
     - Attach to ALB target group on port 8000. Health check: `/healthz`.
     - ALB in public subnets with HTTPS listener (443) using ACM cert for `api.yourdomain.com`.
     - Desired count: 1–2 tasks.

---

## 3) Storage (S3)

- Artifacts bucket: `book-translator-artifacts` (block public access). Backend reads/writes with IAM only.
- Website bucket: `book-translator-web` (public via static website hosting for POC, or private + CloudFront OAI for Lean).
- IAM: task role must have `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on the artifacts bucket.

---

## 4) DNS/TLS (Lean only; skip for POC)

- ACM: validated certs for `api.yourdomain.com` (ALB region) and `app.yourdomain.com` (if CloudFront, request in `us-east-1`).
- ALB: HTTPS listener 443 with the API cert; forward to backend target group on 8000.
- CloudFront (optional for frontend): origin = S3 website endpoint; attach `app.yourdomain.com` cert (in `us-east-1`).
- Route 53: `A/AAAA` alias `api.yourdomain.com` → ALB; `app.yourdomain.com` → CloudFront (or S3 website if you skip CloudFront).

---

## 5) Validation

- POC: `http://<task-ip>:8000/healthz` → 200. Open the S3 website URL for the frontend, upload a small PDF, see progress, confirm artifacts appear in the `book-translator-artifacts` bucket.
- Lean: `https://api.yourdomain.com/healthz` → 200. Visit `https://app.yourdomain.com`, upload a PDF, confirm artifacts in S3, and check job polling works.
- Logs: CloudWatch Logs (`/ecs/book-translator-backend`). ALB target health (Lean).

---

## 6) Operations

- Deploy new backend image tags, then update the ECS service (use `force-new-deployment`).
- Manifest mode means in-flight jobs are lost if the task restarts. For durability later, move to RDS or reintroduce EFS + SQLite.
- Optional: autoscaling on CPU or ALB 5xx (Lean).
