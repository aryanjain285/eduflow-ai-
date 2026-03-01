"""
Learning State Router - Models a student's evolving learning state
and provides personalized, actionable guidance.

Analyzes all student interactions (solve, question, research, chat)
to compute topic mastery, track progress over time, and generate
AI-powered study recommendations.
"""

import json
import time
import math
from pathlib import Path
from fastapi import APIRouter

from src.api.utils.history import history_manager

router = APIRouter()

# Project root for accessing session data
PROJECT_ROOT = Path(__file__).resolve().parents[3]
USER_DATA_DIR = PROJECT_ROOT / "data" / "user"


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
    Extract topic interaction data from all history entries.
    Returns a dict of topic -> { attempts, successes, timestamps, type_counts }
    """
    topics: dict[str, dict] = {}

    for entry in entries:
        entry_type = entry.get("type", "")
        timestamp = entry.get("timestamp", time.time())
        content = entry.get("content", {})
        title = entry.get("title", "Unknown")

        # Extract topic from different activity types
        topic = None
        success = None

        if entry_type == "question":
            # Question generation - extract knowledge_point
            req = content.get("requirement", {})
            topic = req.get("knowledge_point") or req.get("focus") or title
            # Check if question was validated successfully
            validation = content.get("validation", {})
            if validation:
                success = validation.get("decision") == "approve"

        elif entry_type == "solve":
            # Solver - extract from title (the question asked)
            topic = title
            # If there's a complete response, consider it a learning interaction
            success = True  # Engaging with solver = learning

        elif entry_type == "research":
            # Research - extract topic
            topic = content.get("topic") or title
            success = True

        elif entry_type == "chat":
            topic = title
            success = True

        if topic:
            # Clean up topic name
            topic = topic.strip()[:80]  # Limit length

            if topic not in topics:
                topics[topic] = {
                    "attempts": 0,
                    "successes": 0,
                    "timestamps": [],
                    "types": {},
                    "last_interaction": 0,
                    "difficulty_levels": [],
                }

            topics[topic]["attempts"] += 1
            if success:
                topics[topic]["successes"] += 1
            topics[topic]["timestamps"].append(timestamp)
            topics[topic]["last_interaction"] = max(
                topics[topic]["last_interaction"], timestamp
            )

            # Count by type
            if entry_type not in topics[topic]["types"]:
                topics[topic]["types"][entry_type] = 0
            topics[topic]["types"][entry_type] += 1

            # Track difficulty if available
            if entry_type == "question":
                diff = content.get("requirement", {}).get("difficulty")
                if diff:
                    topics[topic]["difficulty_levels"].append(diff)

    return topics


def _compute_mastery(topic_data: dict) -> float:
    """
    Compute mastery score (0-100) for a topic considering:
    - Success rate
    - Recency (decay over time)
    - Number of interactions
    - Diversity of interaction types
    """
    attempts = topic_data["attempts"]
    successes = topic_data["successes"]
    last_interaction = topic_data["last_interaction"]
    type_count = len(topic_data["types"])

    # Base score from success rate (0-60 points)
    success_rate = successes / max(attempts, 1)
    base_score = success_rate * 60

    # Interaction volume bonus (0-20 points) - more practice = higher mastery
    volume_bonus = min(attempts * 4, 20)

    # Diversity bonus (0-10 points) - using multiple tools shows deeper learning
    diversity_bonus = min(type_count * 3, 10)

    # Recency factor (0-1.0) - mastery decays over time
    days_since = (time.time() - last_interaction) / 86400
    # Half-life of 14 days
    decay = math.exp(-0.05 * days_since)

    # Raw score before decay
    raw_score = base_score + volume_bonus + diversity_bonus
    # Apply decay but keep a floor of 20% of original
    final_score = raw_score * (0.2 + 0.8 * decay)

    return round(min(final_score, 100), 1)


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


def _generate_insights(topics: dict, mastery_scores: dict) -> list[dict]:
    """Generate explainable learning insights from topic data."""
    insights = []

    # Find weakest topics
    sorted_by_mastery = sorted(mastery_scores.items(), key=lambda x: x[1])
    weak_topics = [(t, s) for t, s in sorted_by_mastery if s < 50]

    if weak_topics:
        weakest = weak_topics[0]
        topic_data = topics.get(weakest[0], {})
        attempts = topic_data.get("attempts", 0)
        successes = topic_data.get("successes", 0)

        insights.append({
            "type": "weakness",
            "severity": "high" if weakest[1] < 30 else "medium",
            "title": f"Focus Area: {weakest[0]}",
            "description": f"You've interacted with this topic {attempts} times with a {round(successes/max(attempts,1)*100)}% success rate. Consider revisiting the fundamentals.",
            "topic": weakest[0],
            "score": weakest[1],
            "action": "Start a guided learning session on this topic",
            "action_link": "/guide",
        })

    # Find topics with declining mastery (high decay)
    for topic, data in topics.items():
        days_since = (time.time() - data["last_interaction"]) / 86400
        if days_since > 7 and mastery_scores.get(topic, 0) > 30:
            insights.append({
                "type": "decay",
                "severity": "medium",
                "title": f"Review Needed: {topic}",
                "description": f"It's been {int(days_since)} days since you last studied this topic. Your mastery may be declining.",
                "topic": topic,
                "days_inactive": int(days_since),
                "action": "Take a quick quiz to refresh",
                "action_link": "/question",
            })

    # Find strongest topics
    strong_topics = [(t, s) for t, s in sorted_by_mastery if s >= 70]
    if strong_topics:
        strongest = strong_topics[-1]
        insights.append({
            "type": "strength",
            "severity": "positive",
            "title": f"Strong Area: {strongest[0]}",
            "description": f"You're performing well here with {round(strongest[1])}% mastery. Keep it up!",
            "topic": strongest[0],
            "score": strongest[1],
            "action": "Challenge yourself with harder problems",
            "action_link": "/solver",
        })

    # Overconfidence detection placeholder
    # (Will be enhanced when confidence calibration data is available)

    # Activity pattern insight
    all_timestamps = []
    for data in topics.values():
        all_timestamps.extend(data["timestamps"])

    if all_timestamps:
        all_timestamps.sort()
        total_span_days = (all_timestamps[-1] - all_timestamps[0]) / 86400
        if total_span_days > 0:
            avg_per_day = len(all_timestamps) / total_span_days
            if avg_per_day < 1:
                insights.append({
                    "type": "consistency",
                    "severity": "medium",
                    "title": "Study More Consistently",
                    "description": f"You're averaging {round(avg_per_day, 1)} study interactions per day. Try to practice a little every day for better retention.",
                    "action": "Set a daily study goal",
                    "action_link": "/",
                })

    return insights[:6]  # Limit to 6 insights


def _build_timeline(topics: dict) -> list[dict]:
    """Build a timeline of mastery progression."""
    # Collect all timestamps across all topics
    all_events = []
    for topic, data in topics.items():
        for i, ts in enumerate(data["timestamps"]):
            all_events.append({
                "timestamp": ts,
                "topic": topic,
                "cumulative_attempts": i + 1,
                "cumulative_successes": min(i + 1, data["successes"]),
            })

    all_events.sort(key=lambda x: x["timestamp"])

    # Group by day and compute daily mastery snapshots
    daily_snapshots = []
    if all_events:
        current_day = None
        daily_topics: dict[str, dict] = {}

        for event in all_events:
            day = time.strftime("%Y-%m-%d", time.localtime(event["timestamp"]))

            if day != current_day:
                if current_day and daily_topics:
                    # Compute snapshot for previous day
                    avg_mastery = sum(
                        d["successes"] / max(d["attempts"], 1) * 100
                        for d in daily_topics.values()
                    ) / len(daily_topics)

                    daily_snapshots.append({
                        "date": current_day,
                        "mastery": round(avg_mastery, 1),
                        "topics_studied": len(daily_topics),
                        "total_interactions": sum(d["attempts"] for d in daily_topics.values()),
                    })

                current_day = day

            if event["topic"] not in daily_topics:
                daily_topics[event["topic"]] = {"attempts": 0, "successes": 0}
            daily_topics[event["topic"]]["attempts"] = event["cumulative_attempts"]
            daily_topics[event["topic"]]["successes"] = event["cumulative_successes"]

        # Don't forget the last day
        if current_day and daily_topics:
            avg_mastery = sum(
                d["successes"] / max(d["attempts"], 1) * 100
                for d in daily_topics.values()
            ) / len(daily_topics)

            daily_snapshots.append({
                "date": current_day,
                "mastery": round(avg_mastery, 1),
                "topics_studied": len(daily_topics),
                "total_interactions": sum(d["attempts"] for d in daily_topics.values()),
            })

    return daily_snapshots


def _generate_study_plan(topics: dict, mastery_scores: dict, hours: float = 2.0) -> list[dict]:
    """
    Generate a personalized study plan based on current mastery state.
    Prioritizes weak topics with high interaction history (student cares about them).
    """
    plan = []
    total_minutes = int(hours * 60)
    remaining_minutes = total_minutes

    # Score each topic by priority: low mastery + high attempts = highest priority
    priority_topics = []
    for topic, score in mastery_scores.items():
        data = topics.get(topic, {})
        attempts = data.get("attempts", 0)
        # Priority = inverse mastery * log(attempts + 1) to weight frequently studied weak topics
        priority = (100 - score) * math.log(attempts + 2)
        priority_topics.append((topic, score, priority, data))

    priority_topics.sort(key=lambda x: x[2], reverse=True)

    for topic, score, priority, data in priority_topics:
        if remaining_minutes <= 0:
            break

        level = _get_mastery_level(score)

        # Allocate time based on gap from mastery
        gap = 100 - score
        minutes = max(15, min(int(gap * 0.6), 45))
        minutes = min(minutes, remaining_minutes)

        # Suggest appropriate activity based on mastery level
        if score < 30:
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
            "topic": topic,
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


@router.get("/")
async def get_learning_state():
    """
    Get the current learning state with topic mastery,
    activity stats, and AI-generated insights.
    """
    # Load all history entries
    entries = history_manager.get_recent(limit=100)

    # Also load session data for richer analysis
    solver_sessions = _load_json_file(USER_DATA_DIR / "solver_sessions.json")
    chat_sessions = _load_json_file(USER_DATA_DIR / "chat_sessions.json")

    # Count sessions
    solver_count = len(solver_sessions) if isinstance(solver_sessions, list) else 0
    chat_count = len(chat_sessions) if isinstance(chat_sessions, list) else 0

    # Extract topics and compute mastery
    topics = _extract_topics_from_history(entries)
    mastery_scores = {topic: _compute_mastery(data) for topic, data in topics.items()}

    # Build topic details
    topic_details = []
    for topic, data in topics.items():
        score = mastery_scores.get(topic, 0)
        topic_details.append({
            "topic": topic,
            "mastery": score,
            "level": _get_mastery_level(score),
            "attempts": data["attempts"],
            "successes": data["successes"],
            "last_interaction": data["last_interaction"],
            "days_since_last": round((time.time() - data["last_interaction"]) / 86400, 1),
            "interaction_types": data["types"],
        })

    # Sort by mastery (lowest first for attention)
    topic_details.sort(key=lambda x: x["mastery"])

    # Compute overall stats
    total_interactions = sum(d["attempts"] for d in topics.values())
    avg_mastery = round(
        sum(mastery_scores.values()) / max(len(mastery_scores), 1), 1
    )

    # Generate insights
    insights = _generate_insights(topics, mastery_scores)

    # Build timeline
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
    """
    Get personalized study recommendations based on current learning state.
    Considers mastery levels, decay, and student interaction patterns.
    """
    entries = history_manager.get_recent(limit=100)
    topics = _extract_topics_from_history(entries)
    mastery_scores = {topic: _compute_mastery(data) for topic, data in topics.items()}

    plan = _generate_study_plan(topics, mastery_scores, hours)

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
