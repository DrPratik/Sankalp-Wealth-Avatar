# Sankalp — AI-Powered Digital Wealth Relationship Manager & Banking Assistant

Sankalp is a production-quality, simulation-first banking prototype built for a Banking AI Wealth Advisory Hackathon. It features a hybrid intelligence system combining a **Rule & Analytics Engine** with a **Generative LLM (Gemini 3.1)** to act as a trusted personal banker, wealth advisor, and financial relationship manager.

---

## 🚀 Key Features

### 1. 🤖 Context-Aware Conversational Banking (NLP)
* **Empathy & Tone Alignment**: Sankalp adjusts its conversational tone based on the user's profile and financial state (neutral/supportive/empathetic).
* **Two-Step Transaction Confirmation**: For any critical transactions (e.g. transfers, card blocking), Sankalp summarizes the action and details, requests explicit confirmation, and only executes it when confirmed.
* **Language Support**: Fully responsive in English, Hindi, and Marathi based on user preferences.

### 2. 💳 Conversational Banking Operations
* **Fund Transfers**: Deducts money from the savings balance and logs it in the transaction ledger.
* **Bill & EMI Payments**: Handles recurring bill allocations and EMIs.
* **Debit Card Control**: Dynamically freezes, unfreezes, or blocks cards.
* **Fixed Deposits (FD)**: Opens FDs, deducts initial amounts from savings, and creates entries in the portfolio.

### 3. 🎯 Goals Management Lifecycle (Dual Sync UI + Chat)
* **Goal Operations**: Create, edit, delete, complete, and archive goals through both the natural language chat interface and the Settings/Goals UI.
* **Status States**: Supports `Active`, `Paused`, `Completed`, and `Archived` goals.
* **Auto-Balance Funding**: Adding funds to a goal automatically debits your savings balance and inserts a transaction log; reducing/deleting a goal refunds the money back to your account.
* **Investment Strategies**: Save for goals using different strategies:
  * Savings Account (Low Risk)
  * Fixed Deposit (Stable Yield)
  * Mutual Funds (Balanced Growth)
  * Equity Shares (High Risk)

### 4. 📈 Intelligent Portfolio Analytics & Nudge Feed
* **Risk Profile Alignment**: Evaluates asset allocations (Equity, Debt, Gold, Hybrid) against the user's risk profile (Conservative, Moderate, Aggressive) and recommends portfolio rebalancing.
* **Personalized Nudge Feed**: Generates automated, compliance-safe notifications for triggers like missed SIPs, off-track goals, cash surplus idle days, and cross-selling.
* **Cash Flow Forecasts & Planning Checks**: Identifies when active goal requirements exceed monthly surplus income, raising planning conflicts.
* **Financial Wellness Score**: Dynamically calculates a wellness index from 1-100.

---

## 🛠️ Architecture & Technology Stack

Sankalp utilizes a **Simulation-First, API-Ready Architecture**, allowing the business service layers to be easily swapped with real banking REST APIs in the future without changing the AI orchestrator or frontend components.

```
       [ React Frontend (Vite) ]
                  │ (HTTP JSON API)
                  ▼
         [ Express.js Backend ]
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [ Gemini API ]   [ Business Services Layer ]
                        │ (GoalService, BankingService, etc.)
                        ▼
               [ SQLite (sql.js Wasm) ]
```

### Backend (`/backend`)
* **Node.js & Express.js**: Handles routing and API endpoints.
* **Gemini 1.5 Flash / 2.0 / 3.1**: Used via the `@google/genai` SDK for intents and dialogue generation.
* **SQLite (sql.js)**: Runs in-memory WebAssembly SQLite with a debounced 100ms async persistence layer to avoid event-loop blocking.
* **Modular Business Services**:
  * `GoalService`: Core CRUD, status updates, and auto-funding deductions.
  * `BankingService`: Account operations, FD creation, and card states.
  * `PortfolioService`: Buying/selling stocks and mutual funds.
  * `AnalyticsService`: Forecasting, wellness scores, and SIP monitoring.
  * `complianceGuard`: Enforces regulatory constraints and injects disclaimers.

### Frontend (`/frontend`)
* **React & Vite**: Fast development and rendering.
* **Vanilla CSS**: Clean, premium dark mode glassmorphism interface.
* **Lucide React**: Vector iconography.

---

## ⚙️ Local Development Setup

### Prerequisites
* Node.js (version 20 or higher)
* Gemini API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/DrPratik/Sankalp-Wealth-Avatar.git
   cd Sankalp-Wealth-Avatar
   ```

2. Set up Backend environment variables:
   Create a `.env` file in the `backend/` directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=3001
   ```

3. Install dependencies and start the backend:
   ```bash
   cd backend
   npm install
   npm start
   ```

4. Install dependencies and start the frontend:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

5. Open your browser and navigate to `http://localhost:5173`.
