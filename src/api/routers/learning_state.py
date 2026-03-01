"""
Learning State Router - Multi-Signal Adaptive Mastery Engine

Models a student's evolving learning state using Bayesian Knowledge Tracing (BKT)
combined with exposure credit, retention decay, and confidence calibration.

Four signals contribute to mastery:
  1. BKT Mastery Probability (0-55 pts) — from assessment outcomes
  2. Exposure Credit (0-20 pts) — from engagement activities
  3. Retention Decay (±15 pts) — Ebbinghaus forgetting curve
  4. Confidence Calibration (±10 pts) — metacognitive accuracy
"""

import json
import time
import math
import hashlib
import logging
from pathlib import Path
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from src.api.utils.history import history_manager, ActivityType

logger = logging.getLogger(__name__)

router = APIRouter()

# Project root for accessing session data
PROJECT_ROOT = Path(__file__).resolve().parents[3]
USER_DATA_DIR = PROJECT_ROOT / "data" / "user"
CACHE_DIR = USER_DATA_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── Insights Cache ───────────────────────────────────────────────────
INSIGHTS_CACHE_FILE = CACHE_DIR / "insights_cache.json"
INSIGHTS_CACHE_TTL = 3600  # 1 hour


def _load_insights_cache() -> dict | None:
    """Load cached insights if still valid."""
    try:
        if INSIGHTS_CACHE_FILE.exists():
            with open(INSIGHTS_CACHE_FILE, encoding="utf-8") as f:
                cache = json.load(f)
            if time.time() - cache.get("timestamp", 0) < INSIGHTS_CACHE_TTL:
                return cache
    except Exception:
        pass
    return None


def _save_insights_cache(insights: list[dict], data_hash: str):
    """Save insights to cache."""
    try:
        with open(INSIGHTS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": time.time(),
                "data_hash": data_hash,
                "insights": insights,
            }, f, indent=2)
    except Exception:
        pass


def _hash_topic_data(topics: dict) -> str:
    """Create a hash of topic data to detect changes."""
    summary = {}
    for name, data in topics.items():
        summary[name] = {
            "a": len(data["assessments"]),
            "e": len(data["exposures"]),
            "c": sum(1 for a in data["assessments"] if a["is_correct"]),
        }
    return hashlib.md5(json.dumps(summary, sort_keys=True).encode()).hexdigest()

# ── BKT Default Parameters ──────────────────────────────────────────
P_L0 = 0.1   # Prior: probability of initial mastery
P_T = 0.15   # Probability of learning transition (unlearned → learned)
P_G = 0.25   # Probability of guessing correctly when NOT learned
P_S = 0.10   # Probability of slipping (wrong answer when learned)


# ── Request / Response Models ────────────────────────────────────────
class AssessmentRequest(BaseModel):
    knowledge_base_id: str = ""
    question_text: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    confidence: int = Field(default=3, ge=1, le=5)
    difficulty: str = "medium"
    question_type: str = "choice"
    topic: str
    time_taken_ms: int | None = None


# ── Helpers ──────────────────────────────────────────────────────────
def _load_json_file(filepath: Path) -> dict | list:
    """Safely load a JSON file."""
    try:
        if filepath.exists():
            with open(filepath, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _extract_topics_from_history(entries: list[dict]) -> dict:
    """
    Extract per-topic data from all history entries.
    Separates assessment entries from exposure entries.
    Returns dict of topic -> {assessments, exposures, timestamps, types, ...}
    """
    topics: dict[str, dict] = {}

    for entry in entries:
        entry_type = entry.get("type", "")
        timestamp = entry.get("timestamp", time.time())
        content = entry.get("content", {})
        title = entry.get("title", "Unknown")

        topic = None

        if entry_type == "assessment":
            # Assessment entry — rich metadata
            topic = content.get("topic") or title
            topic = topic.strip()[:80]

            if topic not in topics:
                topics[topic] = _empty_topic()

            topics[topic]["assessments"].append({
                "is_correct": content.get("is_correct", False),
                "confidence": content.get("confidence", 3),
                "difficulty": content.get("difficulty", "medium"),
                "question_type": content.get("question_type", "choice"),
                "timestamp": timestamp,
            })
            topics[topic]["timestamps"].append(timestamp)
            topics[topic]["last_interaction"] = max(
                topics[topic]["last_interaction"], timestamp
            )
            _inc_type(topics[topic], entry_type)
            continue

        # Non-assessment entries → exposure only
        if entry_type == "question":
            req = content.get("requirement", {})
            topic = req.get("knowledge_point") or req.get("focus") or title
        elif entry_type == "solve":
            topic = title
        elif entry_type == "research":
            topic = content.get("topic") or title
        elif entry_type == "chat":
            topic = title

        if topic:
            topic = topic.strip()[:80]
            if topic not in topics:
                topics[topic] = _empty_topic()

            topics[topic]["exposures"].append({
                "type": entry_type,
                "timestamp": timestamp,
            })
            topics[topic]["timestamps"].append(timestamp)
            topics[topic]["last_interaction"] = max(
                topics[topic]["last_interaction"], timestamp
            )
            _inc_type(topics[topic], entry_type)

            # Track difficulty if available from question generation
            if entry_type == "question":
                diff = content.get("requirement", {}).get("difficulty")
                if diff:
                    topics[topic]["difficulty_levels"].append(diff)

    return topics


def _empty_topic() -> dict:
    return {
        "assessments": [],
        "exposures": [],
        "timestamps": [],
        "types": {},
        "last_interaction": 0,
        "difficulty_levels": [],
    }


def _inc_type(topic_data: dict, entry_type: str):
    topic_data["types"][entry_type] = topic_data["types"].get(entry_type, 0) + 1


# ── Signal 1: Bayesian Knowledge Tracing ─────────────────────────────
def _compute_bkt(assessments: list[dict]) -> float:
    """
    Run BKT over chronological assessment outcomes.
    Returns P(Learned) in [0, 1].
    """
    if not assessments:
        return 0.0

    # Sort chronologically
    sorted_assessments = sorted(assessments, key=lambda a: a["timestamp"])

    p_l = P_L0  # prior

    for obs in sorted_assessments:
        is_correct = obs["is_correct"]
        q_type = obs.get("question_type", "choice")
        difficulty = obs.get("difficulty", "medium")

        # Adjust guess probability by question type and difficulty
        p_g = P_G
        if q_type == "choice":
            p_g = 0.25  # 1/4 for MCQ
        else:
            p_g = 0.05  # written answers — very low guess rate

        # Adjust by difficulty
        if difficulty == "easy":
            p_g = min(p_g * 1.5, 0.5)
        elif difficulty == "hard":
            p_g = p_g * 0.5

        p_s = P_S

        # Bayesian update
        if is_correct:
            p_l_posterior = (p_l * (1 - p_s)) / (
                p_l * (1 - p_s) + (1 - p_l) * p_g
            )
        else:
            p_l_posterior = (p_l * p_s) / (
                p_l * p_s + (1 - p_l) * (1 - p_g)
            )

        # Learning transition
        p_l = p_l_posterior + (1 - p_l_posterior) * P_T

    return p_l


# ── Signal 2: Exposure Credit ────────────────────────────────────────
def _compute_exposure_credit(exposures: list[dict]) -> float:
    """Credit for engagement activities. Max 20 points."""
    return min(len(exposures) * 3, 20)


# ── Signal 3: Retention Decay ────────────────────────────────────────
def _compute_retention_modifier(assessments: list[dict]) -> float:
    """
    Ebbinghaus-inspired retention modifier (±15 points).
    Based on time since last correct assessment.
    """
    if not assessments:
        return 0.0

    correct_assessments = [a for a in assessments if a["is_correct"]]
    if not correct_assessments:
        return 0.0

    last_correct_ts = max(a["timestamp"] for a in correct_assessments)
    days_since = (time.time() - last_correct_ts) / 86400

    # Stability increases with number of correct retrievals (spaced repetition)
    num_correct = len(correct_assessments)
    stability = 2 + num_correct * 1.5  # base stability of 2 days, grows with practice

    # Ebbinghaus: retention = e^(-t/S)
    retention = math.exp(-days_since / stability)

    # Map retention [0,1] → modifier [-15, +15]
    if days_since < 2:
        return 15.0
    elif days_since <= 7:
        return 5 + 10 * retention
    elif days_since <= 14:
        return -5 + 10 * retention
    else:
        return -15 + 10 * retention


# ── Signal 4: Confidence Calibration ─────────────────────────────────
def _compute_calibration_modifier(assessments: list[dict]) -> float:
    """
    Compare average confidence with actual accuracy (±10 points).
    Well-calibrated → bonus; overconfident → penalty.
    """
    if not assessments:
        return 0.0

    confidences = [a.get("confidence", 3) for a in assessments]
    correct_count = sum(1 for a in assessments if a["is_correct"])

    avg_confidence_normalized = (sum(confidences) / len(confidences)) / 5.0  # normalize to [0, 1]
    accuracy = correct_count / len(assessments)

    # calibration = 10 * (1 - 2 * |confidence_norm - accuracy|)
    calibration = 10 * (1 - 2 * abs(avg_confidence_normalized - accuracy))
    return max(-10, min(10, calibration))


# ── Combined Mastery Computation ─────────────────────────────────────
def _compute_mastery(topic_data: dict) -> dict:
    """
    Compute mastery score (0-100) from 4 signals.
    Returns full breakdown for transparency.
    """
    assessments = topic_data["assessments"]
    exposures = topic_data["exposures"]

    # Signal 1: BKT
    p_l = _compute_bkt(assessments)
    bkt_score = p_l * 55

    # Signal 2: Exposure Credit
    exposure_credit = _compute_exposure_credit(exposures)

    # Signal 3: Retention Decay
    retention_mod = _compute_retention_modifier(assessments)

    # Signal 4: Confidence Calibration
    calibration_mod = _compute_calibration_modifier(assessments)

    # Final
    raw = bkt_score + exposure_credit + retention_mod + calibration_mod
    mastery = max(0, min(100, raw))

    return {
        "mastery": round(mastery, 1),
        "bkt_score": round(bkt_score, 1),
        "exposure_credit": round(exposure_credit, 1),
        "retention_mod": round(retention_mod, 1),
        "calibration_mod": round(calibration_mod, 1),
        "p_learned": round(p_l, 3),
    }


def _get_mastery_level(score: float) -> str:
    """Get human-readable mastery level."""
    if score >= 80:
        return "mastered"
    if score >= 60:
        return "proficient"
    if score >= 40:
        return "developing"
    if score >= 20:
        return "beginner"
    return "needs_attention"


# ── Velocity ─────────────────────────────────────────────────────────
def _compute_learning_velocity(assessments: list[dict]) -> dict:
    """
    Compute learning velocity from assessment trend.
    Requires ≥4 assessments.
    """
    if len(assessments) < 4:
        return {"direction": "stable", "delta": 0.0, "sessions_to_mastery": None}

    sorted_a = sorted(assessments, key=lambda a: a["timestamp"])
    mid = len(sorted_a) // 2

    first_half = sorted_a[:mid]
    second_half = sorted_a[mid:]

    first_acc = sum(1 for a in first_half if a["is_correct"]) / len(first_half)
    second_acc = sum(1 for a in second_half if a["is_correct"]) / len(second_half)

    delta = second_acc - first_acc

    if delta > 0.1:
        direction = "improving"
    elif delta < -0.1:
        direction = "declining"
    else:
        direction = "stable"

    # Predict sessions to mastery (P_L reaching 0.8)
    sessions_to_mastery = None
    if direction == "improving" and delta > 0:
        current_p_l = _compute_bkt(sorted_a)
        if current_p_l < 0.8:
            # Rough extrapolation: how many more correct answers needed
            remaining = 0.8 - current_p_l
            gain_per_session = delta / max(len(second_half), 1)
            if gain_per_session > 0:
                sessions_to_mastery = max(1, int(remaining / gain_per_session))

    return {
        "direction": direction,
        "delta": round(delta, 3),
        "sessions_to_mastery": sessions_to_mastery,
    }


# ── Confidence Calibration Detail ────────────────────────────────────
def _compute_confidence_calibration(assessments: list[dict]) -> dict:
    """Per-topic confidence calibration details."""
    if not assessments:
        return {
            "score": 0.0,
            "avg_confidence": 0.0,
            "accuracy": 0.0,
            "is_overconfident": False,
            "is_underconfident": False,
        }

    confidences = [a.get("confidence", 3) for a in assessments]
    correct_count = sum(1 for a in assessments if a["is_correct"])

    avg_confidence = sum(confidences) / len(confidences)
    accuracy = correct_count / len(assessments)
    avg_conf_norm = avg_confidence / 5.0

    calibration = 10 * (1 - 2 * abs(avg_conf_norm - accuracy))
    calibration = max(-10, min(10, calibration))

    is_overconfident = avg_confidence >= 3.5 and accuracy < 0.4
    is_underconfident = avg_confidence <= 2.0 and accuracy > 0.7

    return {
        "score": round(calibration, 1),
        "avg_confidence": round(avg_confidence, 1),
        "accuracy": round(accuracy, 3),
        "is_overconfident": is_overconfident,
        "is_underconfident": is_underconfident,
    }


# ── Explanation Generator ────────────────────────────────────────────
def _build_explanation(topic: str, mastery_result: dict, assessments: list[dict]) -> str:
    """Build a human-readable explanation of the mastery score."""
    mastery = mastery_result["mastery"]
    total_assessments = len(assessments)
    correct = sum(1 for a in assessments if a["is_correct"])

    parts = [f"Mastery {mastery}%"]

    if total_assessments > 0:
        parts.append(f"{correct}/{total_assessments} correct (BKT: {mastery_result['p_learned']:.2f})")
    else:
        parts.append("no assessments yet")

    if mastery_result["exposure_credit"] > 0:
        parts.append(f"engagement +{mastery_result['exposure_credit']}")

    if mastery_result["retention_mod"] != 0:
        sign = "+" if mastery_result["retention_mod"] > 0 else ""
        parts.append(f"retention {sign}{mastery_result['retention_mod']}")

    if mastery_result["calibration_mod"] != 0:
        sign = "+" if mastery_result["calibration_mod"] > 0 else ""
        parts.append(f"calibration {sign}{mastery_result['calibration_mod']}")

    return ": ".join(parts[:2]) + (", " + ", ".join(parts[2:]) if len(parts) > 2 else "")


# ── LLM-Powered Insights ────────────────────────────────────────────
async def _generate_insights_llm(topics: dict, mastery_results: dict) -> list[dict]:
    """
    Generate insights using LLM analysis of student performance data.
    Falls back to rule-based insights if LLM call fails.
    """
    # Build data summary for LLM
    topic_summaries = []
    for topic_name, data in topics.items():
        mr = mastery_results.get(topic_name, {})
        assessments = data["assessments"]
        total_a = len(assessments)
        correct_a = sum(1 for a in assessments if a["is_correct"])
        velocity = _compute_learning_velocity(assessments)
        calibration = _compute_confidence_calibration(assessments)

        topic_summaries.append({
            "topic": topic_name,
            "mastery": mr.get("mastery", 0),
            "level": _get_mastery_level(mr.get("mastery", 0)),
            "assessments_total": total_a,
            "assessments_correct": correct_a,
            "accuracy": round(correct_a / total_a, 2) if total_a > 0 else None,
            "exposure_count": len(data["exposures"]),
            "velocity": velocity["direction"],
            "is_overconfident": calibration["is_overconfident"],
            "is_underconfident": calibration["is_underconfident"],
            "avg_confidence": calibration["avg_confidence"],
            "bkt_probability": mr.get("p_learned", 0),
        })

    if not topic_summaries:
        return []

    try:
        from src.services.llm import complete
        from src.services.llm.config import get_llm_config

        config = get_llm_config()

        data_str = json.dumps(topic_summaries, indent=2)
        prompt = f"""Analyze this student's learning performance data and generate 3-5 actionable insights.

Student Performance Data:
{data_str}

For each insight, return a JSON object with these fields:
- "type": one of "weakness", "strength", "decay", "overconfidence", "velocity", "consistency"
- "severity": "high", "medium", or "positive"
- "title": short title (e.g., "Focus Area: Topic Name")
- "description": 1-2 sentences, specific and encouraging. Reference actual data.
- "action": concrete next step the student should take
- "action_link": one of "/question", "/guide", "/solver"

Be specific about topics. Flag overconfidence as a risk. If a topic has high exposure but no assessments, recommend taking a quiz.
If a topic is declining, prioritize review.

Return ONLY a JSON array of insight objects, no other text."""

        system_prompt = (
            "You are a learning analytics expert. You analyze student performance data "
            "and generate personalized, actionable insights. Be encouraging but honest. "
            "Flag overconfidence as a real risk. Suggest concrete next steps."
        )

        response = await complete(
            prompt=prompt,
            system_prompt=system_prompt,
            model=config.model,
            api_key=config.api_key,
            base_url=config.base_url,
            api_version=config.api_version,
            temperature=0.7,
            max_tokens=1500,
        )

        # Parse JSON from response
        response = response.strip()
        if response.startswith("```"):
            # Strip markdown code fences
            lines = response.split("\n")
            response = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

        insights = json.loads(response)
        if isinstance(insights, list) and len(insights) > 0:
            # Validate and normalize
            valid_insights = []
            for ins in insights[:6]:
                if isinstance(ins, dict) and "title" in ins and "description" in ins:
                    valid_insights.append({
                        "type": ins.get("type", "consistency"),
                        "severity": ins.get("severity", "medium"),
                        "title": ins["title"],
                        "description": ins["description"],
                        "topic": ins.get("topic", ""),
                        "action": ins.get("action", "Continue learning"),
                        "action_link": ins.get("action_link", "/question"),
                    })
            if valid_insights:
                return valid_insights

    except Exception as e:
        logger.warning(f"LLM insight generation failed, using rule-based fallback: {e}")

    # Fallback: rule-based insights
    return _generate_insights_rules(topics, mastery_results)


def _generate_insights_rules(topics: dict, mastery_results: dict) -> list[dict]:
    """Rule-based insight generation (fallback)."""
    insights = []
    mastery_scores = {t: mr.get("mastery", 0) for t, mr in mastery_results.items()}

    sorted_by_mastery = sorted(mastery_scores.items(), key=lambda x: x[1])

    # Weakest topics
    weak_topics = [(t, s) for t, s in sorted_by_mastery if s < 50]
    if weak_topics:
        weakest = weak_topics[0]
        data = topics.get(weakest[0], _empty_topic())
        total_a = len(data["assessments"])
        correct_a = sum(1 for a in data["assessments"] if a["is_correct"])

        if total_a == 0:
            desc = f"You've engaged with this topic {len(data['exposures'])} times but haven't been assessed. Take a quiz to measure your understanding."
            action = "Take a quiz to measure understanding"
        else:
            desc = f"You've answered {correct_a}/{total_a} correctly. Consider revisiting the fundamentals."
            action = "Start a guided learning session"

        insights.append({
            "type": "weakness",
            "severity": "high" if weakest[1] < 30 else "medium",
            "title": f"Focus Area: {weakest[0]}",
            "description": desc,
            "topic": weakest[0],
            "action": action,
            "action_link": "/guide" if total_a > 0 else "/question",
        })

    # Topics with exposure but no assessments
    for topic_name, data in topics.items():
        if len(data["exposures"]) >= 3 and len(data["assessments"]) == 0:
            insights.append({
                "type": "weakness",
                "severity": "medium",
                "title": f"Unmeasured: {topic_name}",
                "description": f"You've engaged with this topic {len(data['exposures'])} times but haven't tested yourself. Take a quiz to see where you stand.",
                "topic": topic_name,
                "action": "Take a quiz to measure understanding",
                "action_link": "/question",
            })

    # Overconfidence detection
    for topic_name, data in topics.items():
        cal = _compute_confidence_calibration(data["assessments"])
        if cal["is_overconfident"]:
            insights.append({
                "type": "overconfidence",
                "severity": "high",
                "title": f"Overconfidence Alert: {topic_name}",
                "description": f"Your average confidence is {cal['avg_confidence']}/5 but accuracy is {cal['accuracy']:.0%}. This gap suggests you may be overestimating your understanding.",
                "topic": topic_name,
                "action": "Review fundamentals and retake assessment",
                "action_link": "/question",
            })

    # Decay / review needed
    for topic_name, data in topics.items():
        days_since = (time.time() - data["last_interaction"]) / 86400
        if days_since > 7 and mastery_scores.get(topic_name, 0) > 30:
            insights.append({
                "type": "decay",
                "severity": "medium",
                "title": f"Review Needed: {topic_name}",
                "description": f"It's been {int(days_since)} days since you last studied this topic. Your mastery may be declining.",
                "topic": topic_name,
                "action": "Take a quick quiz to refresh",
                "action_link": "/question",
            })

    # Strengths
    strong_topics = [(t, s) for t, s in sorted_by_mastery if s >= 70]
    if strong_topics:
        strongest = strong_topics[-1]
        insights.append({
            "type": "strength",
            "severity": "positive",
            "title": f"Strong Area: {strongest[0]}",
            "description": f"You're performing well here with {round(strongest[1])}% mastery. Keep it up!",
            "topic": strongest[0],
            "action": "Challenge yourself with harder problems",
            "action_link": "/solver",
        })

    # Velocity insights
    for topic_name, data in topics.items():
        vel = _compute_learning_velocity(data["assessments"])
        if vel["direction"] == "improving":
            insights.append({
                "type": "velocity",
                "severity": "positive",
                "title": f"Improving: {topic_name}",
                "description": f"Your accuracy is trending upward! Keep practicing to reach mastery.",
                "topic": topic_name,
                "action": "Continue with practice quizzes",
                "action_link": "/question",
            })
        elif vel["direction"] == "declining":
            insights.append({
                "type": "velocity",
                "severity": "high",
                "title": f"Declining: {topic_name}",
                "description": f"Your recent answers are less accurate than before. Consider reviewing the material.",
                "topic": topic_name,
                "action": "Review with guided learning",
                "action_link": "/guide",
            })

    return insights[:6]


# ── Study Plan ───────────────────────────────────────────────────────
def _generate_study_plan(topics: dict, mastery_results: dict, hours: float = 2.0) -> list[dict]:
    """
    Generate a study plan prioritizing:
    - Low BKT mastery + high exposure (studied but not assessed)
    - Overconfident topics (recommend assessment first)
    - Topics due for review based on retention decay
    """
    plan = []
    total_minutes = int(hours * 60)
    remaining_minutes = total_minutes

    mastery_scores = {t: mr.get("mastery", 0) for t, mr in mastery_results.items()}

    priority_topics = []
    for topic_name, score in mastery_scores.items():
        data = topics.get(topic_name, _empty_topic())
        cal = _compute_confidence_calibration(data["assessments"])
        vel = _compute_learning_velocity(data["assessments"])

        # Priority = inverse mastery, boosted by overconfidence and declining velocity
        priority = (100 - score)
        if cal["is_overconfident"]:
            priority *= 1.5
        if vel["direction"] == "declining":
            priority *= 1.3
        if len(data["exposures"]) > 0 and len(data["assessments"]) == 0:
            priority *= 1.2  # studied but never assessed

        priority_topics.append((topic_name, score, priority, data, cal))

    priority_topics.sort(key=lambda x: x[2], reverse=True)

    for topic_name, score, priority, data, cal in priority_topics:
        if remaining_minutes <= 0:
            break

        level = _get_mastery_level(score)
        gap = 100 - score
        minutes = max(15, min(int(gap * 0.6), 45))
        minutes = min(minutes, remaining_minutes)

        # Choose activity based on state
        if cal["is_overconfident"]:
            activity = "practice"
            activity_label = "Assessment Check"
            reason = f"Your confidence ({cal['avg_confidence']}/5) exceeds your accuracy ({cal['accuracy']:.0%}). Test yourself to calibrate."
            link = "/question"
        elif len(data["assessments"]) == 0 and len(data["exposures"]) >= 2:
            activity = "practice"
            activity_label = "First Assessment"
            reason = f"You've engaged {len(data['exposures'])} times but never been assessed. Take a quiz to measure your understanding."
            link = "/question"
        elif score < 30:
            activity = "guided_learning"
            activity_label = "Guided Learning"
            reason = f"Your mastery is at {score}%. Start with structured, step-by-step learning to build foundations."
            link = "/guide"
        elif score < 60:
            activity = "practice"
            activity_label = "Practice Quiz"
            reason = f"At {score}% mastery, active recall through quizzes will strengthen your understanding."
            link = "/question"
        else:
            activity = "challenge"
            activity_label = "Problem Solving"
            reason = f"You're at {score}% mastery. Challenge yourself with harder problems to push to full mastery."
            link = "/solver"

        plan.append({
            "topic": topic_name,
            "mastery": score,
            "level": level,
            "minutes": minutes,
            "activity": activity,
            "activity_label": activity_label,
            "reason": reason,
            "link": link,
        })

        remaining_minutes -= minutes

    return plan


# ── Timeline ─────────────────────────────────────────────────────────
def _build_timeline(topics: dict) -> list[dict]:
    """Build a timeline of mastery progression."""
    all_events = []
    for topic, data in topics.items():
        for i, ts in enumerate(data["timestamps"]):
            all_events.append({
                "timestamp": ts,
                "topic": topic,
            })

    all_events.sort(key=lambda x: x["timestamp"])

    daily_snapshots = []
    if all_events:
        current_day = None
        day_topics: set[str] = set()
        day_count = 0

        for event in all_events:
            day = time.strftime("%Y-%m-%d", time.localtime(event["timestamp"]))

            if day != current_day:
                if current_day:
                    daily_snapshots.append({
                        "date": current_day,
                        "topics_studied": len(day_topics),
                        "total_interactions": day_count,
                        "mastery": 0,  # Will be filled after
                    })
                current_day = day
                day_topics = set()
                day_count = 0

            day_topics.add(event["topic"])
            day_count += 1

        # Last day
        if current_day:
            daily_snapshots.append({
                "date": current_day,
                "topics_studied": len(day_topics),
                "total_interactions": day_count,
                "mastery": 0,
            })

    return daily_snapshots


# ── Endpoints ────────────────────────────────────────────────────────
@router.post("/record-assessment")
async def record_assessment(req: AssessmentRequest):
    """
    Record an assessment outcome from the question page.
    Returns updated mastery for the topic.
    """
    content = {
        "question_text": req.question_text,
        "user_answer": req.user_answer,
        "correct_answer": req.correct_answer,
        "is_correct": req.is_correct,
        "confidence": req.confidence,
        "difficulty": req.difficulty,
        "question_type": req.question_type,
        "topic": req.topic,
        "knowledge_base_id": req.knowledge_base_id,
    }
    if req.time_taken_ms is not None:
        content["time_taken_ms"] = req.time_taken_ms

    history_manager.add_entry(
        activity_type=ActivityType.ASSESSMENT,
        title=req.topic,
        content=content,
        summary=f"{'Correct' if req.is_correct else 'Incorrect'}: {req.question_text[:80]}",
    )

    # Compute updated mastery for the topic
    entries = history_manager.get_recent(limit=100)
    topics = _extract_topics_from_history(entries)
    topic_data = topics.get(req.topic, _empty_topic())
    mastery_result = _compute_mastery(topic_data)

    return {
        "status": "recorded",
        "topic": req.topic,
        "is_correct": req.is_correct,
        "mastery": mastery_result["mastery"],
        "level": _get_mastery_level(mastery_result["mastery"]),
    }


@router.get("/")
async def get_learning_state(refresh: bool = Query(False, description="Force refresh LLM insights")):
    """
    Get the current learning state with topic mastery,
    activity stats, and AI-generated insights.

    Pass ?refresh=true to force-regenerate LLM insights.
    Otherwise cached insights are returned if available.
    """
    entries = history_manager.get_recent(limit=100)

    # Session data
    solver_sessions = _load_json_file(USER_DATA_DIR / "solver_sessions.json")
    chat_sessions = _load_json_file(USER_DATA_DIR / "chat_sessions.json")
    solver_count = len(solver_sessions) if isinstance(solver_sessions, list) else 0
    chat_count = len(chat_sessions) if isinstance(chat_sessions, list) else 0

    # Extract topics and compute mastery
    topics = _extract_topics_from_history(entries)
    mastery_results = {topic: _compute_mastery(data) for topic, data in topics.items()}
    mastery_scores = {t: mr["mastery"] for t, mr in mastery_results.items()}

    # Build topic details with full breakdown
    topic_details = []
    for topic_name, data in topics.items():
        mr = mastery_results.get(topic_name, _compute_mastery(_empty_topic()))
        score = mr["mastery"]
        assessments = data["assessments"]
        total_a = len(assessments)
        correct_a = sum(1 for a in assessments if a["is_correct"])
        accuracy = correct_a / total_a if total_a > 0 else 0.0
        avg_conf = (
            sum(a.get("confidence", 3) for a in assessments) / total_a
            if total_a > 0
            else 0.0
        )

        velocity = _compute_learning_velocity(assessments)
        calibration = _compute_confidence_calibration(assessments)
        explanation = _build_explanation(topic_name, mr, assessments)

        topic_details.append({
            "topic": topic_name,
            "mastery": score,
            "level": _get_mastery_level(score),
            "attempts": len(data["exposures"]) + total_a,
            "successes": correct_a + len(data["exposures"]),  # backward compat
            "last_interaction": data["last_interaction"],
            "days_since_last": round((time.time() - data["last_interaction"]) / 86400, 1) if data["last_interaction"] > 0 else 999,
            "interaction_types": data["types"],
            "mastery_breakdown": {
                "bkt_score": mr["bkt_score"],
                "exposure_credit": mr["exposure_credit"],
                "retention_mod": mr["retention_mod"],
                "calibration_mod": mr["calibration_mod"],
            },
            "assessment_stats": {
                "total": total_a,
                "correct": correct_a,
                "accuracy": round(accuracy, 3),
                "avg_confidence": round(avg_conf, 1),
            },
            "velocity": velocity,
            "calibration": calibration,
            "explanation": explanation,
        })

    topic_details.sort(key=lambda x: x["mastery"])

    # Overall stats
    total_interactions = sum(
        len(d["exposures"]) + len(d["assessments"]) for d in topics.values()
    )
    avg_mastery = round(
        sum(mastery_scores.values()) / max(len(mastery_scores), 1), 1
    )

    # Insights — use cache unless refresh requested or data changed
    data_hash = _hash_topic_data(topics)
    insights = None

    if not refresh:
        cache = _load_insights_cache()
        if cache and cache.get("data_hash") == data_hash:
            insights = cache["insights"]

    if insights is None:
        insights = await _generate_insights_llm(topics, mastery_results)
        _save_insights_cache(insights, data_hash)

    # Timeline
    timeline = _build_timeline(topics)

    # Activity breakdown
    type_breakdown = {}
    for data in topics.values():
        for t, count in data["types"].items():
            type_breakdown[t] = type_breakdown.get(t, 0) + count

    return {
        "overview": {
            "total_topics": len(topics),
            "total_interactions": total_interactions,
            "average_mastery": avg_mastery,
            "solver_sessions": solver_count,
            "chat_sessions": chat_count,
            "topics_mastered": len([s for s in mastery_scores.values() if s >= 80]),
            "topics_needs_attention": len([s for s in mastery_scores.values() if s < 40]),
        },
        "topics": topic_details,
        "mastery_scores": mastery_scores,
        "insights": insights,
        "timeline": timeline,
        "activity_breakdown": type_breakdown,
    }


@router.get("/recommendations")
async def get_study_recommendations(hours: float = 2.0):
    """Get personalized study recommendations based on current learning state."""
    entries = history_manager.get_recent(limit=100)
    topics = _extract_topics_from_history(entries)
    mastery_results = {topic: _compute_mastery(data) for topic, data in topics.items()}

    plan = _generate_study_plan(topics, mastery_results, hours)

    return {
        "study_hours": hours,
        "plan": plan,
        "total_planned_minutes": sum(item["minutes"] for item in plan),
    }


@router.get("/timeline")
async def get_learning_timeline():
    """Get mastery progression timeline data."""
    entries = history_manager.get_recent(limit=100)
    topics = _extract_topics_from_history(entries)
    timeline = _build_timeline(topics)
    return {"timeline": timeline}
