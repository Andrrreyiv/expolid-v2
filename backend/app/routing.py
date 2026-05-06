"""Routing engine for auto-assigning contacts to team members (P1.7).

Conditions DSL (JSON):
  {"all": [<cond>, ...]}  // все условия должны выполниться
  {"any": [<cond>, ...]}  // хотя бы одно

<cond> = {"field": "<dotted_path>", "op": "<eq|neq|gte|lte|in|contains|regex>", "value": <any>}

Поля доступа:
  - status, contact_type, name, contact_company, email, phone, website, role_title,
    pavilion, stand, ai_score, capture_source
  - qualification_answers.<question_id> (dotted)

Действия (action_type):
  - "assign"      : action_data={"user_id": "..."}
  - "round_robin" : action_data={"user_ids": ["...","..."]}
  - "tag"         : action_data={"status": "hot"} (или другие поля контакта)
"""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session


def _get_field(contact, path: str) -> Any:
    if path.startswith("qualification_answers."):
        key = path[len("qualification_answers."):]
        ans = getattr(contact, "qualification_answers", None) or {}
        return ans.get(key)
    return getattr(contact, path, None)


def _eval_cond(contact, cond: dict) -> bool:
    field = cond.get("field")
    op = cond.get("op", "eq")
    expected = cond.get("value")
    actual = _get_field(contact, field) if field else None
    if op == "eq":
        return actual == expected
    if op == "neq":
        return actual != expected
    if op == "gte":
        try:
            return float(actual) >= float(expected)
        except (TypeError, ValueError):
            return False
    if op == "lte":
        try:
            return float(actual) <= float(expected)
        except (TypeError, ValueError):
            return False
    if op == "in":
        if isinstance(expected, list):
            return actual in expected
        return False
    if op == "contains":
        if actual is None:
            return False
        return str(expected).lower() in str(actual).lower()
    if op == "regex":
        if actual is None:
            return False
        try:
            return re.search(str(expected), str(actual)) is not None
        except re.error:
            return False
    return False


def _eval_conditions(contact, conditions: dict) -> bool:
    """Recursive evaluator for {"all": [...]} / {"any": [...]} / leaf cond."""
    if not conditions:
        return True
    if "all" in conditions:
        return all(_eval_conditions(contact, c) for c in conditions["all"])
    if "any" in conditions:
        return any(_eval_conditions(contact, c) for c in conditions["any"])
    if "field" in conditions:
        return _eval_cond(contact, conditions)
    return False


def apply_routing_rules(db: Session, contact, user) -> None:
    """Применяет правила маршрутизации к новому контакту. Мутирует contact in-place.

    Берёт активные правила компании по убыванию priority.
    Первое матчнувшееся правило применяет своё действие и останавливается.
    """
    from .models import RoutingRule, User as UserModel

    rules = (
        db.query(RoutingRule)
        .filter(
            RoutingRule.company_id == user.company_id,
            RoutingRule.is_active == True,  # noqa: E712
        )
        .order_by(RoutingRule.priority.desc(), RoutingRule.created_at.asc())
        .all()
    )
    for rule in rules:
        try:
            if not _eval_conditions(contact, rule.conditions or {}):
                continue
        except Exception:  # noqa: BLE001
            continue
        atype = rule.action_type
        adata = rule.action_data or {}
        if atype == "assign":
            uid = adata.get("user_id")
            if uid:
                ok = (
                    db.query(UserModel)
                    .filter(UserModel.id == uid, UserModel.company_id == user.company_id)
                    .first()
                )
                if ok:
                    contact.assigned_user_id = uid
                    return
        elif atype == "round_robin":
            uids = adata.get("user_ids") or []
            if uids:
                # Validate all belong to company
                valid = (
                    db.query(UserModel.id)
                    .filter(UserModel.id.in_(uids), UserModel.company_id == user.company_id)
                    .all()
                )
                # Preserve the user-configured order from action_data["user_ids"].
                # SQL IN() doesn't guarantee result ordering matches the input list,
                # so reorder by `uids` to keep round-robin assignment deterministic.
                valid_set = {v[0] for v in valid}
                valid_ids = [uid for uid in uids if uid in valid_set]
                if valid_ids:
                    idx = (rule.last_assigned_idx or 0) % len(valid_ids)
                    contact.assigned_user_id = valid_ids[idx]
                    rule.last_assigned_idx = idx + 1
                    return
        elif atype == "tag":
            # Whitelist of safe Contact fields the action can override.
            # NEVER include company_id/owner_user_id/id/created_at/etc. — those are
            # tenant-scoped or audit fields and must not be settable via routing rules.
            _SAFE_TAG_FIELDS = {"status", "contact_type", "pavilion", "stand"}
            for k, v in adata.items():
                if k in _SAFE_TAG_FIELDS:
                    setattr(contact, k, v)
            return
