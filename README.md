# EduFlow

An AI-powered learning platform that transforms how students interact with educational content. Built for the DLW Hackathon.

## What it does

EduFlow takes your study materials and turns them into a personalized learning experience. Upload your notes, textbooks, or research papers, and the platform helps you learn through:

- **Smart Chat** - Ask questions about your materials and get contextual answers using RAG (retrieval-augmented generation)
- **Guided Learning** - AI generates interactive HTML lessons from your content, walking you through knowledge points step by step
- **Smart Solver** - Paste a problem and get a detailed, step-by-step solution with explanations
- **Question Generator** - Automatically create practice questions from your study materials
- **Deep Research** - Run multi-step research queries that synthesize information across sources
- **IdeaGen** - Brainstorm and explore ideas with AI assistance
- **Co-Writer** - Collaborative writing tool for essays, reports, and summaries
- **Knowledge Bases** - Organize your documents into searchable collections with vector embeddings
- **Notebooks** - Save and organize your learning sessions, solutions, and research

## Tech Stack

**Frontend:** Next.js 16, React 19, Tailwind CSS, Framer Motion

**Backend:** Python 3.10+, FastAPI, LightRAG, LlamaIndex

**AI:** OpenAI GPT models, text-embedding-3-small, KaTeX for math rendering

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- An OpenAI API key

### Setup

1. Clone the repo and install backend dependencies:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env and add your API keys
```

3. Install frontend dependencies:

```bash
cd web
npm install
```

4. Start the backend:

```bash
python src/api/run_server.py
```

5. Start the frontend:

```bash
cd web
npm run dev
```

6. Open http://localhost:3000

## Project Structure

```
├── src/
│   ├── api/          # FastAPI backend + WebSocket endpoints
│   ├── agents/       # AI agent modules (chat, solve, research, guide, etc.)
│   ├── services/     # RAG, embedding, TTS services
│   └── knowledge/    # Knowledge base management
├── web/
│   ├── app/          # Next.js pages (home, solver, research, guide, etc.)
│   ├── components/   # Shared UI components
│   └── lib/          # Utilities and API helpers
├── data/             # Knowledge base storage
└── config/           # Configuration files
```

## Team

Built by our team for the DLW Hackathon 2026.

## License

AGPL-3.0
