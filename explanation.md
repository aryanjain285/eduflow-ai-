# EduFlow AI: Adaptive Learning Through Multi-Agent Intelligence

---

## 1. Problem Statement

Students today spend significant time on digital learning platforms — online quizzes, MOOCs, self-practice tools, and lecture materials. These platforms capture rich interaction signals: question attempts, timestamps, scores, topic tags, and learning progression over time.

Despite this abundance of data, most students lack clear, actionable insight into their learning journey. Common unanswered questions include:

- **What concepts am I genuinely weak at** versus making careless mistakes?
- **Am I improving, stagnating, or regressing** over time?
- **What should I focus on** if I only have limited time to study?
- **Why do I repeatedly struggle** with the same type of question?
- **How well-calibrated is my confidence** — do I think I know something I actually don't?

Learning is non-linear. Students experience long gaps of inactivity, bursts of intensive revision, and rely on external resources beyond formal platforms. An effective learning system must adapt to these evolving patterns and provide trustworthy, personalized guidance over time.

### Why Existing Tools Fall Short

| Limitation | Impact |
|---|---|
| **No mastery modeling** — platforms show raw scores, not true understanding | Students confuse "saw it once" with "truly learned it" |
| **No forgetting model** — yesterday's quiz score is treated the same as last month's | Stale knowledge goes undetected |
| **No confidence calibration** — students are never told when they're overconfident | Overconfident students skip review and fail exams |
| **No actionable plans** — dashboards show data but don't tell you what to do next | Students waste time on topics they've already mastered |
| **No knowledge structure** — topics are flat lists, not interconnected concepts | Students miss prerequisite gaps |
| **Cloud-dependent** — user data lives on company servers | Privacy concerns; no offline access; vendor lock-in |

---

## 2. Our Solution: EduFlow AI

EduFlow AI is a **local-first, AI-powered adaptive learning platform** that models a student's evolving learning state using Bayesian Knowledge Tracing, cognitive science principles, and multi-agent AI orchestration — then translates that model into personalized, explainable, actionable guidance.

### Core Design Principles

1. **Model the learner, not just the content** — Every interaction updates a probabilistic model of what the student truly knows
2. **Explain everything** — Every mastery score, recommendation, and insight comes with a human-readable explanation of *why*
3. **Local-first, privacy-respecting** — All user data stays on the student's machine. Only LLM API calls leave the device
4. **Multi-agent intelligence** — Specialized AI agents collaborate through maker-checker patterns, not a single monolithic prompt
5. **Knowledge-grounded** — All AI outputs are grounded in the student's actual course materials through RAG and knowledge graphs

### Architecture Overview

```
+----------------------------------------------------------+
|                    Frontend (Next.js)                      |
|  Dashboard | Solver | Questions | Research | Guide | KG   |
+----------------------------------------------------------+
                          |  REST + WebSocket
+----------------------------------------------------------+
|                   Backend (FastAPI)                        |
|                                                           |
|  +------------------+  +------------------------------+  |
|  | Learning State   |  | Multi-Agent Orchestration     |  |
|  | Engine           |  |                               |  |
|  | - BKT Mastery    |  |  Solve (7 agents)             |  |
|  | - Forgetting     |  |  Research (6 agents)           |  |
|  | - Calibration    |  |  Question Gen (3 agents)       |  |
|  | - Velocity       |  |  Guided Learning (4 agents)    |  |
|  | - Study Plans    |  |  Co-Writer (2 agents)          |  |
|  +------------------+  |  IdeaGen (2 agents)            |  |
|                         +------------------------------+  |
|  +--------------------------------------------------+    |
|  | RAG Pipeline + Knowledge Graph                     |    |
|  | LightRAG | RAGAnything | Vector Search | GraphML   |    |
|  +--------------------------------------------------+    |
+----------------------------------------------------------+
                          |
+----------------------------------------------------------+
|              Local Storage (data/)                         |
|  Knowledge Bases | User Sessions | Notebooks | Analytics  |
+----------------------------------------------------------+
```

---

## 3. Adaptive Mastery Engine — The Core Model

The heart of EduFlow is a **multi-signal mastery computation** that goes far beyond raw quiz scores. For every topic a student interacts with, we compute a mastery score on a 0-100 scale by combining four independent, scientifically-grounded signals.

### 3.1 Signal 1: Bayesian Knowledge Tracing (0-55 points)

**What it measures:** The probability that a student has truly *learned* a concept, accounting for lucky guesses and careless slips.

**Why it matters:** A student who gets 3/4 questions right might have guessed one. BKT models this uncertainty explicitly.

**Algorithm:**
We implement the classic BKT model with four parameters:

| Parameter | Symbol | Value | Meaning |
|---|---|---|---|
| Prior knowledge | P(L₀) | 0.10 | Probability student already knows the topic |
| Learning rate | P(T) | 0.15 | Probability of transitioning from unlearned to learned per attempt |
| Guess rate | P(G) | 0.25 | Probability of guessing correctly without knowing |
| Slip rate | P(S) | 0.10 | Probability of answering incorrectly despite knowing |

**Update rules (per assessment):**

When the student answers **correctly**:
```
P(L|correct) = P(L) × (1 - P(S)) / [P(L) × (1 - P(S)) + (1 - P(L)) × P(G)]
```

When the student answers **incorrectly**:
```
P(L|incorrect) = P(L) × P(S) / [P(L) × P(S) + (1 - P(L)) × (1 - P(G))]
```

Then apply learning transition:
```
P(L_new) = P(L|evidence) + (1 - P(L|evidence)) × P(T)
```

**Adjustments:** Guess and slip rates are modified by question difficulty (hard questions have lower guess probability, higher slip tolerance) and question type (written answers have near-zero guess rate).

The final BKT probability (0.0-1.0) is scaled to a 0-55 point contribution, making it the dominant signal — you cannot reach "mastered" without demonstrating real understanding through assessments.

### 3.2 Signal 2: Engagement Credit (0-20 points)

**What it measures:** Non-assessment learning activities — reading, chatting about a topic, solving problems, researching.

**Why it matters:** A student who has studied a topic extensively but hasn't taken a quiz yet should get partial credit for engagement. This prevents the cold-start problem where active learners see 0% mastery.

**Formula:**
```
exposure_credit = min(num_non_assessment_interactions × 3, 20)
```

**Design choice:** Capped at 20 to ensure engagement alone cannot inflate mastery. A student with 20 chat sessions about calculus but zero quizzes will show ~20% mastery — clearly signaling "you've engaged, but we can't verify understanding yet."

### 3.3 Signal 3: Retention Modifier — Ebbinghaus Forgetting Curve (-15 to +15 points)

**What it measures:** How much of the learned material the student likely still remembers, based on time elapsed since last correct retrieval.

**Why it matters:** A student who aced a topic 3 weeks ago but hasn't reviewed it since is not at the same mastery level as one who reviewed yesterday. Memory decays predictably.

**Algorithm:**

We model memory strength using a stability-based forgetting curve inspired by Ebbinghaus and modern spaced repetition research:

```
stability = 2 + (num_correct_answers × 1.5)  [days]
retention = e^(-days_since_last_correct / stability)
```

Each correct retrieval increases memory stability, meaning well-practiced topics decay more slowly — matching the spaced repetition principle.

**Scoring tiers:**

| Days since last correct | Modifier |
|---|---|
| < 2 days | +15 (fresh in memory) |
| 2-7 days | +5 to +15 (scaled by retention) |
| 7-14 days | -5 to +5 (decaying) |
| > 14 days | -15 to -5 (significant decay) |

### 3.4 Signal 4: Confidence Calibration (-10 to +10 points)

**What it measures:** The alignment between a student's self-assessed confidence and their actual accuracy — a metacognitive signal.

**Why it matters:** Overconfident students are the most at-risk: they believe they know the material and skip review, then fail the exam. Underconfident students waste time over-studying topics they've already mastered.

**Algorithm:**
```
confidence_normalized = avg_confidence_rating / 5.0
calibration_score = 10 × (1 - 2 × |confidence_normalized - accuracy|)
```

| Scenario | Confidence | Accuracy | Calibration | Effect |
|---|---|---|---|---|
| Well-calibrated | 4/5 (80%) | 80% | +10 | Bonus: self-knowledge is accurate |
| Overconfident | 4.2/5 (84%) | 50% | -7 | Penalty: dangerously overconfident |
| Underconfident | 2/5 (40%) | 85% | -1 | Slight penalty: trust yourself more |

The system explicitly flags overconfidence and underconfidence per topic, providing targeted metacognitive feedback.

### 3.5 Final Mastery Computation

```
mastery = clamp(0, 100,
    bkt_score          +    // 0 to 55  — what you've proven
    exposure_credit    +    // 0 to 20  — how much you've engaged
    retention_mod      +    // -15 to +15 — how fresh the memory is
    calibration_mod         // -10 to +10 — how honest your confidence is
)
```

**Mastery levels:**

| Score | Level | Meaning |
|---|---|---|
| 80-100 | Mastered | Strong, verified understanding with good retention |
| 60-79 | Proficient | Solid understanding, minor gaps |
| 40-59 | Developing | Partial understanding, needs more practice |
| 20-39 | Beginner | Early stages, foundational work needed |
| 0-19 | Needs Attention | Significant gaps or complete inactivity |

### 3.6 Learning Velocity

Beyond static mastery, we track **velocity** — is the student improving, stable, or declining?

**Algorithm:** For topics with 4+ assessments, we split the assessment history into two halves and compare accuracy:
```
delta = recent_half_accuracy - earlier_half_accuracy
```

| Delta | State | Action |
|---|---|---|
| > +5% | Improving | Encourage continued practice |
| -5% to +5% | Stable | No significant trend |
| < -5% | Declining | Alert: something is going wrong |

For improving students, we extrapolate **sessions to mastery** — an estimate of how many more practice sessions are needed to reach 80% mastery.

### 3.7 Mastery Timeline

Every day the student is active, we compute a snapshot of cumulative average mastery across all studied topics. This produces a **mastery over time** chart showing:
- Daily mastery progression
- Topics studied per day
- Total interactions per day

This directly addresses the question: *"Am I improving, stagnating, or regressing over time?"*

---

## 4. Personalized Study Plan Generation

The system generates time-boxed study plans optimized for the student's current learning state.

### Priority Algorithm

For each topic, a priority score is computed:

```
base_priority = 100 - mastery_score    // Lower mastery = higher priority
```

Then multiplied by contextual boosters:

| Condition | Multiplier | Rationale |
|---|---|---|
| Overconfident (high confidence, low accuracy) | × 1.5 | Most dangerous gap — student doesn't know they're weak |
| Declining velocity | × 1.3 | Trend reversal needed |
| Studied but never assessed | × 1.2 | Can't verify understanding without testing |

### Activity Recommendations

Based on mastery level, different activities are prescribed:

| Mastery Range | Recommended Activity | Why |
|---|---|---|
| < 30% | Guided Learning | Build foundational understanding first |
| 30-60% | Practice Quiz | Test and strengthen developing knowledge |
| > 60% | Problem Solving | Challenge with harder, applied problems |
| Overconfident | Assessment Recheck | Recalibrate with a focused quiz |
| Never assessed | First Assessment | Benchmark true understanding |

Time is allocated proportional to the mastery gap, distributed across the student's available study window (configurable: 30 min to 3 hours).

---

## 5. AI-Generated Insights

The system generates both **rule-based** and **LLM-powered** insights from learning data.

### Rule-Based Insights (Deterministic)

These fire reliably based on clear conditions:

- **Overconfidence Alert:** "Chain Rule: Your confidence is 4.2/5 but accuracy is only 50%. Consider retaking the assessment."
- **Decay Warning:** "Taylor Series: It's been 14 days since your last interaction. Memory retention has dropped significantly."
- **Unmeasured Topic:** "Integration by Parts has 8 interactions but zero assessments. Take a quiz to benchmark your understanding."
- **Strength Recognition:** "Linear Algebra: 87.5% accuracy with well-calibrated confidence. You truly know this material."
- **Momentum:** "Probability Theory accuracy is trending upward — keep going!"

### LLM-Generated Insights (Deeper Analysis)

For nuanced patterns that rules can't capture, an LLM analyzes the full learning state and generates contextual insights. These are cached to prevent redundant API calls and ensure consistency.

Every insight includes:
- **What** the finding is
- **Why** it matters
- **What to do** about it (with a direct link to the relevant feature)

---

## 6. Multi-Agent System Architecture

EduFlow uses **24 specialized AI agents** organized into **7 modules**, each designed for a specific learning task. This multi-agent approach ensures:

- **Separation of concerns:** Each agent has a focused role with a tailored prompt
- **Maker-checker patterns:** Generation agents are validated by analysis agents
- **Quality control:** Multi-step pipelines prevent hallucination and ensure knowledge-grounding
- **Configurability:** All agent parameters (temperature, max tokens) are centralized in `config/agents.yaml`

### 6.1 Solve Module — 7 Agents (Temperature: 0.3)

**Purpose:** Step-by-step problem solving grounded in course materials.

**Architecture: Dual-Loop System**

```
┌─────────────────────────────────┐
│  ANALYSIS LOOP (Investigation)  │
│                                 │
│  InvestigateAgent ──► NoteAgent │
│       │                         │
│  Tools: RAG, Web Search,        │
│         Query Items             │
│  (max 3 iterations)             │
└────────────┬────────────────────┘
             │ investigation notes
             ▼
┌─────────────────────────────────┐
│  SOLVE LOOP (Solution)          │
│                                 │
│  ManagerAgent (orchestrator)    │
│       │                         │
│  SolveAgent ──► ToolAgent       │
│       │              │          │
│  ResponseAgent       │          │
│       │              │          │
│  PrecisionAnswerAgent           │
└─────────────────────────────────┘
```

**Why two loops?** The investigation phase gathers relevant context from knowledge bases and the web *before* attempting to solve. This prevents hallucination — the solver works with verified information, not guesses.

**Key agents:**
- **InvestigateAgent:** Searches knowledge bases and web for relevant context (max 1 action per round, 3 rounds)
- **NoteAgent:** Captures and organizes investigation findings
- **ManagerAgent:** Orchestrates the solve pipeline
- **SolveAgent:** Produces step-by-step mathematical/logical reasoning
- **ToolAgent:** Validates and executes tool calls during solving
- **ResponseAgent:** Formats the final structured response
- **PrecisionAnswerAgent:** Refines and verifies the final answer (configurable)

**Memory system:** `SolveMemory` (chain-of-thought), `InvestigateMemory` (tool results), `CitationMemory` (source tracking).

### 6.2 Research Module — 6 Agents (Temperature: 0.5)

**Purpose:** Deep, multi-step research on any topic, producing cited reports.

**Architecture: Three-Stage Pipeline**

```
PLANNING ──► RESEARCHING ──► REPORTING

Stage 1: Planning
  RephraseAgent ──► DecomposeAgent
  (clarify query)   (break into subtopics)

Stage 2: Researching
  ResearchAgent ──► NoteAgent
  (execute search)   (capture findings)
  [iterates over dynamic topic queue]

Stage 3: Reporting
  ReportingAgent
  (synthesize into cited report)
```

**Configurable presets:**

| Preset | Subtopics | Iterations | Min Section Length | Use Case |
|---|---|---|---|---|
| Quick | 1 | 1 | 300 chars | Fast answer |
| Medium | 5 | 4 | 500 chars | Balanced depth |
| Deep | 8 | 7 | 800 chars | Comprehensive report |
| Auto | Up to 8 | Flexible (6 max) | 500 chars | Agent decides |

**Tools available:** RAG (naive + hybrid), web search (Jina), paper search (arXiv), code execution (sandboxed).

**Dynamic topic queue:** As the ResearchAgent discovers new relevant subtopics during investigation, they're added to a queue (max 5 items) for further exploration. This enables emergent research depth.

### 6.3 Question Generation Module — 3 Agents (Temperature: 0.7)

**Purpose:** Generate quiz questions from course materials, validate them, and track assessment outcomes.

**Architecture: Retrieve-Generate-Validate Pipeline**

```
RetrieveAgent ──► GenerateAgent ──► RelevanceAnalyzer
  (fetch KB       (create question    (validate against
   context)        + answers)          knowledge base)
```

**Two modes:**

1. **Custom Generation:** Student specifies topic, difficulty, and question type. The system retrieves relevant chunks (top-k: 30) from the knowledge base, generates questions, and validates them against the KB for accuracy.

2. **Mimic Exam:** Student uploads a PDF exam paper. The system extracts reference questions, analyzes their structure, and generates similar questions grounded in the student's knowledge base — perfect for exam preparation.

**Maker-Checker pattern:** The RelevanceAnalyzer acts as a checker, ensuring generated questions are actually answerable from the student's materials (not hallucinated content).

**Batch management:** Questions are stored in batches with metadata (difficulty, type, validation results, KB coverage analysis) for later review.

### 6.4 Guided Learning Module — 4 Agents (Temperature: 0.5)

**Purpose:** Interactive, structured lessons generated from the student's own notebook content.

**Architecture: Session-Based Interactive Loop**

```
LocateAgent ──► InteractiveAgent ──► ChatAgent ──► SummaryAgent
  (find relevant    (generate HTML     (Q&A during     (session
   knowledge         lesson with        learning)       summary +
   points)           step-by-step                       progress)
                     navigation)
```

**How it works:**
1. Student selects a notebook record (e.g., a solved problem or research note)
2. **LocateAgent** identifies the key knowledge points within
3. **InteractiveAgent** generates a structured HTML lesson with step-by-step progression
4. **ChatAgent** handles questions during the lesson with contextual awareness
5. **SummaryAgent** generates a progress report at session end

**Session management:** Sessions track state (initialized → learning → completed), current knowledge point, and full chat history.

### 6.5 Co-Writer Module — 2 Agents (Temperature: 0.7)

**Purpose:** AI-powered writing assistance with voice narration.

- **EditAgent:** Analyzes writing for style, clarity, structure, and academic rigor. Provides inline suggestions.
- **NarratorAgent:** Converts text to speech using OpenAI TTS API with word-level synchronization (max 4000 chars per request).

### 6.6 IdeaGen Module — 2 Agents (Temperature: 0.7)

**Purpose:** Generate research ideas from study materials.

- **MaterialOrganizerAgent:** Extracts and structures knowledge points from notebook records
- **IdeaGenerationWorkflow:** Synthesizes connections across materials to suggest novel research directions

### 6.7 Chat Module

**Purpose:** Lightweight RAG-enhanced conversation for quick questions about course materials.

- @-mention syntax for knowledge base selection
- Real-time streaming responses
- Session management with persistent history
- Grounded in student's actual documents via RAG

---

## 7. RAG Pipeline & Knowledge Graph

### 7.1 Knowledge Base Management

Students upload their course materials (PDF, TXT, MD, DOCX, images) into knowledge bases. Each KB goes through a multi-stage processing pipeline:

```
Upload ──► Validation ──► Parsing ──► Chunking ──► Embedding ──► Indexing
                                                                    │
                                                         ┌──────────┴──────────┐
                                                         │                     │
                                                    Vector Index         Knowledge Graph
                                                  (dense search)     (entity-relation graph)
```

### 7.2 Three RAG Providers

| Provider | Strengths | Use Case |
|---|---|---|
| **LightRAG** | Knowledge graph extraction, entity-relation reasoning, local/global/hybrid search | Deep conceptual understanding, relationship queries |
| **RAGAnything** | Multimodal (PDF images, tables, diagrams), layout-aware via Docling | Document-heavy courses with visual content |
| **LlamaIndex** | Flexible chunking and embedding, broad format support | General-purpose fallback |

### 7.3 Knowledge Graph (LightRAG)

When a knowledge base is processed with LightRAG, it automatically extracts:

- **Entities:** Concepts, methods, data structures, organizations, technologies, people
- **Relations:** How entities connect (e.g., "Neural Network *is composed of* Artificial Neurons")
- **Descriptions:** Rich text descriptions synthesized from all mentions across documents

This produces a **GraphML** file that powers:

1. **Graph-aware RAG search:** Queries can traverse relationships, not just match keywords
2. **Visual knowledge graph:** The `/kg` page renders the full entity-relation network using Cytoscape.js

**KG Visualization features:**
- Interactive node-edge graph with force-directed layout
- Entity type color-coding (concept=violet, method=blue, data=cyan, organization=amber, technology=green)
- Search with highlight + dim (matching nodes glow, others fade)
- Entity type filter chips (toggle visibility by category)
- Click-to-inspect sidebar with entity label, type, and description
- Zoom controls (in/out/fit-to-screen)
- KB selector dropdown

### 7.4 Search Modes

| Mode | How It Works | Best For |
|---|---|---|
| **Naive** | Dense vector similarity search | Quick factual lookups |
| **Hybrid** | Dense vectors + BM25 lexical scoring | Balanced precision and recall |
| **Local** (LightRAG) | Direct entity matching in knowledge graph | Specific concept questions |
| **Global** (LightRAG) | Cross-document relationship traversal | "How does X relate to Y?" |

---

## 8. Data Visualization & Frontend Features

### 8.1 Learning Dashboard

The dashboard surfaces the full depth of the mastery engine through interactive visualizations:

**Overview Stats Grid:**
- Average mastery (BKT-computed, not raw scores)
- Total topics tracked
- Total learning activities
- At-risk topic count

**Activity Breakdown Donut Chart:**
- Color-coded by activity type (questions, problem solving, chat, assessments, guided learning)
- Counts and percentages per category

**Mastery Timeline Chart:**
- Area chart showing cumulative average mastery over time
- Daily snapshots with topics studied and interaction counts

**Topic Mastery Cards (expandable):**
- Mastery ring with color-coded level
- Learning velocity indicator (improving/declining/stable)
- Confidence calibration badges (overconfident/underconfident)
- Sessions-to-mastery estimate
- **Expanded view:** Full signal breakdown bar chart showing the exact contribution of BKT, engagement, retention, and calibration — with natural language explanations for each signal

**AI Insights Section:**
- Severity-coded insights (alerts, positives, warnings)
- Each insight links to a recommended action

**Personalized Study Plan:**
- Time-boxed schedule blocks with start/end times
- Activity type icons and mastery progress bars
- Direct links to the recommended learning tool

### 8.2 Knowledge Graph Explorer (`/kg`)

Full-page interactive visualization of the extracted knowledge graph with search, filter, zoom, and entity inspection capabilities. See Section 7.3 for details.

### 8.3 Question Generator (`/question`)

- Configuration form: knowledge point, difficulty (easy/medium/hard), question type (multiple choice/written), batch size
- Real-time generation progress via WebSocket
- Question display with correct answer, explanation, and KB coverage analysis
- Confidence rating (1-5) captured per question for calibration tracking
- **Mastery delta toast:** After submitting an answer, a toast notification shows the mastery change (e.g., "Mastery: 42% → 48% (+6%)") with spring animation

### 8.4 Smart Solver (`/solver`)

- Problem input with KB selection
- Real-time streaming solution with step-by-step reasoning
- Investigation logs showing what the agent searched and found
- Source citations linked to knowledge base chunks

### 8.5 Deep Research (`/research`)

- Mode selection (quick/medium/deep/auto)
- Real-time task tracking dashboard showing subtopic progress
- Tool usage indicators (RAG, web, papers, code)
- Final report with inline citations and section structure

### 8.6 Guided Learning (`/guide`)

- Notebook-based: select a record to learn from
- Step-by-step HTML lesson with navigation
- In-lesson Q&A chat
- Session history and progress summaries

### 8.7 Additional Tools

- **Co-Writer:** Markdown editor with AI editing suggestions and TTS narration
- **IdeaGen:** Research idea generation from notebook materials
- **Notebooks:** Organized collection of learning artifacts (solved problems, research reports, questions)
- **History:** Complete activity log across all features

---

## 9. Local-First Architecture & Privacy

### 9.1 Data Stays on Device

All user data is stored locally in the `data/` directory:

```
data/
├── knowledge_bases/          # Uploaded documents, embeddings, knowledge graphs
│   └── {kb_name}/
│       ├── raw/              # Original uploaded files
│       ├── rag_storage/      # Vector indices + GraphML knowledge graph
│       └── metadata.json     # KB configuration
│
└── user/                     # All user-generated data
    ├── logs/                 # Activity logs
    ├── performance/          # Learning analytics cache
    ├── question/             # Generated question batches
    ├── research/             # Research reports and caches
    ├── guide/                # Guided learning sessions
    ├── solve/                # Problem solving outputs
    ├── notebook/             # User notebooks
    ├── chat_sessions.json    # Chat history
    └── solver_sessions.json  # Solver history
```

### 9.2 What Leaves the Device

Only **LLM API calls** go to external services:

| Service | Purpose | Required? |
|---|---|---|
| OpenAI API (or other LLM) | Text generation, embeddings | Yes (configurable provider) |
| Jina API | Web search for research | Optional |
| arXiv API | Paper search for research | Optional |
| OpenAI TTS | Voice narration in Co-Writer | Optional |

**No telemetry. No user tracking. No cloud storage of student data.**

### 9.3 Provider Abstraction

The LLM provider is configurable through the settings UI. Students can switch between OpenAI, Anthropic, or other compatible providers without any data migration. The abstraction layer (`src/services/`) handles API differences transparently.

---

## 10. Responsible AI Design

### 10.1 Explainability

Every AI output in EduFlow is designed to be explainable:

- **Mastery scores** break down into 4 named signals, each with a natural language explanation
- **Study plans** explain *why* each topic was prioritized and *what activity* will help most
- **Insights** state the finding, the evidence, and the recommended action
- **Question validation** shows KB coverage analysis — which parts of the student's materials support the question
- **Research reports** include citations linking claims to specific sources

### 10.2 Consistency and Determinism

- **Mastery computation** is fully deterministic — same inputs always produce the same score
- **Rule-based insights** fire reliably on clear conditions
- **LLM-generated content** uses cached results to prevent contradictory outputs across refreshes
- **Agent temperatures** are tuned per module: low (0.3) for problem solving where precision matters, higher (0.7) for creative tasks like question generation

### 10.3 Bias and Fairness

- The mastery model is **topic-agnostic** — it applies the same BKT parameters regardless of subject
- Confidence calibration rewards self-awareness, not speed or volume
- The forgetting curve treats all students equally — no demographic assumptions
- Engagement credit ensures students who learn through different modalities (reading, chatting, problem-solving) all receive recognition

### 10.4 Human Agency and Override

- Students can **refresh insights** at any time to get updated analysis
- Study plans are **suggestions**, not mandates — students choose which activities to pursue
- Confidence ratings are **optional** — the system works without them (calibration signal defaults to 0)
- All generated content (questions, research, solutions) can be **saved to notebooks** for review and annotation
- The system **never auto-submits** or takes actions on behalf of the student

---

## 11. Technical Implementation

### 11.1 Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS |
| **Backend** | Python, FastAPI, WebSocket |
| **Charts** | Recharts (area, pie/donut charts) |
| **Graph Viz** | Cytoscape.js (force-directed network graphs) |
| **Animations** | Framer Motion |
| **RAG** | LightRAG, RAGAnything, LlamaIndex |
| **Embeddings** | OpenAI text-embedding-3-small |
| **LLM** | OpenAI GPT-4 / configurable provider |
| **Math** | KaTeX for LaTeX rendering |
| **Icons** | Lucide React |

### 11.2 Agent Configuration (Single Source of Truth)

All agent parameters are centralized in `config/agents.yaml`:

```yaml
solve:       { temperature: 0.3, max_tokens: 8192  }
research:    { temperature: 0.5, max_tokens: 12000 }
question:    { temperature: 0.7, max_tokens: 4096  }
guide:       { temperature: 0.5, max_tokens: 16192 }
ideagen:     { temperature: 0.7, max_tokens: 4096  }
co_writer:   { temperature: 0.7, max_tokens: 4096  }
narrator:    { temperature: 0.7, max_tokens: 4000  }
```

Tool configurations, iteration limits, and module-specific settings live in `config/main.yaml`.

### 11.3 Real-Time Communication

- **WebSocket streaming** for all long-running operations (solving, research, question generation, guided learning)
- **Progress broadcasting** with stage-level updates (e.g., "Researching subtopic 3/5")
- **Log interception** captures agent reasoning and streams it to the frontend for transparency

### 11.4 Key Architectural Patterns

| Pattern | Where Used | Why |
|---|---|---|
| **Maker-Checker** | Question generation (Generate → Validate) | Prevents hallucinated questions |
| **Dual-Loop** | Solver (Investigate → Solve) | Gathers evidence before reasoning |
| **Dynamic Queue** | Research (subtopic discovery) | Enables emergent depth |
| **Session State Machine** | Guided Learning (init → learning → complete) | Clean lifecycle management |
| **Lazy Initialization** | KB Manager, RAG Service | Fast startup, resources loaded on demand |
| **Singleton + Refresh** | Agent instances | Live config updates without restart |
| **Fire-and-Forget + Toast** | Assessment recording | Non-blocking UX with mastery feedback |

---

## 12. How We Address Every Evaluation Criterion

### Effective Support for Learning and Decision-Making

| Criterion | How We Address It |
|---|---|
| Actionable guidance | Study plans with specific activities, time allocations, and direct links |
| Personalized | BKT mastery model adapts to each student's unique performance pattern |
| Beyond correctness | Confidence calibration, forgetting curves, velocity tracking, engagement credit |

### Clarity of Design and Justification

| Criterion | How We Address It |
|---|---|
| Modeling decisions explained | 4-signal mastery model with named components and formulas |
| Architecture decisions explained | Multi-agent separation with clear rationale per module |
| Trade-offs acknowledged | Engagement credit capped at 20 to prevent gaming; BKT dominates at 55 points |

### Transparency and Interpretability

| Criterion | How We Address It |
|---|---|
| Understand why | Every mastery score decomposes into 4 explained signals |
| Trustworthy | BKT is a published, peer-reviewed model from educational research |
| Explainable | Natural language insight generation with evidence and actions |

### Creativity and Innovation

| Criterion | How We Address It |
|---|---|
| Beyond predicting correctness | Confidence calibration, forgetting curves, velocity, overconfidence detection |
| Agent-based approaches | 24 agents across 7 modules with maker-checker and dual-loop patterns |
| Multi-modal data | RAGAnything handles images, tables, diagrams in course materials |
| Interactive feedback | Guided learning with in-lesson Q&A; mastery toast on assessment |
| Knowledge graphs | Full entity-relation extraction with interactive visualization |

### Real-World Applicability

| Criterion | How We Address It |
|---|---|
| Weeks/months/years | Forgetting curve models long-term memory decay; velocity tracks trends |
| Long gaps in activity | Retention modifier penalizes decay, study plan prioritizes stale topics |
| Changing mastery | BKT updates continuously; velocity detects improvement or decline |
| Local-first | All data on student's machine; works offline after setup |

### Responsible AI

| Criterion | How We Address It |
|---|---|
| Explainability | 4-signal breakdown with natural language explanations per topic |
| Consistency | Deterministic mastery computation; cached LLM insights |
| Bias and fairness | Topic-agnostic model; no demographic assumptions |
| Privacy | Local-first storage; only LLM API calls leave device |
| Human agency | All outputs are suggestions; student controls all actions |

---

## 13. Summary

EduFlow AI transforms raw learning interactions into a living, adaptive model of what a student truly knows — then makes that model *visible*, *explainable*, and *actionable*.

**The stack:**
- **Bayesian Knowledge Tracing** separates genuine understanding from lucky guesses
- **Ebbinghaus forgetting curves** ensure stale knowledge gets flagged before exams
- **Confidence calibration** catches overconfident students before they fail
- **24 specialized AI agents** collaborate through maker-checker and dual-loop patterns
- **Knowledge graphs** reveal the structure of what you're learning
- **RAG pipelines** ground every AI output in your actual course materials
- **Local-first architecture** keeps your data private and under your control

The result: a learning companion that doesn't just track scores — it *understands* your learning, *explains* what's happening, and *guides* you toward mastery.
