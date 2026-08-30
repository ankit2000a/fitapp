# 🏋️ FitApp — AI-Powered Nutrition, Health & Activity Platform

FitApp is a modern, camera-first AI nutrition logger, health habit builder, and predictive wellness platform built with **React Native (Expo)**, **Google Gemini (Vertex AI)**, and **Supabase**.

🎥 **Demo Video**: [Watch Demo on YouTube Shorts](https://www.youtube.com/shorts/ybK62dCJphM)


---

## 🌟 Key Features

- 📸 **AI Photo & Label Recognition**: Scan meal photos or nutrition facts labels to instantly log calories, protein, carbs, fat, ingredients, and food quality scores.
- 🔮 **Future You AI Projections**: Real-time AI forecasting that visualizes long-term health impact and projected body metric outcomes based on daily consistency.
- ⚡ **HealthKit / Apple Health Sync**: Auto-import steps, active energy burned, workouts, sleep metrics, and heart rate without manual entry.
- 🏆 **FitApp Pulse Social & Gamification**: Live community leaderboards, streaks, weekly challenges, achievement badges, and activity feeds.
- 🔒 **Secure Architecture**: Server-side proxy authentication, rate limiting, and zero hardcoded API keys.

---

## 📁 Repository Architecture

```
FitApp/
├── fitapp/          # Expo / React Native Mobile Application (iOS & Android)
├── website/         # Product Landing Page Web Application
├── supabase/        # Supabase Edge Functions (gemini-proxy) & Database Schema
├── vertex-proxy/    # Express Cloud Run Proxy Server for Google Vertex AI Gemini
└── scratch/         # Database migrations, RLS policies & setup scripts
```

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Mobile App** | React Native, Expo (v55), TypeScript, React Navigation |
| **AI Processing** | Google Vertex AI (Gemini 3.1 Flash), Supabase Edge Functions |
| **Backend & Auth** | Supabase (PostgreSQL, Row-Level Security, Edge Functions) |
| **Integrations** | Apple HealthKit (`react-native-health`), OpenFoodFacts API |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo Go app](https://expo.dev/go) or Xcode / Android Studio for local development

### 1. Environment Setup

Copy `.env.example` to `.env` in both the root directory and inside `fitapp/`:

```bash
cp .env.example .env
cp .env.example fitapp/.env
```

Fill in your client-side Supabase credentials:
```env
EXPO_PUBLIC_SUPABASE_URL=https://your-supabase-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Run Mobile Application

```bash
cd fitapp
npm install
npx expo start
```

Press `i` to launch in the iOS Simulator, `a` for Android Emulator, or scan the QR code with **Expo Go**.

### 3. Server-Side AI Proxy Setup

#### Vertex AI Cloud Run Proxy (`vertex-proxy/`)
```bash
cd vertex-proxy
npm install
# Set GCP_PROJECT_ID and PROXY_TOKEN in environment variables
npm start
```

#### Supabase Edge Function (`supabase/functions/gemini-proxy`)
```bash
supabase functions deploy gemini-proxy
```

---

## 🔐 Security & Privacy

- **Zero Hardcoded Secrets**: All private keys and service tokens are passed via server-side environment variables.
- **Client Key Isolation**: Mobile apps only utilize the public Supabase Anon key, protected by strict Row-Level Security (RLS) policies in PostgreSQL.

---

## 📜 License

This project is open-source under the [MIT License](LICENSE).
