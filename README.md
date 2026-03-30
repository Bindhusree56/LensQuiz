# QuizLens

NLP-powered question paper analyzer with blockchain notarization.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Upload    │ ──▶ │  NLP API     │ ──▶ │  Blockchain │
│   Paper     │     │  (FastAPI)   │     │  (Solidity) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  PDF Report │     │   IPFS      │
                    │  Generator  │     │  (Storage)  │
                    └─────────────┘     └─────────────┘
```

## Features

- **Readability Analysis** — Flesch-Kincaid grade and score
- **Bloom's Taxonomy** — Cognitive level classification per question
- **Bias Detection** — Gender and cultural bias flags
- **Blockchain Notarization** — Immutable proof of document existence
- **Verification** — Verify any paper against the blockchain registry

## Prerequisites

- Node.js 18+
- Python 3.9+
- Ganache (or Hardhat node)
- MetaMask browser extension

## Setup

### 1. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
cd nlp
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 2. Start Ganache

1. Open Ganache GUI
2. Go to Settings → Server
3. Set **PORT NUMBER** to `8545`
4. Click **Restart Server**

### 3. Deploy Contract

```bash
npx truffle compile
npx truffle migrate --reset
```

Copy the deployed contract address.

### 4. Configure MetaMask

1. Open MetaMask
2. Add Network → Add a network manually
3. Fill in:
   - **Network name:** `Ganache Local`
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `1337`
   - **Currency symbol:** `ETH`

4. Import a Ganache account:
   - In Ganache, click "Show Keys" on any account
   - Copy the **Private Key**
   - In MetaMask: Import Account → paste key

### 5. Configure Frontend

1. Open `frontend/index.html` in a browser
2. Go to **Config** tab
3. Paste the contract address
4. Click **Save Config**

### 6. Start NLP Backend

```bash
cd nlp
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

## Usage

### Analyze a Paper

1. Go to the **Analyse** tab
2. Enter an exam title
3. Drag & drop a PDF, DOCX, or TXT file
4. Click **Run NLP Analysis**
5. Review readability, Bloom levels, and bias flags
6. Click **Notarize on Blockchain** to store the proof

### Verify a Paper

1. Go to the **Verify** tab
2. Drag & drop the same paper file
3. The SHA-256 hash is calculated automatically
4. Click **Verify on Blockchain** to check if it was notarized

## Project Structure

```
LensQuiz/
├── contracts/
│   └── QuizLens.sol      # Smart contract
├── frontend/
│   ├── index.html        # Main UI
│   └── contract_address.js  # Deployed address
├── migrations/
│   └── 1_initial_migration.js  # Truffle deployment
├── nlp/
│   ├── app.py            # FastAPI backend
│   └── analyzer.py       # NLP analysis logic
├── truffle-config.js     # Truffle configuration
└── .env.example          # Environment variables template
```

## Smart Contract

The `QuizLens.sol` contract stores:
- Paper hash (SHA-256 of raw file bytes)
- Report hash (SHA-256 of PDF report)
- Setter address
- Timestamp and block number
- Title

### Functions

- `notarize(paperHash, reportHash, title)` — Register a paper
- `verify(paperHash)` — Check if a paper is registered
- `merkleRoot()` — Current Merkle root
- `getLeafCount()` — Number of notarized papers

## API Endpoints

### POST /analyze

Upload a question paper for analysis.

**Request:**
- `file`: PDF, DOCX, or TXT file
- `title`: Exam title (optional)

**Response:**
```json
{
  "title": "CS Midterm 2024",
  "question_count": 20,
  "flesch_score": 52.3,
  "flesch_grade": 9.1,
  "readability_label": "Standard",
  "overall_bloom": "apply",
  "bias_summary": ["gender:masculine-default"],
  "paper_hash": "0x...",
  "report_hash": "0x...",
  "report_pdf_b64": "..."
}
```

## License

MIT
