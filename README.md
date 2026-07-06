# Sankalp — AI-Powered Digital Wealth Relationship Manager & Banking Assistant

Sankalp is a production-quality, simulation-first banking prototype built for a Banking AI Wealth Advisory Hackathon. It features a hybrid intelligence system combining a **Rule & Analytics Engine** with a **Generative LLM (Gemini)** to act as a trusted personal banker, wealth advisor, and financial relationship manager.

---

## 🚀 Key Features

### 1. 🤖 Context-Aware Conversational Banking (NLP)
* **Empathy & Tone Alignment**: Sankalp adjusts its conversational tone based on the user's profile and financial state (neutral/supportive/empathetic).
* **Interactive Action Buttons & Chips**: Sankalp suggests context-aware options (like quick reply buttons) dynamically rendered under messages. Critical operations (transfers, FD setup, goal deletion) request confirmation and render `["Yes, proceed", "Cancel"]` buttons.
* **Unified Default Fallback**: If LLM execution is interrupted, Sankalp returns a clean, uniform fallback offering support routing and interactive retries instead of failing silently.
* **Language Support**: Fully responsive in English, Hindi, and Marathi based on user preferences.

### 2. 💳 Conversational Banking Operations
* **Fund Transfers**: Deducts money from the savings balance and logs it in the transaction ledger.
* **Bill & EMI Payments**: Handles recurring bill allocations and EMIs.
* **Debit Card Control**: Dynamically freezes, unfreezes, or blocks cards.
* **Fixed Deposits (FD)**: Opens FDs, deducts initial amounts from savings, and creates entries in the portfolio.

### 3. 🎯 Goals Management Lifecycle & Conflict Resolution (Dual Sync UI + Chat)
* **Goal Operations**: Create, edit, delete, complete, and archive goals through both the natural language chat interface and the Settings/Goals UI.
* **Status States**: Supports `Active`, `Paused`, `Completed`, and `Archived` goals.
* **Auto-Balance Funding**: Adding funds to a goal automatically debits your savings balance and inserts a transaction log; reducing/deleting a goal refunds the money back to your account.
* **Goal Conflict Resolver**: If active goal plans require more monthly savings than your monthly surplus income, Sankalp raises an interactive warning card inline with buttons to `[ Extend Target Dates ]` or `[ Talk to Advisor ]`.

### 4. 📈 Intelligent Portfolio Analytics & Proactive Nudges
* **Context-Aware Inline Widgets**: Rather than static headers, premium cards (Wellness Score, Goal Progress, Drawdown recommendations, Asset Allocation charts) render inline directly under the AI chat bubble that discusses them, matching query context.
* **Proactive Nudge Welcome**: On loading the chat, Sankalp scans for high-priority alerts (like missed SIPs or idle balance) and dynamically tailors its greeting to address the issue, offering direct action buttons (like `[ Review SIP ]`).
* **Active Nudge Feed Integration**: Clicking the Action Button on any dashboard nudge immediately routes you to the chat screen and opens a personalized dialogue resolving that specific nudge.

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

### Self-Healing Simulated Clock & Date Synchronizer
To ensure that date validation checks (e.g. "target date must be in the future") and SIP triggers remain fully functional in a simulation environment, the backend implements:
* **Dynamic Year Resolution**: Injects the current calendar date into the Gemini prompt context, allowing relative date inputs (like *"next year August"*) to resolve accurately (e.g., to August 2027 instead of past dates).
* **Automatic Database Calendar Shift**: On server boot, the database checks the gap between the latest transaction date and today's date. It dynamically shifts all past transaction timestamps, goal targets, and log events forward to align with the current date, maintaining realistic simulation timelines.

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
