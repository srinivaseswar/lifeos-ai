# LifeOS AI ⚡
> **Your Life. Smarter with AI.**
> A personalized, privacy-first AI scheduling and productivity operating system tailored for **Students**, **Working Professionals**, and **Senior Citizens**.

---

## 🌟 Overview & Key Capabilities

LifeOS AI bridges the gap between everyday communication and schedule management. Instead of manually copying dates, times, and tasks into calendars, LifeOS automatically extracts actionable reminders from your **SMS messages**, **WhatsApp chats**, **Photos & documents**, and **Calls** with your explicit consent.

### 1. 💬 SMS, WhatsApp, Photos, and Calls Integration
- **SMS & Calls**: Background sync via the native Android companion app or instant paste / simulation in the web app.
- **WhatsApp**: Intercepted securely in Android via `NotificationListenerService` or captured via quick paste / chat export upload in the web app.
- **Photos & Documents**: Upload prescription cards, appointment slips, bill receipts, event flyers, or chat screenshots. The AI OCR engine extracts dates, times, and context automatically.
- **Privacy & Granular Permissions**: Every channel (SMS, Call, WhatsApp, Photos, Email, Notes) can be individually enabled or disabled in **Settings & Privacy**. Disabled channels are strictly blocked from capture.
- **Sensitive Code Scrubbing**: Verification codes (OTPs), PINs, passwords, and CVVs are automatically detected and **discarded immediately** — they are never stored or scheduled.

### 2. 🤖 AI-Powered Smart Scheduling
- **Intelligent Classification**: Differentiates genuine actionable tasks from noise and chit-chat.
- **Promotional Noise Filter**: Marketing offers, coupon codes, and spam messages are silenced into the muted log and excluded from your active schedule.
- **Contextual Categorization**: Automatically tags items into **Health**, **Payment/Bill**, **Deadline**, **Meeting or Call**, or **General**.
- **Priority Detection**: High priority (`h`) for urgent medical checkups and critical deadlines; Medium (`m`) for meetings and work tasks; Low (`l`) for general reminders.
- **AI Schedule Optimizer ("Apply to My Schedule")**:
  - **🎓 Students (Spark)**: Adds focused 30-minute revision blocks before classes and exams.
  - **💼 Professionals (Prime)**: Prioritizes deadlines and reserves end-of-day follow-up blocks.
  - **🌿 Seniors (Care)**: Gentle routine reminders for family calls, hydration, and evening strolls.

### 3. 👤 User Authentication & Data Isolation
- **Private Accounts**: Every user registers with their own name, email, password (bcrypt hashed), and module choice.
- **Clean Start**: Every newly registered user starts with a completely empty, private workspace.
- **Zero Predefined / Hardcoded Accounts**: All user data, schedules, captures, and AI chats are isolated via secure JWT authentication.

### 4. 🎨 Three Tailored Experiences
1. **LifeOS Spark (Juniors & Students)**: Focus habits, exam prep, assignment tracking, study timers.
2. **LifeOS Prime (Working Adults)**: Deadline management, client calls, standups, and productivity.
3. **LifeOS Care (Senior Citizens)**: High-contrast large text, medicine reminders, family call prompts, and simplified screens.

---

## 🏗️ System Architecture

```
User (Web Browser / Android Companion)
   │
   ▼
Frontend (Brutalist Responsive SPA — HTML5, CSS3, Space Grotesk, Vanilla JS)
   │
   ▼ REST API + JWT Auth
Node.js + Express Production Server
   │
   ├── AI Scheduling & NLP Engine (Privacy scrubbing, classification, prioritization)
   ├── OCR / Document Engine (Tesseract & Image Extraction)
   ├── Companion Sync API (Android SMS, Call & WhatsApp Notification Sync)
   │
   ▼ Dual-Mode Persistent Database
MongoDB Cluster (Production) ◄──► Persistent JSON Store (Local zero-config fallback)
```

---

## 🚀 Quick Start (Local Execution)

### Prerequisites
- Node.js v18+ (tested on Node v20/v24)
- npm or pnpm

### 1. Install & Start
```bash
# Clone or navigate to the directory
cd lifeos-ai

# Install dependencies
cd backend && pnpm install

# Start the unified server
node server.js
```

Open your browser at **`http://localhost:5000`**.

---

## 🐳 Production Deployment (Docker & Cloud)

### Option A: Docker Compose (Recommended for VPS / Cloud Server)
Deploy full-stack LifeOS with MongoDB in a single command:
```bash
docker-compose up -d --build
```
This launches:
- LifeOS App on `http://localhost:5000`
- MongoDB on `mongodb://localhost:27017` with persistent volumes.

### Option B: Render Deployment (Free Web Service)
1. Push this repository to GitHub.
2. Log into [Render.com](https://render.com) and click **New > Blueprint**.
3. Select your repository. Render automatically reads `render.yaml` and deploys the web service.

### Option C: Railway / Fly.io / AWS ECS
Deploy using the included `Dockerfile`:
```bash
docker build -t lifeos-ai .
docker run -p 5000:5000 -e JWT_SECRET=your_jwt_secret lifeos-ai
```

---

## 📱 Android Companion App Setup

The native Android companion app is located in `android/`:
- **SMS Receiver (`SmsReceiver.kt`)**: BroadcastReceiver for incoming SMS messages.
- **Phone State Receiver (`PhoneReceiver.kt`)**: Detects missed calls and prompts follow-up reminders.
- **Notification Listener (`NotificationListener.kt`)**: Intercepts WhatsApp message notifications with user consent (`BIND_NOTIFICATION_LISTENER_SERVICE`).
- **WebView Bridge (`MainActivity.kt`)**: Integrates directly with the LifeOS web interface and schedules alarms using Android's `AlarmManager`.

To build the APK:
```bash
cd android
./gradlew assembleRelease
```

---

## 📡 REST API Reference

### Authentication
- `POST /api/auth/register` — Create account `{ name, email, password, role }`
- `POST /api/auth/login` — Sign in `{ email, password }`
- `GET /api/auth/me` — Get current profile & permissions
- `PATCH /api/auth/settings` — Update permissions or AI configuration

### Schedule & Reminders
- `GET /api/tasks` — List tasks for authenticated user
- `POST /api/tasks` — Create new reminder `{ title, time, dateOffset, priority, category }`
- `PATCH /api/tasks/:id` — Update task status or fields `{ done: true }`
- `DELETE /api/tasks/:id` — Delete task

### Smart Capture & OCR
- `GET /api/captures` — Get captured activity log
- `POST /api/captures` — Analyze message `{ text, source }`
- `POST /api/captures/photo` — Upload photo/document with OCR & schedule extraction
- `DELETE /api/captures` — Clear capture log

### AI Assistant & Optimization
- `POST /api/ai/chat` — Conversational assistant with schedule grounding
- `POST /api/ai/optimize` — Proactive schedule optimizer
- `GET /api/ai/history` — Fetch chat history

### Companion Sync
- `POST /api/sync/android` — Batch sync from Android background receivers

---

## 🧪 Testing

Run the automated test suite:
```bash
npm test
```
Verifies health checks, authentication, data isolation, smart scheduling, promotional filtering, OTP security scrubbing, and photo uploads.
