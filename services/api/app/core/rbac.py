from enum import Enum
from fastapi import HTTPException, status


class Role(str, Enum):
    ADMIN = "admin"
    EDITOR = "editor"
    ANALYST = "analyst"
    VIEWER = "viewer"


ROLE_HIERARCHY = {
    Role.ADMIN: 4,
    Role.EDITOR: 3,
    Role.ANALYST: 2,
    Role.VIEWER: 1,
}

MODULE_PERMISSIONS: dict[str, Role] = {
    "triage:read": Role.VIEWER,
    "triage:write": Role.ANALYST,
    "investigation:read": Role.ANALYST,
    "investigation:write": Role.ANALYST,
    "verify:read": Role.ANALYST,
    "verify:write": Role.ANALYST,
    "brief:read": Role.ANALYST,
    "brief:write": Role.ANALYST,
    "brief:approve": Role.EDITOR,
    "admin:read": Role.ADMIN,
    "admin:write": Role.ADMIN,
    "adapter:manage": Role.ADMIN,
}


def require_role(required: Role):
    from fastapi import Depends
    from .auth import get_current_user

    def checker(current_user: dict = Depends(get_current_user)):
        user_role = Role(current_user.get("role", "viewer"))
        if ROLE_HIERARCHY.get(user_role, 0) < ROLE_HIERARCHY.get(required, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{required}' or higher required",
            )
        return current_user

    return checker
